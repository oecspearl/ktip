import { useCallback, useMemo, useState } from 'react'

/**
 * Checkbox state for a list that can change under it. The selection is always
 * read through the ids currently on screen, so a row that was deleted, or that
 * a filter has hidden, stops counting — a bulk action never touches something
 * the member cannot see. The raw set keeps it, so clearing the filter brings
 * the tick back.
 */
export function useSelection(visibleIds: readonly string[]) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())

  const selectedIds = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked])

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setPicked((prev) => new Set([...prev, ...visibleIds]))
  }, [visibleIds])

  const clear = useCallback(() => setPicked(new Set()), [])

  return {
    selectedIds,
    count: selectedIds.length,
    allSelected: visibleIds.length > 0 && selectedIds.length === visibleIds.length,
    isSelected: (id: string) => picked.has(id),
    toggle,
    selectAll,
    clear,
  }
}
