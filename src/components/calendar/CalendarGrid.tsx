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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarGridProps {
  monthDate: Date
  selectedDate: Date
  itemsByDay: Map<string, CalendarItem[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  /** Noun used in day-cell aria labels — "event", "item", … */
  itemNoun?: string
  /** Extra controls rendered left of the month nav buttons */
  headerExtra?: React.ReactNode
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
        'min-h-14 md:min-h-24 rounded-lg p-1 md:p-1.5 text-left flex flex-col gap-1 border transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none',
        selected
          ? 'bg-ktip-ocean-50 ring-1 ring-ktip-ocean-400 border-transparent'
          : inMonth
            ? 'bg-ktip-canvas/60 border-transparent hover:border-ktip-ocean-200 hover:bg-ktip-canvas'
            : 'bg-transparent border-transparent hover:bg-ktip-sand-100/50'
      )}
    >
      <span
        className={cn(
          'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-colors',
          today
            ? 'bg-ktip-ocean-600 text-white'
            : selected
              ? 'text-ktip-ocean-700'
              : inMonth
                ? 'text-ktip-sand-800'
                : 'text-gray-400'
        )}
      >
        {format(day, 'd')}
      </span>

      {/* Item chips — md and up */}
      {items.length > 0 && (
        <span className="hidden md:flex flex-col gap-0.5 overflow-hidden w-full">
          {items.slice(0, MAX_CHIPS).map((item) => (
            <span
              key={item.id}
              className={cn(
                'truncate rounded px-1 py-0.5 text-[10px] font-semibold border-l-2 transition-transform hover:translate-x-0.5',
                item.chipClass,
                (!inMonth || item.dimmed) && 'opacity-50'
              )}
            >
              {item.title}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[10px] font-semibold text-gray-500 pl-1">+{overflow} more</span>
          )}
        </span>
      )}

      {/* Dots — mobile */}
      {items.length > 0 && (
        <span className="flex md:hidden gap-0.5 mt-auto justify-center w-full">
          {items.slice(0, MAX_DOTS).map((item) => (
            <span
              key={item.id}
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                item.dotClass,
                (!inMonth || item.dimmed) && 'opacity-50'
              )}
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
 */
export function CalendarGrid({
  monthDate,
  selectedDate,
  itemsByDay,
  direction,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  itemNoun = 'event',
  headerExtra,
  className,
}: CalendarGridProps) {
  const gridStart = startOfWeek(monthDate)
  const gridEnd = endOfWeek(endOfMonth(monthDate))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div
      className={cn(
        'bg-ktip-cream rounded-2xl border border-ktip-line shadow-card p-4 sm:p-5',
        className
      )}
    >
      {/* Header */}
      <div data-tutorial="calendar-header" className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-ktip-sand-900 animate-none">
          {format(monthDate, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          {headerExtra}
          <button
            type="button"
            onClick={onToday}
            className="text-xs font-bold uppercase tracking-wider text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg px-3 py-1.5 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Previous month"
            className="p-2 rounded-lg text-ktip-sand-700 hover:bg-ktip-sand-100 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            className="p-2 rounded-lg text-ktip-sand-700 hover:bg-ktip-sand-100 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="text-[11px] font-bold uppercase tracking-wider text-gray-400 text-center pb-2"
          >
            {format(addDays(gridStart, i), 'EEE')}
          </div>
        ))}
      </div>

      {/* Day grid — keyed by month so nav re-fires the slide animation */}
      <div
        key={format(monthDate, 'yyyy-MM')}
        className={cn(
          'grid grid-cols-7 gap-1',
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
