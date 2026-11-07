/**
 * Captions arrive a few words at a time. Shown one per line, a speaker's
 * sentence would be stacked in fragments, each with their name in front.
 * Consecutive pieces from the same speaker, in the same language and close
 * together in time, are shown as one line instead.
 */

/** A pause longer than this starts a new line, even for the same speaker. */
export const RUN_GAP_MS = 6_000

interface Piece {
  id: string
  name: string
  lang: string
  at: number
}

export interface CaptionRun<T extends Piece> {
  /** The first piece's id: stable while the run grows, so React keeps the line. */
  key: string
  name: string
  pieces: T[]
}

export function captionRuns<T extends Piece>(captions: T[], gapMs = RUN_GAP_MS): CaptionRun<T>[] {
  const runs: CaptionRun<T>[] = []
  for (const caption of captions) {
    const run = runs[runs.length - 1]
    const last = run?.pieces[run.pieces.length - 1]
    if (run && last && last.name === caption.name && last.lang === caption.lang && caption.at - last.at < gapMs) {
      run.pieces.push(caption)
    } else {
      runs.push({ key: caption.id, name: caption.name, pieces: [caption] })
    }
  }
  return runs
}
