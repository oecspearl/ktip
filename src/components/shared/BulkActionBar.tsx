import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { Button } from '../ui/Button'

interface BulkActionBarProps {
  count: number
  /** Rows on screen — what "Select all" would tick. */
  total: number
  allSelected: boolean
  onSelectAll: () => void
  onClear: () => void
  /** Leaves select mode. The selection is dropped with it. */
  onDone: () => void
  /** The actions. Disable them yourself while `count` is zero. */
  children: ReactNode
}

/**
 * The bar a dashboard list shows while you are picking rows. It sticks under
 * the navbar and the collapsed dashboard band — the same offset the side rail
 * uses — because the actions have to stay in reach once the list is long
 * enough to scroll.
 */
export function BulkActionBar({
  count,
  total,
  allSelected,
  onSelectAll,
  onClear,
  onDone,
  children,
}: BulkActionBarProps) {
  const { t } = useLingui()

  return (
    <div
      role="toolbar"
      aria-label={t`Bulk actions`}
      className="sticky top-[calc(var(--nav-offset)+var(--dash-bar-h,0px)+0.5rem)] z-sticky mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-ktip-sand-200 bg-ktip-cream px-4 py-3 shadow-medium"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span aria-live="polite" className="text-label font-semibold text-ktip-sand-900">
          {plural(count, { one: '# selected', other: '# selected' })}
        </span>
        {allSelected ? (
          <button
            type="button"
            onClick={onClear}
            className="text-label font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline"
          >
            <Trans>Clear selection</Trans>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-label font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline"
          >
            <Trans>Select all {total}</Trans>
          </button>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" icon={<X size={16} />} onClick={onDone}>
          <Trans>Done</Trans>
        </Button>
      </div>
    </div>
  )
}
