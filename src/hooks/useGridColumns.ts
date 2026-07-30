import { useState } from 'react'

export const COLUMN_OPTIONS = [2, 3, 4] as const
export type ColumnCount = (typeof COLUMN_OPTIONS)[number]

// Spelled out rather than built from a template — Tailwind only ships classes
// it can see in the source.
const GRID_CLASSES: Record<ColumnCount, string> = {
  2: 'grid grid-cols-1 sm:grid-cols-2',
  3: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

/**
 * Cards-per-row preference for a list page, remembered per browser.
 * `storageKey` is per page, e.g. 'projects:columns'.
 */
export function useGridColumns(storageKey: string, fallback: ColumnCount = 3) {
  const [columns, setColumnsState] = useState<ColumnCount>(() => {
    const stored = Number(localStorage.getItem(storageKey))
    return COLUMN_OPTIONS.includes(stored as ColumnCount) ? (stored as ColumnCount) : fallback
  })

  const setColumns = (next: ColumnCount) => {
    setColumnsState(next)
    localStorage.setItem(storageKey, String(next))
  }

  return { columns, setColumns, gridClass: GRID_CLASSES[columns] }
}
