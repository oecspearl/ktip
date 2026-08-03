import { createClient } from '@supabase/supabase-js'
import { createAccessToken } from '../_lib/livekit-token'

export const config = { runtime: 'edge' }

/**
 * Mints a LiveKit join token for one member in one venue room.
 *
 * This route decides nothing. Every rule — is the room open, does this venue
 * role have the door, is the room full, may this person turn a camera on — is
 * answered by `venue_room_grant()` (migration 101), which is the same set of
 * checks `enter_venue_room()` makes and which RLS already trusts. All that
 * happens here is: prove who is asking, ask Postgres what they may do, and sign
 * it. A permission the client chooses is not a permission, and a permission
 * restated in TypeScript is a second copy that drifts.
 *
 * Deliberately NOT a Supabase Edge Function, which is what docs/VIDEO-SETUP.md
 * originally specified. There is no supabase/functions directory in this repo —
 * all 26 serverless routes are Vercel edge handlers under api/, reached
 * same-origin through the rewrites in vercel.json, which is why none of them
 * carry CORS headers. Following the doc literally would have added a second
 * serverless runtime and a cross-origin surface for no benefit. The doc has been
 * corrected.
 *
 * Also unlike the admin routes: no `requirePermission`, and no service-role
 * client. There is no platform permission that corresponds to "may join this
 * call" — venue membership is the authorisation, and the RPC checks it while
 * running as the caller. Minting an RLS-bypassing key to answer a question the
 * caller's own token can answer would be blast radius for nothing.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Thirty minutes.
 *
 * Short because permissions change and a token is a snapshot of them: closing a
 * room, muting a speaker, or dropping someone's venue role should take effect on
 * the next join rather than in six hours. The client refreshes at 25 minutes so
 * nobody is dropped mid-sentence.
 */
const TOKEN_TTL_SECONDS = 30 * 60

interface RoomGrant {
  room: string
  identity: string
  can_subscribe: boolean
  can_publish: boolean
  can_publish_data: boolean
  is_host: boolean
  recording: boolean
  audio_mode: string
  max_publishers: number
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  // Checked before authorising, so a deployment missing a key fails as a
  // configuration error rather than masquerading as a permission error — the
  // same ordering require-permission.ts uses.
  if (!supabaseUrl || !anonKey || !apiKey || !apiSecret) {
    return json({ error: 'Server configuration error' }, 503)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let body: { roomId?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const roomId = body.roomId
  if (typeof roomId !== 'string' || !roomId) {
    return json({ error: 'roomId is required' }, 400)
  }

  // The caller's own JWT, so auth.uid() inside the function is them and not a
  // service role. That is what makes the grant trustworthy.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { data, error } = await caller.rpc('venue_room_grant', { p_room_id: roomId })

  if (error) {
    // Every message the RPC raises is one of the room's real rules — "this room
    // is closed", "not a member of this venue", "this room is not open to
    // spectator". Passing it through means the UI can say what actually
    // happened instead of a generic denial, and it is safe to surface: none of
    // them reveal anything the member could not already see on the map.
    return json({ error: error.message }, 403)
  }

  const grant = data as RoomGrant | null
  if (!grant) return json({ error: 'No grant returned' }, 403)

  const token = await createAccessToken({
    apiKey,
    apiSecret,
    // The venue member id, not a display name: identities must be stable and
    // unique, and two people called "Alex" would otherwise collide.
    identity: grant.identity,
    name: user.user_metadata?.display_name || undefined,
    grant: {
      // The room UUID, never the slug or the display name. Ids do not change
      // when a host renames a room mid-event, and a rename must not split a
      // call in half.
      room: grant.room,
      roomJoin: true,
      canSubscribe: grant.can_subscribe,
      canPublish: grant.can_publish,
      canPublishData: grant.can_publish_data,
    },
    ttlSeconds: TOKEN_TTL_SECONDS,
  })

  // The grant travels back alongside the token so the UI can explain itself —
  // "this room is listen-only" reads very differently from a camera button that
  // silently does nothing.
  return json({ token, grant, expiresIn: TOKEN_TTL_SECONDS })
}
