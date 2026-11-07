import { createClient } from '@supabase/supabase-js'
import { RoomServiceClient } from 'livekit-server-sdk'

/**
 * Ends a call started from /collaborate/video (migration 202) for everyone.
 *
 * Two steps, in this order:
 *   1. set_video_call_state(id, end) as the caller. The creator check lives in
 *      that function, so a non-creator is refused here with its own message
 *      and nothing reaches LiveKit.
 *   2. Delete the LiveKit room. A LiveKit connection outlives the join token
 *      that opened it, so marking the row ended only stops new joins; deleting
 *      the room is what disconnects the people already in it.
 *
 * Node runtime, like api/venue/room-recording.ts: RoomService is a twirp call
 * that livekit-server-sdk owns, and the SDK targets Node.
 *
 * Responses: 401 unsigned, 400 bad body, 403 refused by the function (its
 * message passes through), 503 not configured, 200 { ok, disconnected }.
 * `disconnected: false` means the row is ended but the LiveKit room could not
 * be closed (usually because nobody was in it); nobody new can join either way.
 */

export const config = { runtime: 'nodejs' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** The LiveKit REST host, derived from the wss:// URL the browser dials. */
function apiHost(url: string): string {
  return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/+$/, '')
}

// A method-named export, not a default: on the Node runtime Vercel calls a
// default export with Node's (req, res). See room-recording.ts.
export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const livekitUrl = process.env.VITE_LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!supabaseUrl || !anonKey || !livekitUrl || !apiKey || !apiSecret) {
    return json({ error: 'Server configuration error' }, 503)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let body: { callId?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const callId = body.callId
  if (typeof callId !== 'string' || !callId) return json({ error: 'callId is required' }, 400)

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { error } = await caller.rpc('set_video_call_state', {
    p_call_id: callId,
    p_locked: null,
    p_end: true,
  })
  if (error) return json({ error: error.message }, 403)

  // The room name is the call id (202), the same name room-token.ts signed.
  let disconnected = false
  try {
    await new RoomServiceClient(apiHost(livekitUrl), apiKey, apiSecret).deleteRoom(callId)
    disconnected = true
  } catch (err) {
    // An empty room has usually been closed by LiveKit already, which reads
    // as "not found". The call is ended in the database either way.
    console.warn('[call/end] deleteRoom failed', err)
  }

  return json({ ok: true, disconnected })
}
