import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  startOfWeek,
} from 'date-fns'
import { cn } from '../../lib/utils'
import { CALENDAR_CHROME_CLASS, CALENDAR_ROW_TITLE_CLASS } from '../../lib/constants'
import { CalendarAccentBar, CalendarRelationCheck, calendarItemLabel } from './CalendarAccentBar'
import { CalendarAccentRail } from './CalendarAccentRail'
import { accentWash } from '../../lib/calendar-accent'
import { isPastItem } from '../../lib/calendar-week'
import type { CalendarItem } from '../../lib/calendar'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

interface CalendarGridProps {
  monthDate: Date
  selectedDate: Date
  itemsByDay: Map<string, CalendarItem[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  /** The item open in the detail panel, highlighted in the grid */
  selectedItemId?: string | null
  onSelectItem: (item: CalendarItem) => void
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
  selectedItemId?: string | null
  onSelect: (date: Date) => void
  onSelectItem: (item: CalendarItem) => void
}

function CalendarDayCell({
  day,
  monthDate,
  selectedDate,
  items,
  itemNoun,
  selectedItemId,
  onSelect,
  onSelectItem,
}: CalendarDayCellProps) {
  const { t } = useLingui()
  const inMonth = isSameMonth(day, monthDate)
  const selected = isSameDay(day, selectedDate)
  const today = isToday(day)
  const overflow = items.length - MAX_CHIPS
  const dayLabel = format(day, 'EEEE, MMMM d')
  // itemNoun only ever arrives as "item" or "event" today — a third caller
  // would need its own branch here, the same way the other two do.
  const countLabel =
    itemNoun === 'event'
      ? plural(items.length, { one: '# event', other: '# events' })
      : plural(items.length, { one: '# item', other: '# items' })

  return (
    // The cell is the day picker; the chips inside it are their own buttons, so
    // this is a div with a button role rather than a <button> wrapping buttons
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(day)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(day)
        }
      }}
      aria-pressed={selected}
      aria-label={t`${dayLabel}, ${countLabel}`}
      className={cn(
        'flex min-h-14 cursor-pointer flex-col gap-1 border-b border-l border-cal-line p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ktip-ocean-500 md:min-h-28 md:p-1.5',
        selected
          ? 'bg-ktip-ocean-50/60'
          : isWeekend(day)
            ? 'bg-ktip-sand-50/60 hover:bg-ktip-sand-100/70'
            : 'hover:bg-ktip-sand-50',
        !inMonth && 'text-ktip-sand-400'
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-micro transition-colors',
          today
            ? 'bg-ktip-ocean-600 font-bold text-white dark:bg-ktip-ocean-200'
            : selected
              ? 'font-bold text-ktip-ocean-700'
              : inMonth
                ? 'text-ktip-sand-800'
                : 'text-ktip-sand-400'
        )}
      >
        {format(day, 'd')}
      </span>

      {/* One card per day, not one per event — the same cluster idea the week
          grid uses. A shared rail down the left carries every item's accent in
          order, so a day reads as a single block with a colour spine. */}
      {items.length > 0 && (
        <span className="relative hidden w-full flex-col overflow-hidden rounded-cal-sm border border-ktip-sand-300 bg-ktip-cream pl-[3px] md:flex">
          <CalendarAccentRail
            className="absolute inset-y-0 left-0 w-[3px]"
            bands={items.slice(0, MAX_CHIPS).map((item) => ({
              item,
              weight: 1,
              past: item.dimmed || isPastItem(item),
            }))}
          />

          {items.slice(0, MAX_CHIPS).map((item, index) => {
            const past = item.dimmed || isPastItem(item)
            return (
              <button
                key={item.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(day)
                  onSelectItem(item)
                }}
                title={calendarItemLabel(item)}
                aria-pressed={item.id === selectedItemId}
                style={{
                  // The wash bleeds out of the rail so the bar reads as the
                  // edge of a tint. Dropped on the selected row — two fight
                  backgroundImage:
                    item.id === selectedItemId ? undefined : accentWash(item.dotClass, past),
                }}
                className={cn(
                  'relative w-full overflow-hidden py-0.5 pl-2 pr-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ktip-ocean-500',
                  item.id === selectedItemId
                    ? 'bg-ktip-ocean-50 ring-1 ring-inset ring-ktip-ocean-500'
                    : 'hover:bg-ktip-sand-100/80'
                )}
              >
                {/* Inset so the rule never runs into the rail or the card edge */}
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-1.5 top-0 h-px bg-ktip-sand-200"
                  />
                )}
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      CALENDAR_ROW_TITLE_CLASS,
                      'min-w-0 flex-1 truncate',
                      past ? 'font-normal text-ktip-sand-500' : 'text-ktip-sand-900'
                    )}
                  >
                    {item.title}
                  </span>
                  <CalendarRelationCheck item={item} />
                </span>
                {/* The check must not carry the registration on its own — name it */}
                {item.relation && <span className="sr-only"> — {item.relation.label}</span>}
              </button>
            )
          })}

          {overflow > 0 && (
            <span
              className={cn(
                CALENDAR_CHROME_CLASS,
                'relative border-t border-ktip-sand-200 py-0.5 pl-2 text-ktip-sand-500'
              )}
            >
              <Trans>+{overflow} more</Trans>
            </span>
          )}
        </span>
      )}

      {/* Dots — mobile */}
      {items.length > 0 && (
        <span className="mt-auto flex w-full justify-center gap-0.5 md:hidden">
          {items.slice(0, MAX_DOTS).map((item) => (
            // Two-tone at 6px still reads as "mine" vs "not mine" at a glance
            <CalendarAccentBar
              key={item.id}
              item={item}
              className={cn('h-1.5 w-1.5 rounded-full', item.dimmed && 'opacity-50')}
            />
          ))}
        </span>
      )}
    </div>
  )
}

/**
 * Generic month grid. Rendering is driven entirely by `CalendarItem`s, so both
 * the events page and the dashboard calendars share this one implementation.
 * Header chrome lives in `CalendarShell`, which wraps this and `WeekView`.
 *
 * Cells are ruled rather than gapped — the same paper surface the week grid
 * uses, so switching views changes the density and nothing else.
 */
export function CalendarGrid({
  monthDate,
  selectedDate,
  itemsByDay,
  direction,
  onSelectDate,
  selectedItemId,
  onSelectItem,
  itemNoun = 'event',
  className,
}: CalendarGridProps) {
  const gridStart = startOfWeek(monthDate)
  const gridEnd = endOfWeek(endOfMonth(monthDate))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className={cn('border-r border-t border-cal-line', className)}>
      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-cal-line">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={cn(
              CALENDAR_CHROME_CLASS,
              'border-l border-cal-line px-2 py-2 text-center text-ktip-sand-500'
            )}
          >
            {format(addDays(gridStart, i), 'EEE')}
          </div>
        ))}
      </div>

      {/* Day grid — keyed by month so nav re-fires the slide animation */}
      <div
        key={format(monthDate, 'yyyy-MM')}
        className={cn(
          'grid grid-cols-7',
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
            selectedItemId={selectedItemId}
            onSelect={onSelectDate}
            onSelectItem={onSelectItem}
          />
        ))}
      </div>
    </div>
  )
}
