import { useEffect, useMemo, useState } from 'react'
import { eachDayOfInterval, format, isSameDay, isToday, isWeekend } from 'date-fns'
import { cn } from '../../lib/utils'
import { CALENDAR_CHROME_CLASS, CALENDAR_META_CLASS } from '../../lib/constants'
import {
  HOUR_PX,
  buildDensitySpine,
  buildWeekLayout,
  formatHourLabel,
  formatMinutes,
  timeToPx,
} from '../../lib/calendar-week'
import { CalendarAllDayChip } from './CalendarAllDayChip'
import { CalendarEventCluster } from './CalendarEventCluster'
import { useTimeFormat } from './useTimeFormat'
import type { CalendarItem } from '../../lib/calendar'
import type { WeekColumn, WeekLayout } from '../../lib/calendar-week'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

interface WeekViewProps {
  gridStart: Date
  gridEnd: Date
  selectedDate: Date
  itemsByDay: Map<string, CalendarItem[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  /** The item open in the detail panel, highlighted in the grid */
  selectedItemId?: string | null
  onSelectItem: (item: CalendarItem) => void
  itemNoun?: string
  className?: string
}

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
  nowPx,
  selectedItemId,
  onSelectItem,
  className,
}: {
  column: WeekColumn
  layout: WeekLayout
  selected: boolean
  today: boolean
  nowPx: number | null
  selectedItemId?: string | null
  onSelectItem: (item: CalendarItem) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 flex-1 border-l border-cal-line transition-colors first:border-l-0',
        selected
          ? 'bg-ktip-ocean-50/40'
          : today
            ? 'bg-ktip-sun-50/30'
            : isWeekend(column.day) && 'bg-ktip-sand-50/60',
        className
      )}
      style={{ height: layout.bodyPx, ...hourRulesStyle }}
    >
      {column.clusters.map((cluster) => (
        <CalendarEventCluster
          key={cluster.key}
          cluster={cluster}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
        />
      ))}

      {today && nowPx !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-raised flex items-center"
          style={{ top: nowPx }}
        >
          <span className="-ml-0.5 h-1.5 w-1.5 rounded-full bg-ktip-tropical-500 animate-now-pulse" />
          <span className="h-px flex-1 bg-ktip-tropical-500" />
        </div>
      )}
    </div>
  )
}

/**
 * Time grid: hour rows down the gutter, a column per day, overlapping events
 * packed into cluster boxes. Multi-day spans sit on an all-day rail above the
 * grid.
 *
 * The same component serves the week and the day — a day is a week with one
 * column, and on a phone the week narrows to the selected day's column with the
 * day strip left in place to move between them.
 */
