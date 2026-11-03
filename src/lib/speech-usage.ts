/**
 * Browser captions and read-aloud, reported to the usage ledger (199).
 *
 * Both run on the browser's own speech engines, so they cost nothing; the
 * report exists so organisers can see who relies on them. The server accepts
 * one report per person, room and kind every 45 seconds, so the meter adds up
 * locally and sends at most once a minute.
 */

export type SpeechUsageKind = 'caption_speech_seconds' | 'read_aloud_chars'

/** A segment can sit in interim for a long pause; never bill more than this. */
export const MAX_SEGMENT_SECONDS = 30

export const FLUSH_MS = 60_000

export interface UsageMeter {
  add(amount: number): void
  /** Sends whatever has built up. Returns the amount sent, 0 when nothing. */
  flush(): number
}

export function createUsageMeter(send: (amount: number) => void): UsageMeter {
  let pending = 0
  return {
    add(amount) {
      if (Number.isFinite(amount) && amount > 0) pending += amount
    },
    flush() {
      const amount = Math.round(pending)
      pending = 0
      if (amount <= 0) return 0
      send(amount)
      return amount
    },
  }
}

/** Seconds of speech in one caption segment, from its first interim to its final. */
export function segmentSeconds(startedAt: number | null, endedAt: number): number {
  if (startedAt === null || endedAt <= startedAt) return 0
  return Math.min((endedAt - startedAt) / 1000, MAX_SEGMENT_SECONDS)
}
