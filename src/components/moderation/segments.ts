import type { MergedRange } from '../../lib/moderation/scan'

export interface Segment {
  text: string
  /** Present on a flagged run; absent on plain text between runs. */
  range?: MergedRange
}

/**
 * Split a value into alternating plain and flagged runs for the mirror layer.
 *
 * Ranges are clamped and re-merged here rather than trusted: a fast edit can
 * leave the previous scan's ranges pointing past the end of the new value for
 * one frame, and slicing past the end would silently drop the tail of the
 * member's text out of the mirror while the textarea still shows it.
 */
export function buildSegments(value: string, ranges: MergedRange[]): Segment[] {
  if (ranges.length === 0) return value ? [{ text: value }] : []

  const clamped = ranges
    .map((r) => ({
      ...r,
      start: Math.max(0, Math.min(r.start, value.length)),
      end: Math.max(0, Math.min(r.end, value.length)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  const out: Segment[] = []
  let cursor = 0

  for (const range of clamped) {
    if (range.start < cursor) continue // fully absorbed by the previous run
    if (range.start > cursor) out.push({ text: value.slice(cursor, range.start) })
    out.push({ text: value.slice(range.start, range.end), range })
    cursor = range.end
  }

  if (cursor < value.length) out.push({ text: value.slice(cursor) })
  return out
}
