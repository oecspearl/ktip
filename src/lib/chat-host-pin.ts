/**
 * Which host message to pin at the top of a room's chat.
 *
 * The rule: pin the newest host message whose row sits wholly above the
 * viewport. At the bottom of the thread that is the latest host post (once it
 * has scrolled away); scroll up until that post comes into view and it unpins,
 * handing over to the next older host post still above the fold. Nothing above
 * the fold, nothing pinned.
 *
 * Pure so the choice can be tested without a DOM. The panel measures; this
 * decides.
 */

export interface PinRow {
  id: string
  /** True when the row is a host's chat message (not system, not withheld). */
  host: boolean
}

/** The newest host row's id, or null when no host has posted. */
export function newestHostId(rows: readonly PinRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].host) return rows[i].id
  }
  return null
}

/**
 * The id of the host message to pin.
 *
 * @param rows        the thread, oldest first, in render order
 * @param firstVisible index of the first row that is at least partly in view;
 *                    every row before it is above the viewport. rows.length
 *                    when nothing is in view below the top (an empty viewport).
 * @param dismissedAt the newest host id at the moment the reader dismissed the
 *                    pin. The pin stays away until a newer host message lands.
 */
export function pickHostPin(
  rows: readonly PinRow[],
  firstVisible: number,
  dismissedAt: string | null = null
): string | null {
  if (dismissedAt && newestHostId(rows) === dismissedAt) return null
  const end = Math.min(Math.max(firstVisible, 0), rows.length)
  for (let i = end - 1; i >= 0; i--) {
    if (rows[i].host) return rows[i].id
  }
  return null
}

/**
 * Index of the first row whose bottom edge is below `top`, by binary search, so
 * a scroll frame reads O(log n) rects rather than one per message.
 *
 * `bottomOf(i)` must be non-decreasing in i, which rows stacked in a column
 * are. Returns `count` when every row ends at or above `top`.
 */
export function firstVisibleRow(
  count: number,
  bottomOf: (index: number) => number,
  top: number
): number {
  let lo = 0
  let hi = count
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (bottomOf(mid) <= top) lo = mid + 1
    else hi = mid
  }
  return lo
}
