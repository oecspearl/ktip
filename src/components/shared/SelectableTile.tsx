import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SelectableTileProps {
  /** Off: the card behaves as it always does. On: a click ticks it instead. */
  selecting: boolean
  selected: boolean
  onToggle: () => void
  /** Read by screen readers in place of the card, e.g. "Select Blue Economy Sprint". */
  label: string
  children: ReactNode
}

/**
 * Wraps a card for the dashboard's select mode without the card knowing.
 *
 * A layer over the whole tile takes the click, so the card's own link and its
 * corner buttons cannot fire while you are picking rows; `inert` takes them out
 * of the tab order too, which leaves one stop per card and that stop is the
 * checkbox.
 */
export function SelectableTile({ selecting, selected, onToggle, label, children }: SelectableTileProps) {
  return (
    <div className="relative isolate h-full">
      <div className="h-full" inert={selecting}>
        {children}
      </div>
      {selecting && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={label}
          onClick={onToggle}
          className={cn(
            'absolute inset-0 z-raised rounded-surface transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ktip-sand-700',
            selected ? 'bg-brand-navy/25 ring-4 ring-brand-green' : 'hover:bg-black/15'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-medium transition-colors',
              selected ? 'border-brand-green bg-brand-green text-brand-navy' : 'border-white bg-white/85 text-transparent'
            )}
          >
            <Check size={16} strokeWidth={3} />
          </span>
        </button>
      )}
    </div>
  )
}
