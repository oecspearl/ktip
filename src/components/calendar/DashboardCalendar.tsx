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
import { CalendarShell } from './CalendarShell'
import { CalendarDayPanel } from './CalendarDayPanel'
import { WeekView } from './WeekView'
import { useCalendarRange } from './useCalendarRange'
import type { CalendarItemKind } from '../../lib/calendar'
import { useLingui } from '@lingui/react/macro'

interface DashboardCalendarProps {
  /** 'platform' = everything on the platform (admin); 'personal' = the user's own items */
  scope: CalendarScope
  className?: string
}

/**
 * Filter pills answer "what kind of thing is this" only. A registration is not
 * a kind of thing — it is the viewer's tie to an event, so it rides along with
 * `event` and is surfaced by the Only-mine lens instead of its own pill.
 */
const SOURCE_KINDS: CalendarItemKind[] = ['event', 'grant_deadline', 'grant_application']

/**
 * Aggregate calendar used by both dashboards: events, grant deadlines, the
 * user's registrations and grant-application activity in one month grid.
 */
export function DashboardCalendar({ scope, className }: DashboardCalendarProps) {
    const { t, i18n } = useLingui()
  const auth = useAuth()
  const availableKinds = SOURCE_KINDS
  const [activeKinds, setActiveKinds] = useState<CalendarItemKind[]>(availableKinds)
  const [onlyMine, setOnlyMine] = useState(false)
  // Registrations annotate events, so they are only worth fetching alongside them
  const feedKinds = useMemo(
    () =>
      scope === 'personal' && activeKinds.includes('event')
        ? [...activeKinds, 'rsvp' as CalendarItemKind]
        : activeKinds,
    [scope, activeKinds]
  )

  const {
    view,
    setView,
    monthDate,
    selectedDate,
    direction,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrev,
    goNext,
    goToday,
  } = useCalendarRange()

  const { items, loading } = useCalendarFeed({
    scope,
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
    kinds: feedKinds,
    userId: auth.user?.id,
  })

  const visibleItems = useMemo(
    () => (onlyMine ? (items ?? []).filter((item) => item.mine) : items),
    [items, onlyMine]
  )

  const itemsByDay = useMemo(
    () => groupItemsByDay(visibleItems, gridStart, gridEnd),
    [visibleItems, gridStart, gridEnd]
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
    goNext()
  }

  const mineLens = (
    <div
      role="group"
      aria-label={t`Whose items to show`}
      className="flex items-center gap-0.5 rounded-full border border-ktip-line bg-ktip-canvas/70 p-0.5"
    >
      {[
        { value: false, label: t`All` },
        { value: true, label: t`Only mine` },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => setOnlyMine(option.value)}
          aria-pressed={onlyMine === option.value}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-bold transition-all focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none',
            onlyMine === option.value
              ? 'bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shadow-soft'
              : 'text-ktip-sand-600 hover:text-ktip-ocean-700 hover:bg-ktip-ocean-50'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  const kindFilters = (
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
                  : 'border-ktip-sand-200 bg-transparent text-gray-500 hover:bg-ktip-sand-50'
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  CALENDAR_KIND_DOT_COLORS[kind],
                  !on && 'opacity-40'
                )}
              />
              {i18n._(CALENDAR_KIND_LABELS[kind])}
          </button>
        )
      })}
      {scope === 'personal' && (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-ktip-line" />
          {mineLens}
        </>
      )}
    </div>
  )

  return (
    <div
      className={cn(
        'grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-6 items-start',
        className
      )}
    >
      {/* Filters sit above the card — four pills plus the view switch would
          crowd the header row */}
      <div className="flex flex-col gap-3">
        {kindFilters}
        <CalendarShell
          view={view}
          onViewChange={setView}
          monthDate={monthDate}
          gridStart={gridStart}
          gridEnd={gridEnd}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        >
          {view === 'week' ? (
            <WeekView
              gridStart={gridStart}
              gridEnd={gridEnd}
              selectedDate={selectedDate}
              itemsByDay={itemsByDay}
              direction={direction}
              onSelectDate={setSelectedDate}
              itemNoun="item"
            />
          ) : (
            <CalendarGrid
              monthDate={monthDate}
              selectedDate={selectedDate}
              itemsByDay={itemsByDay}
              direction={direction}
              onSelectDate={setSelectedDate}
              itemNoun="item"
            />
          )}
        </CalendarShell>
      </div>

      <CalendarDayPanel
        date={selectedDate}
        items={selectedDayItems}
        loading={loading}
        itemNoun="item"
        emptyLabel={t`Nothing scheduled on this day`}
        onJumpToNext={jumpToNextItem}
      />
    </div>
  )
}
