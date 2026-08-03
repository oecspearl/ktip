import { createClient } from '@supabase/supabase-js'
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from 'livekit-server-sdk'

/**
 * Recording a venue room, via LiveKit Egress.
 *
 * NOTE THE RUNTIME. Every other route in api/ is edge; this one is Node, and it
 * is the only one. Egress is exactly the case the comment in
 * api/_lib/livekit-token.ts anticipated: signing a join token is forty lines of
 * Web Crypto, but starting an egress is a protobuf-over-twirp call whose wire
 * format is not something to hand-roll from memory. `livekit-server-sdk` owns
 * that, and it targets Node — so the route moves rather than the format being
 * guessed at.
 *
 * Authorisation is the same shape as room-token.ts: ask venue_room_grant()
 * (migration 101) as the caller, and trust nothing the client said. Two things
 * must both be true to touch a recording — the caller is a host of this venue,
 * and the room itself has `recording_enabled`. A host cannot start recording a
 * room the organiser did not mark as recorded, which is what makes the red dot
 * in AvStage and the consent notice honest: they are driven by the same column.
 *
 * No new table. LiveKit already knows which egresses are running, so `listEgress`
 * is the source of truth rather than a status column that can drift from it.
 */

export const config = { runtime: 'nodejs' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

interface RoomGrant {
  room: string
  is_host: boolean
  recording: boolean
}

/** The LiveKit REST host, derived from the wss:// URL the browser dials. */
function apiHost(url: string): string {
  return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/+$/, '')
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const livekitUrl = process.env.VITE_LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!supabaseUrl || !anonKey || !livekitUrl || !apiKey || !apiSecret) {
    return json({ error: 'Server configuration error' }, 503)
  }

  // Storage is checked separately from LiveKit, because it fails separately and
  // the fix is somewhere else entirely. "Recording storage is not configured" is
  // an actionable message; a generic 503 sends someone to the wrong dashboard.
  const bucket = process.env.RECORDING_S3_BUCKET
  const accessKey = process.env.RECORDING_S3_ACCESS_KEY
  const secret = process.env.RECORDING_S3_SECRET
  const region = process.env.RECORDING_S3_REGION || 'auto'
  const endpoint = process.env.RECORDING_S3_ENDPOINT || undefined

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let body: { roomId?: unknown; action?: unknown; egressId?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const roomId = body.roomId
  const action = body.action
  if (typeof roomId !== 'string' || !roomId) return json({ error: 'roomId is required' }, 400)
  if (action !== 'start' && action !== 'stop' && action !== 'status') {
    return json({ error: 'action must be start, stop or status' }, 400)
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { data, error } = await caller.rpc('venue_room_grant', { p_room_id: roomId })
  if (error) return json({ error: error.message }, 403)

  const grant = data as RoomGrant | null
  if (!grant) return json({ error: 'No grant returned' }, 403)

  // Only a host may touch a recording. Deliberately checked here and not only in
  // the UI: hiding a button is a suggestion, and this is the thing that makes it
  // a rule.
  if (!grant.is_host) return json({ error: 'Only a host can record this room' }, 403)
  if (!grant.recording) {
    return json({ error: 'Recording is not enabled for this room' }, 403)
  }

  const egress = new EgressClient(apiHost(livekitUrl), apiKey, apiSecret)

  try {
    if (action === 'status') {
      const active = await egress.listEgress({ roomName: grant.room, active: true })
      return json({ active: active.map((info) => ({ egressId: info.egressId, status: info.status })) })
    }

    if (action === 'stop') {
      const egressId = body.egressId
      if (typeof egressId !== 'string' || !egressId) {
        return json({ error: 'egressId is required to stop' }, 400)
      }
      const info = await egress.stopEgress(egressId)
      return json({ egressId: info.egressId, status: info.status })
    }

    if (!bucket || !accessKey || !secret) {
      return json({ error: 'Recording storage is not configured' }, 503)
    }

    // Starting twice would produce two files and two bills for the same room.
    // Cheaper to ask than to reconcile afterwards.
    const already = await egress.listEgress({ roomName: grant.room, active: true })
    if (already.length > 0) {
      return json({ egressId: already[0].egressId, status: already[0].status, alreadyRunning: true })
    }

    // Room id in the path, not the name: a host renaming a room mid-event must
    // not scatter one recording across two folders. The timestamp makes a second
    // recording of the same room a second file rather than an overwrite.
    const filepath = `venue/${grant.room}/${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`

    const info = await egress.startRoomCompositeEgress(
      grant.room,
      new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath,
        output: {
          case: 's3',
          value: new S3Upload({
            accessKey,
            secret,
            bucket,
            region,
            ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
          }),
        },
      }),
      // `grid` rather than the room's own camera mode: a recording is watched
      // later by somebody who was not there, and the host's spotlight choice was
      // about the live room, not the archive.
      { layout: 'grid' }
    )

    return json({ egressId: info.egressId, status: info.status, filepath })
  } catch (err) {
    // The message is LiveKit's — "no participants in room", a storage
    // rejection — and a host who just pressed Record needs to read it.
    console.error('[room-recording] egress failed', err)
    return json({ error: err instanceof Error ? err.message : 'Recording failed' }, 502)
  }
}
