import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfWeek,
} from 'date-fns'
import { cn } from '../../lib/utils'
import { CALENDAR_FALLBACK_GRADIENT } from '../../lib/constants'
import { CalendarAccentBar, calendarItemLabel } from './CalendarAccentBar'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarGridProps {
  monthDate: Date
  selectedDate: Date
  itemsByDay: Map<string, CalendarItem[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  /** Noun used in day-cell aria labels — "event", "item", … */
  itemNoun?: string
  className?: string
}

const MAX_CHIPS = 3
const MAX_DOTS = 3

interface CalendarDayCellProps {
  day: Date
  monthDate: Date
  selectedDate: Date
  items: CalendarItem[]
  itemNoun: string
  onSelect: (date: Date) => void
}

function CalendarDayCell({
  day,
  monthDate,
  selectedDate,
  items,
  itemNoun,
  onSelect,
}: CalendarDayCellProps) {
  const inMonth = isSameMonth(day, monthDate)
  const selected = isSameDay(day, selectedDate)
  const today = isToday(day)
  const overflow = items.length - MAX_CHIPS

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-pressed={selected}
      aria-label={`${format(day, 'EEEE, MMMM d')}, ${items.length} ${itemNoun}${items.length !== 1 ? 's' : ''}`}
      className={cn(
        'min-h-14 md:min-h-28 rounded-cal-sm p-1 md:p-1.5 text-left flex flex-col gap-1 border transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none',
        selected
          ? 'bg-ktip-ocean-50 ring-1 ring-ktip-ocean-300 border-transparent'
          : 'bg-ktip-canvas/60 border-transparent hover:border-ktip-ocean-200 hover:bg-ktip-canvas',
        !inMonth && 'opacity-40'
      )}
    >
      <span
        className={cn(
          'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-colors',
          today
            ? 'bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white'
            : selected
              ? 'text-ktip-ocean-700'
              : 'text-ktip-sand-800'
        )}
      >
        {format(day, 'd')}
      </span>

      {/* Item chips — md and up. Same gradient card language as the week view */}
      {items.length > 0 && (
        <span className="hidden md:flex flex-col gap-1 overflow-hidden w-full">
          {items.slice(0, MAX_CHIPS).map((item) => (
            <span
              key={item.id}
              title={calendarItemLabel(item)}
              className={cn(
                'relative flex items-center overflow-hidden rounded-cal-sm border pl-2 pr-1 py-0.5 text-[10px] font-semibold transition-transform hover:translate-x-0.5',
                item.gradientClass ?? CALENDAR_FALLBACK_GRADIENT,
                item.dimmed && 'opacity-60 saturate-50'
              )}
            >
              <CalendarAccentBar item={item} className="absolute left-0 top-0 bottom-0 w-1" />
              <span className="truncate">{item.title}</span>
              {/* Colour alone must not carry the registration — name it for AT */}
              {item.relation && <span className="sr-only"> — {item.relation.label}</span>}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[10px] font-semibold text-ktip-sand-500 pl-1">
              +{overflow} more
            </span>
          )}
        </span>
      )}

      {/* Dots — mobile */}
      {items.length > 0 && (
        <span className="flex md:hidden gap-0.5 mt-auto justify-center w-full">
          {items.slice(0, MAX_DOTS).map((item) => (
            // Two-tone at 6px still reads as "mine" vs "not mine" at a glance
            <CalendarAccentBar
              key={item.id}
              item={item}
              className={cn('w-1.5 h-1.5 rounded-full', item.dimmed && 'opacity-50')}
            />
          ))}
        </span>
      )}
    </button>
  )
}

/**
 * Generic month grid. Rendering is driven entirely by `CalendarItem`s, so both
 * the events page and the dashboard calendars share this one implementation.
 * Header chrome lives in `CalendarShell`, which wraps this and `WeekView`.
 */
export function CalendarGrid({
  monthDate,
  selectedDate,
  itemsByDay,
  direction,
  onSelectDate,
  itemNoun = 'event',
  className,
}: CalendarGridProps) {
  const gridStart = startOfWeek(monthDate)
  const gridEnd = endOfWeek(endOfMonth(monthDate))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className={className}>
      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="text-[11px] font-bold uppercase tracking-[0.12em] text-ktip-sand-500 text-center pb-2"
          >
            {format(addDays(gridStart, i), 'EEE')}
          </div>
        ))}
      </div>

      {/* Day grid — keyed by month so nav re-fires the slide animation */}
      <div
        key={format(monthDate, 'yyyy-MM')}
        className={cn(
          'grid grid-cols-7 gap-1.5',
          direction === 'left' ? 'animate-cal-left' : 'animate-cal-right'
        )}
      >
        {days.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            day={day}
            monthDate={monthDate}
            selectedDate={selectedDate}
            items={itemsByDay.get(format(day, 'yyyy-MM-dd')) ?? []}
            itemNoun={itemNoun}
            onSelect={onSelectDate}
          />
        ))}
      </div>
    </div>
  )
}
