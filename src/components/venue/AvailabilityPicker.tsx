import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  VENUE_AVAILABILITY_LABELS,
  VENUE_AVAILABILITY_PILL_COLORS,
} from '../../lib/constants'
import { AvailabilityDot } from './AvailabilityDot'
import { DropdownPanel } from '../ui/DropdownPanel'
import type { VenueAvailability } from '../../types'

type Choice = Exclude<VenueAvailability, 'offline'>

/** 'offline' is never selectable — it is derived, not declared. */
const CHOICES: { value: Choice; hint: string }[] = [
  { value: 'working', hint: 'Heads down, but reachable' },
  { value: 'help_wanted', hint: 'Ask a mentor to come find you' },
  { value: 'busy', hint: 'Please do not interrupt' },
  { value: 'away', hint: 'Stepped out' },
]

interface AvailabilityPickerProps {
  value: VenueAvailability
  onChange: (next: Choice) => void
  /** True when the shown value came from the idle timer, not a manual choice. */
  isAuto?: boolean
  className?: string
}

/**
 * Sets your own availability.
 *
 * Choosing anything other than "Working" makes it sticky: the idle timer will
 * not downgrade an explicit "Do not disturb" to "Away" behind your back. That
 * rule lives in resolveAvailability() in src/lib/venue-presence.ts; this only
 * has to be honest about which of the two is showing.
 */
export function AvailabilityPicker({
  value,
  onChange,
  isAuto,
  className,
}: AvailabilityPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
          VENUE_AVAILABILITY_PILL_COLORS[value] ||
            'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200'
        )}
      >
        <AvailabilityDot availability={value} size="sm" />
        <span>{VENUE_AVAILABILITY_LABELS[value] || value}</span>
        {isAuto && <span className="text-xs opacity-70">(auto)</span>}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      <DropdownPanel
          open={open}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-ktip-sand-200 bg-ktip-cream shadow-hard"
        >
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(choice.value)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ktip-sand-50',
                value === choice.value && 'bg-ktip-ocean-50'
              )}
            >
              <AvailabilityDot availability={choice.value} className="mt-1" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ktip-sand-900">
                  {VENUE_AVAILABILITY_LABELS[choice.value]}
                </span>
                <span className="block text-xs text-ktip-sand-500">{choice.hint}</span>
              </span>
            </button>
          ))}
      </DropdownPanel>
    </div>
  )
}