export function WeekView({
  gridStart,
  gridEnd,
  selectedDate,
  itemsByDay,
  direction,
  onSelectDate,
  selectedItemId,
  onSelectItem,
  itemNoun = 'event',
  className,
}: WeekViewProps) {
  const { t } = useLingui()
  const { use24 } = useTimeFormat()
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  )
  const layout = useMemo(() => buildWeekLayout(days, itemsByDay), [days, itemsByDay])
  const single = days.length === 1

  const weekHasToday = days.some((day) => isToday(day))
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!weekHasToday) return
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [weekHasToday])

  const nowPx = weekHasToday ? timeToPx(now, layout) : null
  const nowLabel = formatMinutes(now.getHours() * 60 + now.getMinutes(), use24)
  const hasAllDay = layout.columns.some((column) => column.allDay.length > 0)

  /** Off the day strip, only the selected column survives a phone width. */
  const columnVisibility = (day: Date) =>
    single || isSameDay(day, selectedDate) ? undefined : 'hidden md:flex'

  const dayHeader = (day: Date) => {
    const selected = isSameDay(day, selectedDate)
    const today = isToday(day)
    const items = itemsByDay.get(format(day, 'yyyy-MM-dd')) ?? []
    const dayLabel = format(day, 'EEEE, MMMM d')
    // itemNoun only ever arrives as "item" or "event" today — a third caller
    // would need its own branch here, the same way CalendarGrid/CalendarDayPanel do.
    const countLabel =
      itemNoun === 'event'
        ? plural(items.length, { one: '# event', other: '# events' })
        : plural(items.length, { one: '# item', other: '# items' })
    const spine = buildDensitySpine(items)

    return (
      <button
        type="button"
        onClick={() => onSelectDate(day)}
        aria-pressed={selected}
        aria-label={t`${dayLabel}, ${countLabel}`}
        className={cn(
          'group min-w-0 flex-1 border-l border-cal-line px-2 py-2 text-left transition-colors first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ktip-ocean-500',
          selected ? 'bg-ktip-ocean-50/40' : 'hover:bg-ktip-sand-50'
        )}
      >
        <span
          className={cn(
            CALENDAR_CHROME_CLASS,
            'block truncate',
            today || selected ? 'text-ktip-ocean-700' : 'text-ktip-sand-500'
          )}
        >
          {format(day, single ? 'EEEE' : 'EEE')}
        </span>
        <span
          className={cn(
            'block font-display text-title-sm leading-tight tracking-tight',
            today
              ? 'font-extrabold text-ktip-ocean-700'
              : selected
                ? 'font-bold text-ktip-sand-900'
                : 'font-medium text-ktip-sand-700'
          )}
        >
          {format(day, 'd')}
        </span>

        {/* Density spine — where the day's weight sits, without scrolling it */}
        <span
          aria-hidden="true"
          className="relative mt-1.5 block h-[3px] overflow-hidden rounded-full bg-ktip-sand-200"
        >
          {spine.map((segment, index) => (
            <span
              key={index}
              className={cn('absolute inset-y-0 rounded-full opacity-80', segment.accentClass)}
              style={{ left: `${segment.leftPct}%`, width: `${Math.max(segment.widthPct, 1.5)}%` }}
            />
          ))}
        </span>
      </button>
    )
  }

  return (
    <div
      key={format(gridStart, 'yyyy-MM-dd')}
      className={cn(direction === 'left' ? 'animate-cal-left' : 'animate-cal-right', className)}
    >
      {/* Day headers */}
      <div className="flex border-b border-cal-line">
        <div className={cn(GUTTER, CALENDAR_CHROME_CLASS, 'flex items-end border-r border-cal-line px-2 pb-2 text-ktip-sand-500')}>
          {use24 ? '24H' : '12H'}
        </div>
        {days.map((day) => (
          <div key={day.toISOString()} className="flex min-w-0 flex-1">
            {dayHeader(day)}
          </div>
        ))}
      </div>

      {/* All-day rail */}
      {hasAllDay && (
        <div className="flex border-b border-cal-line bg-ktip-sand-50">
          <div
            className={cn(
              GUTTER,
              CALENDAR_CHROME_CLASS,
              'flex items-center border-r border-cal-line px-2 py-1.5 text-ktip-sand-500'
            )}
          >
            <Trans>All day</Trans>
          </div>
          {layout.columns.map((column) => (
            <div
              key={column.key}
              className={cn(
                'flex min-w-0 flex-1 flex-col gap-1 border-l border-cal-line p-1 first:border-l-0',
                isSameDay(column.day, selectedDate) && 'bg-ktip-ocean-50/40',
                columnVisibility(column.day)
              )}
            >
              {column.allDay.map((item) => (
                <CalendarAllDayChip
                  key={item.id}
                  item={item}
                  className="h-7"
                  onSelect={onSelectItem}
                  selected={item.id === selectedItemId}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div className="max-h-[34rem] overflow-y-auto">
        <div className="relative flex pt-2">
          <div className={cn(GUTTER, 'relative border-r border-cal-line')} aria-hidden="true">
            {layout.hours.slice(0, -1).map((hour, index) => (
              <div
                key={hour}
                className={cn(
                  CALENDAR_META_CLASS,
                  'absolute right-2 -translate-y-1/2 text-ktip-sand-500'
                )}
                style={{ top: index * HOUR_PX }}
              >
                {formatHourLabel(hour, use24)}
              </div>
            ))}

            {/* The now-line's own clock, in the gutter where the hours are */}
            {nowPx !== null && (
              <div
                className={cn(
                  CALENDAR_META_CLASS,
                  'absolute right-1 -translate-y-1/2 rounded-cal-sm bg-ktip-tropical-500 px-1 py-0.5 font-bold text-brand-navy'
                )}
                style={{ top: nowPx }}
              >
                {nowLabel}
              </div>
            )}
          </div>

          {layout.columns.map((column) => (
            <DayColumn
              key={column.key}
              column={column}
              layout={layout}
              selected={isSameDay(column.day, selectedDate)}
              today={isToday(column.day)}
              nowPx={nowPx}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              className={columnVisibility(column.day)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
