import { useMemo, useState } from 'react'
import { addDays, eachDayOfInterval, format } from 'date-fns'
import { cn } from '../../lib/utils'
import { groupItemsByDay } from '../../lib/calendar'
import {
  CALENDAR_KIND_DOT_COLORS,
  CALENDAR_KIND_LABELS,
} from '../../lib/constants'
import { useAuth } from '../../contexts/AuthContext'
import { useCalendarFeed, type CalendarScope } from '../../hooks/useCalendarFeed'
import { CalendarGrid } from './CalendarGrid'
import { CalendarDayPanel } from './CalendarDayPanel'
import { useCalendarMonth } from './useCalendarMonth'
import type { CalendarItemKind } from '../../lib/calendar'

interface DashboardCalendarProps {
  /** 'platform' = everything on the platform (admin); 'personal' = the user's own items */
  scope: CalendarScope
  className?: string
}

const PLATFORM_KINDS: CalendarItemKind[] = ['event', 'grant_deadline', 'grant_application']
const PERSONAL_KINDS: CalendarItemKind[] = [
  'event',
  'grant_deadline',
  'rsvp',
  'grant_application',
]

/**
 * Aggregate calendar used by both dashboards: events, grant deadlines, the
 * user's registrations and grant-application activity in one month grid.
 */
export function DashboardCalendar({ scope, className }: DashboardCalendarProps) {
  const auth = useAuth()
  const availableKinds = scope === 'platform' ? PLATFORM_KINDS : PERSONAL_KINDS
  const [activeKinds, setActiveKinds] = useState<CalendarItemKind[]>(availableKinds)

  const {
    monthDate,
    selectedDate,
    direction,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrevMonth,
    goNextMonth,
    goToday,
  } = useCalendarMonth()

  const { items, loading } = useCalendarFeed({
    scope,
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
    kinds: activeKinds,
    userId: auth.user?.id,
  })

  const itemsByDay = useMemo(
    () => groupItemsByDay(items, gridStart, gridEnd),
    [items, gridStart, gridEnd]
  )

  const selectedDayItems = itemsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? []

  const toggleKind = (kind: CalendarItemKind) => {
    setActiveKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]
    )
  }

  const jumpToNextItem = () => {
    const from = addDays(selectedDate, 1)
    if (from <= gridEnd) {
      for (const day of eachDayOfInterval({ start: from, end: gridEnd })) {
        if (itemsByDay.has(format(day, 'yyyy-MM-dd'))) {
          setSelectedDate(day)
          return
        }
      }
    }
    goNextMonth()
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Kind filters */}
      <div className="flex flex-wrap items-center gap-2">
        {availableKinds.map((kind) => {
          const on = activeKinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              aria-pressed={on}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                on
                  ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'border-gray-200 bg-transparent text-gray-500 hover:bg-ktip-sand-50'
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  CALENDAR_KIND_DOT_COLORS[kind],
                  !on && 'opacity-40'
                )}
              />
              {CALENDAR_KIND_LABELS[kind]}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-6 items-start">
        <CalendarGrid
          monthDate={monthDate}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          direction={direction}
          onSelectDate={setSelectedDate}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          onToday={goToday}
          itemNoun="item"
        />
        <CalendarDayPanel
          date={selectedDate}
          items={selectedDayItems}
          loading={loading}
          itemNoun="item"
          emptyLabel="Nothing scheduled on this day"
          onJumpToNext={jumpToNextItem}
        />
      </div>
    </div>
  )
}
