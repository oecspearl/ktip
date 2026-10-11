import { Fragment, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import type { ColumnCount } from '../../hooks/useGridColumns'

// Hides the cards that would start a half-empty row where the grid runs fewer
// columns than the chosen count (see GRID_CLASSES in useGridColumns). Below sm
// the grid is one column and every preview card stacks, which leaves no gap.
// Spelled out for the same reason as GRID_CLASSES: Tailwind only ships what it
// can see.
const ROW_CLAMP: Record<ColumnCount, string> = {
  2: '',
  3: 'sm:max-lg:[&>*:nth-child(n+3)]:hidden',
  4: 'lg:max-xl:[&>*:nth-child(n+4)]:hidden',
}

interface PreviewGridProps<T> {
  items: T[]
  /** The page's column setting. One row of that many cards shows until expanded. */
  columns: ColumnCount
  /** From useGridColumns, plus any spacing the page wants. */
  className: string
  renderItem: (item: T) => ReactNode
  getKey: (item: T) => string
}

/**
 * A grouped listing's grid: one row of cards, then "Show all" for the rest.
 * Used inside each category section on Projects, Events and Funding, so a
 * category with twenty-five entries does not push every other section off
 * the page.
 */
export function PreviewGrid<T>({ items, columns, className, renderItem, getKey }: PreviewGridProps<T>) {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState(false)

  const overflows = items.length > columns
  const shown = overflows && !expanded ? items.slice(0, columns) : items
  const total = items.length

  return (
    <>
      <div className={cn(className, overflows && !expanded && ROW_CLAMP[columns])}>
        {shown.map((item) => (
          <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
        ))}
      </div>
      {overflows && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ktip-sand-300 px-4 py-2 text-sm font-semibold text-ktip-sand-700 hover:bg-ktip-sand-100 transition-colors"
          >
            {expanded ? t`Show fewer` : t`Show all ${total}`}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn('transition-transform duration-200', expanded && 'rotate-180')}
            />
          </button>
        </div>
      )}
    </>
  )
}
