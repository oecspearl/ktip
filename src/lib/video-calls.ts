/**
 * Calls started from /collaborate/video (migration 202). Pure helpers, so the
 * page and the tests share one reading of what the database returns.
 */

export interface VideoCallInfo {
  id: string
  title: string | null
  hostName: string | null
  isHost: boolean
  locked: boolean
  ended: boolean
  createdAt: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A call id is a UUID; anything else in `?call=` is a broken link. */
export function isCallId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** The link someone pastes to bring a person into the call. */
export function callLink(origin: string, callId: string): string {
  return `${origin.replace(/\/+$/, '')}/collaborate/video?call=${encodeURIComponent(callId)}`
}

/** What video_call_info() returns, read defensively. Null for anything malformed. */
export function parseVideoCallInfo(raw: unknown): VideoCallInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isCallId(typeof r.id === 'string' ? r.id : null)) return null
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    id: r.id as string,
    title: text(r.title),
    hostName: text(r.host_name),
    isHost: r.is_host === true,
    locked: r.locked === true,
    ended: r.ended === true,
    createdAt: text(r.created_at),
  }
}

export type CallRefusal =
  | 'student'
  | 'suspended'
  | 'not_found'
  | 'ended'
  | 'locked'
  | 'too_many'
  | 'not_host'
  | 'not_signed_in'
  | 'unknown'

/**
 * The reason behind a refusal from 202's functions or the token route, so the
 * page can say it in the reader's language. The functions raise English
 * sentences; matching them here keeps the SQL readable in the editor.
 */
export function callRefusal(error: unknown): CallRefusal {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (message.includes('student')) return 'student'
  if (message.includes('suspended')) return 'suspended'
  if (message.includes('not found')) return 'not_found'
  if (message.includes('ended')) return 'ended'
  if (message.includes('locked')) return 'locked'
  if (message.includes('too many')) return 'too_many'
  if (message.includes('only the person who started')) return 'not_host'
  if (message.includes('not authenticated') || message.includes('not signed in') || message.includes('unauthorized'))
    return 'not_signed_in'
  return 'unknown'
}
