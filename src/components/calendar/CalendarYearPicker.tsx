import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DropdownPanel } from '../ui/DropdownPanel'
import { useLingui } from '@lingui/react/macro'

interface CalendarYearPickerProps {
  year: number
  onChange: (year: number) => void
  /** Styling for the trigger, so the header can size it like a title or a note */
  triggerClassName?: string
}

/** Years offered around the current one, before and after. */
const BACK = 6
const FORWARD = 6

/**
 * The year in the header, made clickable.
 *
 * The arrows step one unit of the current view, so reaching 2029 from a week in
 * 2026 is 150 presses. This is the way out of that without adding a date field
 * nobody wants to type into.
 */
export function CalendarYearPicker({ year, onChange, triggerClassName }: CalendarYearPickerProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const years = Array.from({ length: BACK + FORWARD + 1 }, (_, i) => year - BACK + i)

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t`Change year`}
        className={cn(
          'inline-flex items-center gap-1 rounded-neu-sm px-1.5 py-0.5 transition-all hover:text-ktip-ocean-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
          open ? 'shadow-neu-sm-inset text-ktip-ocean-700' : 'hover:shadow-neu-sm',
          triggerClassName
        )}
      >
        {year}
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      <DropdownPanel
        open={open}
        className="neu-surface absolute left-0 top-full z-dropdown mt-1 w-48 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-2 shadow-medium"
      >
        <div className="grid grid-cols-3 gap-1">
          {years.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              aria-pressed={option === year}
              className={cn(
                'rounded-neu-sm px-2 py-1.5 font-mono text-micro transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
                option === year
                  ? 'bg-ktip-sand-100 font-bold text-ktip-ocean-700 shadow-neu-sm-inset'
                  : 'text-ktip-sand-700 hover:text-ktip-ocean-700 hover:shadow-neu-sm'
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </DropdownPanel>
    </div>
  )
}
