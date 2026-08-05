import { useMemo } from 'react'
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { cn } from '../../lib/utils'
import { CALENDAR_CHROME_CLASS } from '../../lib/constants'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarMonthTileProps {
  /** Any date inside the month to draw */
  month: Date
  selectedDate: Date
  itemsByDay?: Map<string, CalendarItem[]>
  onSelectDate: (date: Date) => void
  /** Clicking the month name — omit to make the heading plain text */
  onSelectMonth?: (month: Date) => void
  className?: string
}

/**
 * One month at a glance: a compact 7-column grid where a day carries a dot if
 * anything falls on it. Twelve of these make the year view.
 */
export function CalendarMonthTile({
  month,
  selectedDate,
  itemsByDay,
  onSelectDate,
  onSelectMonth,
  className,
}: CalendarMonthTileProps) {
  const anchor = startOfMonth(month)

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(anchor),
        end: endOfWeek(endOfMonth(anchor)),
      }),
    [anchor]
  )

  const weekdayInitials = useMemo(() => {
    const first = startOfWeek(new Date())
    return Array.from({ length: 7 }, (_, i) => format(addDays(first, i), 'EEEEE'))
  }, [])

  const heading = format(anchor, 'MMMM')

  return (
    <div className={className}>
      {onSelectMonth ? (
        <button
          type="button"
          onClick={() => onSelectMonth(anchor)}
          className="mb-2 block w-full truncate text-left font-display text-caption font-bold text-ktip-sand-800 transition-colors hover:text-ktip-ocean-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
        >
          {heading}
        </button>
      ) : (
        <p className="mb-2 truncate font-display text-caption font-bold text-ktip-sand-800">
          {heading}
        </p>
      )}

      <div className="grid grid-cols-7 gap-px">
        {weekdayInitials.map((initial, index) => (
          <div
            key={index}
            aria-hidden="true"
            className={cn(CALENDAR_CHROME_CLASS, 'pb-1 text-center text-ktip-sand-500')}
          >
            {initial}
          </div>
        ))}

        {days.map((day) => {
          const inMonth = isSameMonth(day, anchor)
          const selected = isSameDay(day, selectedDate)
          const today = isToday(day)
          const has = (itemsByDay?.get(format(day, 'yyyy-MM-dd'))?.length ?? 0) > 0
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              aria-pressed={selected}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-cal-sm font-mono text-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
                today
                  ? 'bg-ktip-ocean-600 font-bold text-white dark:bg-ktip-ocean-200'
                  : selected
                    ? 'bg-ktip-ocean-100 font-bold text-ktip-ocean-700'
                    : inMonth
                      ? 'text-ktip-sand-800 hover:bg-ktip-sand-100'
                      : 'text-ktip-sand-400 hover:bg-ktip-sand-100'
              )}
            >
              {format(day, 'd')}
              {/* A dot, not a fill — the fill is already spoken for by today
                  and by the selection, and this has to stack with both */}
              {has && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute bottom-0.5 h-1 w-1 rounded-full',
                    today ? 'bg-white/80' : 'bg-ktip-tropical-500'
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
