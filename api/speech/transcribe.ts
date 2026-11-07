import { createClient } from '@supabase/supabase-js'
import { afterResponse, serviceClient, type EdgeContext } from '../_lib/venue-usage'
import { billedSeconds, speechAllowanceVerdict, tokenSubject, whisperText } from '../_lib/speech-allowance'

export const config = { runtime: 'edge' }

/**
 * One spoken phrase in, its text out, through Groq's free Whisper (203).
 *
 * Captions use the browser's own speech recognition wherever it exists. This
 * route serves the browsers that have none (Firefox): they record each phrase
 * between pauses and post it here. The text goes back to the speaker, who
 * translates and broadcasts it the same way as browser captions.
 *
 * Every phrase is checked against speech_allowance() first, because Groq's
 * free tier is one daily allowance for the whole organisation. Usage is
 * recorded here from the duration Whisper reports, so the meter does not
 * depend on what a browser says about itself.
 *
 * Request: multipart/form-data with `audio` (the phrase), `lang` (en|fr|es)
 * and `roomId` (the LiveKit room name). Responses: 503 not configured,
 * 401 not signed in, 400 bad input, 403 { reason: 'suspended' | 'not_in_room' },
 * 429 { reason: 'day_cap' | 'user_day_cap' | 'busy' }, 502 Groq refused,
 * 200 { text }.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const GROQ_TRANSCRIBE = 'https://api.groq.com/openai/v1/audio/transcriptions'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A phrase is at most a few seconds of Opus; anything this big is not one. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024
const LANGS = new Set(['en', 'fr', 'es'])

export default async function handler(request: Request, context?: EdgeContext): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const groqKey = process.env.GROQ_API_KEY
  const db = serviceClient()
  if (!supabaseUrl || !anonKey || !groqKey || !db) {
    return json({ error: 'Speech captions are not configured' }, 503)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'Expected multipart form data' }, 400)
  }
  const audio = form.get('audio')
  const lang = String(form.get('lang') ?? '')
  const roomId = String(form.get('roomId') ?? '')
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return json({ error: 'audio is missing or too large' }, 400)
  }
  if (!LANGS.has(lang) || !UUID.test(roomId)) return json({ error: 'lang or roomId is invalid' }, 400)

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  // Verifying the token and reading the allowance are two round trips, and a
  // caption waits on both. The allowance is looked up for the id the token
  // claims while the token is verified, and counts only when the verified id
  // is the same.
  const claimed = tokenSubject(authHeader)
  const [
    {
      data: { user },
    },
    lookup,
  ] = await Promise.all([
    caller.auth.getUser(),
    claimed
      ? db.rpc('speech_allowance', { p_user: claimed, p_room_id: roomId })
      : Promise.resolve({ data: null, error: null }),
  ])
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { data: allowance, error } =
    user.id === claimed ? lookup : await db.rpc('speech_allowance', { p_user: user.id, p_room_id: roomId })
  if (error) {
    console.error('[speech/transcribe] allowance check failed', error)
    return json({ error: 'Could not check the speech allowance' }, 503)
  }
  const verdict = speechAllowanceVerdict(allowance, {
    daySeconds: process.env.WHISPER_DAILY_SECONDS,
    dayRequests: process.env.WHISPER_DAILY_REQUESTS,
  })
  if (verdict === 'suspended' || verdict === 'not_in_room') {
    return json({ error: 'Not allowed to caption here', reason: verdict }, 403)
  }
  if (verdict !== 'ok') return json({ error: 'The free speech allowance is used up', reason: verdict }, 429)

  const upstream = new FormData()
  const type = audio.type || 'audio/webm'
  upstream.append('file', audio, type.includes('ogg') ? 'phrase.ogg' : 'phrase.webm')
  upstream.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo')
  upstream.append('language', lang)
  upstream.append('response_format', 'verbose_json')
  upstream.append('temperature', '0')

  const res = await fetch(GROQ_TRANSCRIBE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: upstream,
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after'))
    return json({ error: 'Busy', reason: 'busy', retryAfter: Number.isFinite(retry) ? retry : 5 }, 429)
  }
  if (!res.ok) {
    console.error('[speech/transcribe] Groq refused', res.status, (await res.text().catch(() => '')).slice(0, 200))
    return json({ error: 'The speech service refused the phrase' }, 502)
  }

  const body = (await res.json().catch(() => ({}))) as { text?: unknown; segments?: unknown; duration?: unknown }

  // Recorded whether or not any words came back: Groq counted the audio either
  // way. Written after the answer has gone, so the caption does not wait on
  // it; a failed write is logged.
  afterResponse(
    context,
    (async () => {
      const { error: usageError } = await db.rpc('record_venue_usage', {
        p_room_id: roomId,
        p_user_id: user.id,
        p_kind: 'speech_seconds',
        p_amount: billedSeconds(body.duration),
        p_meta: { engine: 'whisper' },
      })
      if (usageError) console.error('[speech/transcribe] usage write failed', usageError)
    })()
  )

  return json({ text: whisperText(body) })
}
