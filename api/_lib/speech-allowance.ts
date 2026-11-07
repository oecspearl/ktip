/**
 * Whether one more spoken phrase may go to Groq's Whisper (migration 203).
 *
 * Groq's free tier for Whisper is shared by the whole organisation and resets
 * every UTC day: about 2,000 requests and 28,800 audio seconds (eight hours),
 * with each request billed as at least ten seconds. The defaults stop short
 * of both, so phrases already in flight never meet a hard refusal, and give
 * each person an hour a day so one open microphone cannot use everyone's day.
 * A paid Groq tier raises them through the env vars below.
 */

export const DEFAULT_DAY_SECONDS = 7 * 60 * 60
export const DEFAULT_DAY_REQUESTS = 1_800
export const USER_DAY_SECONDS = 60 * 60
/** Groq bills every request as at least this many seconds of audio. */
export const MIN_BILLED_SECONDS = 10

export type SpeechAllowanceVerdict = 'ok' | 'suspended' | 'not_in_room' | 'day_cap' | 'user_day_cap'

/** A positive number from the env, or the default. */
export function limitFromEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Reads what speech_allowance() returns. Anything malformed refuses. */
export function speechAllowanceVerdict(
  raw: unknown,
  env: { daySeconds?: string; dayRequests?: string } = {}
): SpeechAllowanceVerdict {
  if (!raw || typeof raw !== 'object') return 'day_cap'
  const r = raw as Record<string, unknown>
  if (r.suspended === true) return 'suspended'
  if (r.can_caption !== true) return 'not_in_room'
  const userDay = Number(r.user_day_seconds)
  const daySeconds = Number(r.day_seconds)
  const dayRequests = Number(r.day_requests)
  if (![userDay, daySeconds, dayRequests].every(Number.isFinite)) return 'day_cap'
  if (daySeconds >= limitFromEnv(env.daySeconds, DEFAULT_DAY_SECONDS)) return 'day_cap'
  if (dayRequests >= limitFromEnv(env.dayRequests, DEFAULT_DAY_REQUESTS)) return 'day_cap'
  if (userDay >= USER_DAY_SECONDS) return 'user_day_cap'
  return 'ok'
}

/** The seconds a phrase costs against Groq's daily audio allowance. */
export function billedSeconds(duration: unknown): number {
  const value = Number(duration)
  return Math.max(MIN_BILLED_SECONDS, Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0)
}

interface WhisperSegment {
  text?: unknown
  no_speech_prob?: unknown
}

/**
 * The text of a Whisper answer, without what it hallucinates on near-silence.
 * Whisper fills quiet audio with stock phrases ("Thank you.", "Thanks for
 * watching!"); its own no_speech_prob flags those segments.
 */
export function whisperText(body: { text?: unknown; segments?: unknown }): string {
  const segments = Array.isArray(body.segments) ? (body.segments as WhisperSegment[]) : null
  if (!segments) return typeof body.text === 'string' ? body.text.trim() : ''
  return segments
    .filter((s) => !(Number(s.no_speech_prob) > 0.6))
    .map((s) => (typeof s.text === 'string' ? s.text.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .trim()
}
