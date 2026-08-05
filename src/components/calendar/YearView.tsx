import { useMemo } from 'react'
import { addMonths, format, startOfYear } from 'date-fns'
import { cn } from '../../lib/utils'
import { CalendarMonthTile } from './CalendarMonthTile'
import type { CalendarItem } from '../../lib/calendar'

interface YearViewProps {
  /** Any date inside the year to draw */
  anchorDate: Date
  selectedDate: Date
  itemsByDay: Map<string, CalendarItem[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  /** Clicking a month heading drops into that month */
  onSelectMonth: (month: Date) => void
  className?: string
}

/**
 * Twelve months on one screen. Deliberately the coarsest view: no titles, no
 * times, just where in the year the work sits — which is the one question the
 * month grid cannot answer without twelve clicks.
 */
export function YearView({
  anchorDate,
  selectedDate,
  itemsByDay,
  direction,
  onSelectDate,
  onSelectMonth,
  className,
}: YearViewProps) {
  const months = useMemo(() => {
    const first = startOfYear(anchorDate)
    return Array.from({ length: 12 }, (_, i) => addMonths(first, i))
  }, [anchorDate])

  return (
    <div
      key={format(anchorDate, 'yyyy')}
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-5 border-t border-cal-line p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
        direction === 'left' ? 'animate-cal-left' : 'animate-cal-right',
        className
      )}
    >
      {months.map((month) => (
        <CalendarMonthTile
          key={month.toISOString()}
          month={month}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          onSelectDate={onSelectDate}
          onSelectMonth={onSelectMonth}
        />
      ))}
    </div>
  )
}
