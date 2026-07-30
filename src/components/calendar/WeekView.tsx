import { useEffect, useMemo, useState } from 'react'
import { eachDayOfInterval, format, isSameDay, isToday } from 'date-fns'
import { cn } from '../../lib/utils'
import { buildWeekLayout, formatHourLabel, timeToPct } from '../../lib/calendar-week'
import { CalendarEventCard } from './CalendarEventCard'
import type { CalendarItem } from '../../lib/calendar'
import type { WeekColumn, WeekLayout } from '../../lib/calendar-week'

interface WeekViewProps {
  gridStart: Date
  gridEnd: Date
  selectedDate: Date
  itemsByDay: Map<string, CalendarItem[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  itemNoun?: string
  className?: string
}

const HOUR_PX = 56
const GUTTER = 'w-14 shrink-0'

/** Repeating hour rules, drawn as a background so no extra DOM per row. */
const hourRulesStyle: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(to bottom, var(--color-cal-line) 0 1px, transparent 1px ' +
    `${HOUR_PX}px)`,
}

function DayColumn({
  column,
  layout,
  selected,
  today,
  showNowLine,
  nowPct,
  className,
}: {
  column: WeekColumn
  layout: WeekLayout
  selected: boolean
  today: boolean
  showNowLine: boolean
  nowPct: number | null
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative border-l border-cal-line first:border-l-0 transition-colors',
        selected && 'bg-ktip-ocean-50/40',
        !selected && today && 'bg-ktip-sun-50/30',
        className
      )}
      style={{ height: (layout.hours.length - 1) * HOUR_PX, ...hourRulesStyle }}
    >
      {column.timed.map((entry) => (
        <CalendarEventCard
          key={entry.item.id}
          item={entry.item}
          heightPct={entry.heightPct}
          className="absolute animate-cal-week"
          style={{
            top: `${entry.topPct}%`,
            height: `${entry.heightPct}%`,
            left: `calc(${(entry.lane / entry.lanes) * 100}% + 2px)`,
            width: `calc(${100 / entry.lanes}% - 4px)`,
          }}
        />
      ))}

      {showNowLine && nowPct !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: `${nowPct}%` }}
        >
          <span className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-ktip-tropical-500 animate-now-pulse" />
          <span className="h-px flex-1 bg-ktip-tropical-500" />
        </div>
      )}
    </div>
  )
}

/**
 * Week time-grid: hour rows down the gutter, a column per day, cards
 * positioned by start time and duration. Multi-day spans sit on an all-day
 * rail above the grid; on mobile the seven columns collapse to a day strip
 * plus the selected day's column.
 */
export function WeekView({
  gridStart,
  gridEnd,
  selectedDate,
  itemsByDay,
  direction,
  onSelectDate,
  itemNoun = 'event',
  className,
}: WeekViewProps) {
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  )
  const layout = useMemo(() => buildWeekLayout(days, itemsByDay), [days, itemsByDay])

  const weekHasToday = days.some((day) => isToday(day))
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!weekHasToday) return
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [weekHasToday])

  const nowPct = weekHasToday ? timeToPct(now, layout) : null
  const hasAllDay = layout.columns.some((column) => column.allDay.length > 0)
  const selectedColumn =
    layout.columns.find((column) => isSameDay(column.day, selectedDate)) ?? layout.columns[0]

  const dayHeader = (day: Date, compact = false) => {
    const selected = isSameDay(day, selectedDate)
    const today = isToday(day)
    const count = itemsByDay.get(format(day, 'yyyy-MM-dd'))?.length ?? 0
    return (
      <button
        type="button"
        onClick={() => onSelectDate(day)}
        aria-pressed={selected}
        aria-label={`${format(day, 'EEEE, MMMM d')}, ${count} ${itemNoun}${count !== 1 ? 's' : ''}`}
        className={cn(
          'flex flex-col items-center gap-0.5 border-b-2 py-2 transition-all focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none',
          compact ? 'min-w-14 rounded-cal-sm px-3' : 'w-full',
          selected
            ? 'border-ktip-ocean-600 text-ktip-ocean-700'
            : 'border-transparent text-ktip-sand-600 hover:text-ktip-ocean-700 hover:border-ktip-ocean-200'
        )}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {format(day, 'EEE')}
        </span>
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors',
            today ? 'bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white' : selected ? 'text-ktip-ocean-700' : 'text-ktip-sand-800'
          )}
        >
          {format(day, 'd')}
        </span>
        {count > 0 && (
          <span className="h-1 w-1 rounded-full bg-ktip-tropical-500" aria-hidden="true" />
        )}
      </button>
    )
  }

  const allDayRail = (columns: WeekColumn[]) => (
    <div className="flex border-b border-cal-line">
      <div
        className={cn(
          GUTTER,
          'py-1.5 pr-2 text-right text-[10px] font-bold uppercase tracking-wider text-ktip-sand-500'
        )}
      >
        All day
      </div>
      <div
        className="grid flex-1"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              'flex min-w-0 flex-col gap-1 border-l border-cal-line p-1 first:border-l-0',
              isSameDay(column.day, selectedDate) && 'bg-ktip-ocean-50/40'
            )}
          >
            {column.allDay.map((item) => (
              <CalendarEventCard key={item.id} item={item} variant="all-day" className="h-7" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  const hourGutter = (
    <div className={cn(GUTTER, 'relative')} aria-hidden="true">
      {layout.hours.slice(0, -1).map((hour, index) => (
        <div
          key={hour}
          className="absolute right-2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-ktip-sand-500"
          style={{ top: index * HOUR_PX }}
        >
          {formatHourLabel(hour)}
        </div>
      ))}
    </div>
  )

  return (
    <div
      key={format(gridStart, 'yyyy-MM-dd')}
      className={cn(
        direction === 'left' ? 'animate-cal-left' : 'animate-cal-right',
        className
      )}
    >
      {/* Desktop — seven columns */}
      <div className="hidden md:block">
        <div className="flex">
          <div className={GUTTER} />
          <div
            className="grid flex-1"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <div key={day.toISOString()}>{dayHeader(day)}</div>
            ))}
          </div>
        </div>

        {hasAllDay && allDayRail(layout.columns)}

        <div className="max-h-[34rem] overflow-y-auto">
          <div className="flex pt-2">
            {hourGutter}
            <div
              className="grid flex-1"
              style={{ gridTemplateColumns: `repeat(${layout.columns.length}, minmax(0, 1fr))` }}
            >
              {layout.columns.map((column) => (
                <DayColumn
                  key={column.key}
                  column={column}
                  layout={layout}
                  selected={isSameDay(column.day, selectedDate)}
                  today={isToday(column.day)}
                  showNowLine={isToday(column.day)}
                  nowPct={nowPct}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile — day strip + the selected day's column */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {days.map((day) => (
            <div key={day.toISOString()} className="shrink-0">
              {dayHeader(day, true)}
            </div>
          ))}
        </div>

        {selectedColumn && selectedColumn.allDay.length > 0 && allDayRail([selectedColumn])}

        <div className="max-h-[28rem] overflow-y-auto">
          <div className="flex pt-2">
            {hourGutter}
            <div className="flex-1">
              {selectedColumn && (
                <DayColumn
                  column={selectedColumn}
                  layout={layout}
                  selected
                  today={isToday(selectedColumn.day)}
                  showNowLine={isToday(selectedColumn.day)}
                  nowPct={nowPct}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
