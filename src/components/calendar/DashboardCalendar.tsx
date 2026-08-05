import { useCallback, useMemo, useState } from 'react'
import { addDays, eachDayOfInterval, format } from 'date-fns'
import { groupItemsByDay } from '../../lib/calendar'
import { useAuth } from '../../contexts/AuthContext'
import { useCalendarFeed, type CalendarScope } from '../../hooks/useCalendarFeed'
import { useCalendarNotes } from '../../hooks/useCalendarNotes'
import { calendarNoteToItem } from '../../lib/calendar-note-item'
import { CalendarFilterMenu } from './CalendarFilterMenu'
import { CalendarNoteComposer } from './CalendarNoteComposer'
import { CalendarGrid } from './CalendarGrid'
import { CalendarShell } from './CalendarShell'
import { CalendarDayPanel } from './CalendarDayPanel'
import { WeekView } from './WeekView'
import { YearView } from './YearView'
import { useCalendarRange } from './useCalendarRange'
import type { CalendarItem, CalendarItemKind } from '../../lib/calendar'
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

/** Notes are the viewer's own, so the pill only exists on a personal calendar. */
const PERSONAL_KINDS: CalendarItemKind[] = [...SOURCE_KINDS, 'calendar_note']

/**
 * Aggregate calendar used by both dashboards: events, grant deadlines, the
 * user's registrations and grant-application activity in one frame.
 */
export function DashboardCalendar({ scope, className }: DashboardCalendarProps) {
  const { t } = useLingui()
  const auth = useAuth()
  const availableKinds = scope === 'personal' ? PERSONAL_KINDS : SOURCE_KINDS
  const [activeKinds, setActiveKinds] = useState<CalendarItemKind[]>(availableKinds)
  const [onlyMine, setOnlyMine] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  // Registrations annotate events, so they are only worth fetching alongside
  // them. Notes have their own query, so the aggregate feed never asks for them.
  const feedKinds = useMemo(() => {
    const sources = activeKinds.filter((kind) => kind !== 'calendar_note')
    return scope === 'personal' && sources.includes('event')
      ? [...sources, 'rsvp' as CalendarItemKind]
      : sources
  }, [scope, activeKinds])

  const {
    view,
    setView,
    openMonth,
    anchorDate,
    monthDate,
    selectedDate,
    direction,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrev,
    goNext,
    goToday,
    goToYear,
  } = useCalendarRange()

  const { items, loading } = useCalendarFeed({
    scope,
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
    kinds: feedKinds,
    userId: auth.user?.id,
  })

  // Notes are the viewer's own, so they only exist in the personal scope — an
  // admin looking at the platform calendar has no business seeing them
  const personal = scope === 'personal'
  const { notes, createNote, creating } = useCalendarNotes({
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
    userId: auth.user?.id,
    enabled: personal && activeKinds.includes('calendar_note'),
  })

  const visibleItems = useMemo(() => {
    const base = [...(items ?? []), ...notes.map(calendarNoteToItem)]
    return onlyMine ? base.filter((item) => item.mine) : base
  }, [items, notes, onlyMine])

  const itemsByDay = useMemo(
    () => groupItemsByDay(visibleItems, gridStart, gridEnd),
    [visibleItems, gridStart, gridEnd]
  )

  const selectedDayItems = itemsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? []

  const selectedItem = useMemo(
    () => (visibleItems ?? []).find((item) => item.id === selectedItemId) ?? null,
    [visibleItems, selectedItemId]
  )

  /** Picking a day drops back to that day's agenda — the old detail is stale. */
  const selectDate = useCallback(
    (date: Date) => {
      setSelectedItemId(null)
      setSelectedDate(date)
    },
    [setSelectedDate]
  )

  const selectItem = useCallback((item: CalendarItem | null) => {
    setSelectedItemId(item?.id ?? null)
  }, [])

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
          selectDate(day)
          return
        }
      }
    }
    goNext()
  }

  const toolbar = (
    <CalendarFilterMenu
      kinds={availableKinds}
      active={activeKinds}
      onToggle={toggleKind}
      onlyMine={scope === 'personal' ? onlyMine : undefined}
      onOnlyMineChange={scope === 'personal' ? setOnlyMine : undefined}
    />
  )

  return (
    <CalendarShell
      className={className}
      view={view}
      onViewChange={setView}
      monthDate={monthDate}
      anchorDate={anchorDate}
      gridStart={gridStart}
      gridEnd={gridEnd}
      onPrev={goPrev}
      onNext={goNext}
      onToday={goToday}
      onSelectYear={goToYear}
      itemCount={visibleItems?.length}
      itemNoun="item"
      focusKey={`${selectedItemId ?? ''}|${format(selectedDate, 'yyyy-MM-dd')}`}
      onDismiss={() => setSelectedItemId(null)}
      toolbar={toolbar}
      panel={
        <CalendarDayPanel
          date={selectedDate}
          items={selectedDayItems}
          loading={loading}
          itemNoun="item"
          emptyLabel={t`Nothing scheduled on this day`}
          onJumpToNext={jumpToNextItem}
          selectedItem={selectedItem}
          onSelectItem={selectItem}
          onAddNote={personal ? () => setComposing(true) : undefined}
          composer={
            composing ? (
              <CalendarNoteComposer
                date={selectedDate}
                saving={creating}
                onCancel={() => setComposing(false)}
                onSubmit={async (draft) => {
                  await createNote(draft)
                  setComposing(false)
                  // The note has to exist before its pill can show it
                  setActiveKinds((current) =>
                    current.includes('calendar_note') ? current : [...current, 'calendar_note']
                  )
                }}
              />
            ) : undefined
          }
        />
      }
    >
      {view === 'year' ? (
        <YearView
          anchorDate={anchorDate}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          direction={direction}
          onSelectDate={selectDate}
          onSelectMonth={(month: Date) => {
            setSelectedItemId(null)
            openMonth(month)
          }}
        />
      ) : view === 'month' ? (
        <CalendarGrid
          monthDate={monthDate}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          direction={direction}
          onSelectDate={selectDate}
          selectedItemId={selectedItemId}
          onSelectItem={selectItem}
          itemNoun="item"
        />
      ) : (
        <WeekView
          gridStart={gridStart}
          gridEnd={gridEnd}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          direction={direction}
          onSelectDate={selectDate}
          selectedItemId={selectedItemId}
          onSelectItem={selectItem}
          itemNoun="item"
        />
      )}
    </CalendarShell>
  )
}
