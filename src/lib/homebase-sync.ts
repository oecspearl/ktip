/**
 * Small pure helpers for the Homebase workspace (migrations 190 and 194).
 * Kept out of the components so they can be tested without a browser editor.
 */

/** Base64 for Yjs updates: they are bytes, and broadcast and TEXT want strings. */
export function toB64(bytes: Uint8Array): string {
  let s = ''
  // In chunks: spreading a large update into one fromCharCode call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Stored in team_state.timer (migration 194). */
export interface TimerState {
  label?: string
  duration_s?: number
  /** ISO time the current run started; absent or null while paused. */
  started_at?: string | null
  /** Seconds left when last paused or started. */
  left_s?: number
}

/**
 * Seconds left on a shared timer. Every browser computes this from the same
 * start time, so the countdown agrees across the team without a ticking
 * message on the channel.
 */
export function secondsLeft(s: TimerState, now = Date.now()): number {
  const left = s.left_s ?? s.duration_s ?? 0
  if (!s.started_at) return Math.max(0, left)
  const started = new Date(s.started_at).getTime()
  if (Number.isNaN(started)) return Math.max(0, left)
  return Math.max(0, left - Math.floor((now - started) / 1000))
}
