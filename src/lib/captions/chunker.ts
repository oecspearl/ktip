/**
 * Cuts a browser recogniser's running transcript into pieces that can be
 * translated while the speaker is still talking.
 *
 * The browser only calls a phrase final after a pause, and someone who talks
 * without stopping can go ten or twenty seconds without one. Until then every
 * listener waits for the translation. But the recogniser rewrites only the
 * last few words of its guess: words that have stood unchanged for a moment
 * are settled. This commits settled words in pieces of a few words, and when
 * the final text arrives, returns only what was not already sent.
 *
 * Words are the unit, because recognisers in Chrome, Edge and Safari add no
 * punctuation to mark anything finer.
 */

export interface ChunkerOptions {
  /** A word is settled once it has not changed for this long. */
  stableMs: number
  /** The newest words are always held back; the recogniser still revises them. */
  holdBack: number
  /** A piece is sent as soon as this many settled words are waiting. */
  fullWords: number
  /** A shorter piece is sent once it has waited this long since the last one. */
  maxWaitMs: number
  /** Never send fewer words than this before the final text. */
  minWords: number
}

export const DEFAULT_CHUNKER: ChunkerOptions = {
  stableMs: 600,
  holdBack: 2,
  fullWords: 8,
  maxWaitMs: 2_500,
  minWords: 3,
}

export interface CaptionChunker {
  /** Feed the latest interim text. Returns a piece to send now, or null. */
  interim(text: string, now: number): string | null
  /** The words of `text` not yet sent, for the speaker's own screen. */
  unsent(text: string): string
  /** The final text of the phrase. Returns what was not already sent, and starts over. */
  final(text: string): string
  reset(): void
}

const words = (text: string) => text.split(/\s+/).filter(Boolean)

export function createCaptionChunker(options: ChunkerOptions = DEFAULT_CHUNKER): CaptionChunker {
  let previous: string[] = []
  /** When each word last changed, by position. */
  let changedAt: number[] = []
  /** Words already sent from the current phrase. */
  let sent = 0
  /** When the current piece started waiting: the first interim, or the last send. */
  let pieceStart: number | null = null

  const reset = () => {
    previous = []
    changedAt = []
    sent = 0
    pieceStart = null
  }

  return {
    interim(text, now) {
      const current = words(text)
      const nextChangedAt: number[] = []
      for (let i = 0; i < current.length; i++) {
        nextChangedAt[i] = current[i] === previous[i] ? (changedAt[i] ?? now) : now
      }
      previous = current
      changedAt = nextChangedAt
      if (pieceStart === null) pieceStart = now

      // The recogniser rewrote words already sent (rare): carry on from where
      // the text now is, rather than sending them twice.
      if (sent > current.length) sent = current.length

      let settled = sent
      const limit = current.length - options.holdBack
      while (settled < limit && now - changedAt[settled] >= options.stableMs) settled++
      const waiting = settled - sent

      const full = waiting >= options.fullWords
      const due = waiting >= options.minWords && now - pieceStart >= options.maxWaitMs
      if (!full && !due) return null

      const piece = current.slice(sent, settled).join(' ')
      sent = settled
      pieceStart = now
      return piece
    },

    unsent(text) {
      return words(text).slice(sent).join(' ')
    },

    final(text) {
      const rest = words(text).slice(sent).join(' ')
      reset()
      return rest
    },

    reset,
  }
}
