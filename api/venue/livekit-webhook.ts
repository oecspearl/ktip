import { verifyWebhook, usageActionsFor } from '../_lib/livekit-webhook'
import { applyUsageActions, serviceClient } from '../_lib/venue-usage'

export const config = { runtime: 'edge' }

/**
 * LiveKit webhooks: call minutes and screen share minutes for the usage
 * ledger (migration 193).
 *
 * The browser cannot be trusted to say how long it was in a call, so the
 * media server says it instead. Four events matter:
 *
 *   participant_joined   opens a call session (also the "in calls now" count)
 *   participant_left     closes it and records call_seconds, from LiveKit's
 *                        own joinedAt when present
 *   track_published      opens a screen share session (SCREEN_SHARE video only)
 *   track_unpublished    closes it and records screen_share_seconds
 *
 * Room name is the venue room id and identity is the user id, both set by
 * api/venue/room-token.ts. Anything else (egress, agents, other rooms) is
 * ignored with a 200 so LiveKit does not retry it.
 *
 * SETUP (LiveKit Cloud dashboard)
 * -------------------------------
 *   1. Project > Settings > Webhooks > Create new webhook.
 *   2. URL: https://<your domain>/api/venue/livekit-webhook
 *   3. Signing key: pick the SAME API key whose key and secret are set as
 *      LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel. LiveKit signs with
 *      that key's secret; a different key fails verification with a 401.
 *   4. Save. LiveKit sends every event type; this route picks the four above.
 *
 * Needs SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) and
 * VITE_SUPABASE_URL, like the other service-role routes. No vercel.json entry:
 * every file under api/ is a route.
 *
 * Responses: 401 for anything unsigned or tampered with, 503 when the server
 * is not configured, 500 when the ledger write failed (LiveKit retries, and
 * the event id makes the retry idempotent), 200 otherwise.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) return json({ error: 'Server configuration error' }, 503)

  // The exact bytes, never re-serialised JSON: the signed hash is over these.
  const raw = new Uint8Array(await request.arrayBuffer())

  const verified = await verifyWebhook(raw, request.headers.get('authorization'), {
    apiKey,
    apiSecret,
  })
  if (!verified.ok) return json({ error: 'Unauthorized' }, 401)

  const actions = usageActionsFor(verified.event)
  if (actions.length === 0) return json({ ok: true, recorded: 0 })

  const db = serviceClient()
  if (!db) return json({ error: 'Server configuration error' }, 503)

  try {
    await applyUsageActions(db, actions)
  } catch (err) {
    console.error('[livekit-webhook] ledger write failed', err)
    return json({ error: 'Could not record usage' }, 500)
  }

  return json({ ok: true, recorded: actions.length })
}
