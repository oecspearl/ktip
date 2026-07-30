import { cn } from '../../lib/utils'
import { COLUMN_OPTIONS, type ColumnCount } from '../../hooks/useGridColumns'

interface ColumnToggleProps {
  value: ColumnCount
  onChange: (next: ColumnCount) => void
  className?: string
}

/** Cards-per-row control. Hidden below `sm`, where every grid is one column. */
export function ColumnToggle({ value, onChange, className }: ColumnToggleProps) {
  return (
    <div
      role="group"
      aria-label="Cards per row"
      className={cn(
        'hidden sm:inline-flex rounded-lg border border-ktip-sand-300 bg-ktip-cream p-0.5',
        className
      )}
    >
      {COLUMN_OPTIONS.map((count) => (
        <button
          key={count}
          type="button"
          onClick={() => onChange(count)}
          aria-pressed={value === count}
          aria-label={`${count} cards per row`}
          className={cn(
            'px-2.5 py-1.5 rounded-md text-xs font-bold tracking-wider transition-colors',
            value === count
              ? 'bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shadow-soft'
              : 'text-ktip-sand-700 hover:bg-ktip-sand-100'
          )}
        >
          {count}
        </button>
      ))}
    </div>
  )
}
