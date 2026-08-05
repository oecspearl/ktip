import { cn } from '../../lib/utils'
import { CALENDAR_FALLBACK_GRADIENT, CALENDAR_ROW_TITLE_CLASS } from '../../lib/constants'
import { CalendarAccentBar, CalendarRelationCheck, calendarItemLabel } from './CalendarAccentBar'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarAllDayChipProps {
  item: CalendarItem
  selected?: boolean
  onSelect: (item: CalendarItem) => void
  className?: string
}

/**
 * A multi-day span on the rail above the time grid. One squat line — a span
 * that covers the whole column has no start time worth printing, and the detail
 * belongs in the panel rather than in a 28px strip.
 */
export function CalendarAllDayChip({
  item,
  selected,
  onSelect,
  className,
}: CalendarAllDayChipProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      aria-label={calendarItemLabel(item)}
      className={cn(
        'group relative flex items-center overflow-hidden rounded-cal-sm border pl-2 pr-1.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
        item.gradientClass ?? CALENDAR_FALLBACK_GRADIENT,
        selected && 'ring-1 ring-inset ring-ktip-ocean-500',
        item.dimmed && 'opacity-60 saturate-50',
        className
      )}
    >
      <CalendarAccentBar item={item} className="absolute inset-y-0 left-0 w-1" />
      <span className={cn(CALENDAR_ROW_TITLE_CLASS, 'min-w-0 flex-1 truncate')}>{item.title}</span>
      <CalendarRelationCheck item={item} className="ml-1" />
      {item.relation && <span className="sr-only"> — {item.relation.label}</span>}
    </button>
  )
}
