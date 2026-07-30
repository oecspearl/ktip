// Auto-assigned bento layout: turns a plain list into a masonry-ish grid where
// the first (newest) tile is the hero and every row still fills the 4-column
// track exactly — no ragged tail, whatever the item count.
//
// All patterns are area-balanced against a 4-column grid:
//   hero = 2x2 (4 cells), wide = 2x1 (2 cells), small = 1x1, full = 4x1.

/** Repeating 6-tile block = 4 cols x 3 rows (12 cells). */
const CYCLE = [
  'md:col-span-2 md:row-span-2',
  'md:col-span-2',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-2',
  'md:col-span-2',
]

/** Leftovers after the last full cycle; each tail also fills whole rows. */
const TAILS: Record<number, string[]> = {
  0: [],
  1: ['md:col-span-4'],
  2: ['md:col-span-2', 'md:col-span-2'],
  3: ['md:col-span-2 md:row-span-2', 'md:col-span-2', 'md:col-span-2'],
  4: ['md:col-span-2 md:row-span-2', 'md:col-span-2', 'md:col-span-1', 'md:col-span-1'],
  5: [
    'md:col-span-2 md:row-span-2',
    'md:col-span-2',
    'md:col-span-1',
    'md:col-span-1',
    'md:col-span-4',
  ],
}

/** Grid container classes the spans below assume. */
export const BENTO_GRID =
  'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:auto-rows-[minmax(11rem,auto)]'

/** Tile classes to pair with BENTO_GRID (lets the grid own the row height). */
export const BENTO_TILE = 'md:min-h-0'

/**
 * Span class for every item, in order. Index 0 is the biggest tile, so pass an
 * already-sorted list (newest first) and the newest board leads the grid.
 */
export function bentoSpans(count: number): string[] {
  if (count <= 0) return []

  const cycles = Math.floor(count / CYCLE.length)
  const rest = count % CYCLE.length
  const spans: string[] = []

  for (let i = 0; i < cycles; i++) spans.push(...CYCLE)
  spans.push(...TAILS[rest])

  return spans
}

/** Newest first; falls back to sort_order/name when timestamps tie or are absent. */
export function sortNewestFirst<T extends { created_at?: string | null; sort_order?: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const at = a.created_at ? Date.parse(a.created_at) : 0
    const bt = b.created_at ? Date.parse(b.created_at) : 0
    if (bt !== at) return bt - at
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}
