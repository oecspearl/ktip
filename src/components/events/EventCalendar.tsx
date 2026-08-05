import { useCallback, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarGrid } from '../calendar/CalendarGrid'
import { CalendarShell } from '../calendar/CalendarShell'
import { CalendarDayPanel } from '../calendar/CalendarDayPanel'
import { WeekView } from '../calendar/WeekView'
import { YearView } from '../calendar/YearView'
import { CalendarNoteComposer } from '../calendar/CalendarNoteComposer'
import { eventToCalendarItem } from './event-calendar-item'
import { useAuth } from '../../contexts/AuthContext'
import { useCalendarNotes } from '../../hooks/useCalendarNotes'
import { calendarNoteToItem } from '../../lib/calendar-note-item'
import { groupItemsByDay, type CalendarItem } from '../../lib/calendar'
import type { CalendarView } from '../calendar/useCalendarRange'
import type { Event } from '../../types'
import { useLingui } from '@lingui/react/macro'

interface EventCalendarProps {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  monthDate: Date
  anchorDate: Date
  gridStart: Date
  gridEnd: Date
  selectedDate: Date
  eventsByDay: Map<string, Event[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  /** Drops from the year view into one of its months */
  onOpenMonth: (month: Date) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSelectYear: (year: number) => void
  loading?: boolean
  onJumpToNext?: () => void
  /** Wired to the New button and the N shortcut */
  onNew?: () => void
}

/**
 * Events-page calendar — adapts `Event`s to `CalendarItem`s and renders the
 * shared frame: month grid, week time-grid or day column, with the day agenda
 * and item detail in the panel.
 */
export function EventCalendar({
  view,
  onViewChange,
  monthDate,
  anchorDate,
  gridStart,
  gridEnd,
  selectedDate,
  eventsByDay,
  direction,
  onSelectDate,
  onOpenMonth,
  onPrev,
  onNext,
  onToday,
  onSelectYear,
  loading,
  onJumpToNext,
  onNew,
}: EventCalendarProps) {
  const { t } = useLingui()
  const auth = useAuth()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  // The viewer's own notes ride along with the events. Signed out there are
  // none to fetch and nothing to add, so the whole feature simply is not there.
  const { notes, createNote, creating } = useCalendarNotes({
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
    userId: auth.user?.id,
  })

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const [key, events] of eventsByDay) {
      map.set(key, events.map(eventToCalendarItem))
    }
    // Notes are dated the same way events are, so they go through the same
    // day-bucketing rather than being appended to whatever day they started on
    for (const [key, items] of groupItemsByDay(
      notes.map(calendarNoteToItem),
      gridStart,
      gridEnd
    )) {
      const existing = map.get(key)
      if (existing) existing.push(...items)
      else map.set(key, items)
    }
    return map
  }, [eventsByDay, notes, gridStart, gridEnd])

  const selectedDayItems = useMemo(
    () => itemsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [],
    [itemsByDay, selectedDate]
  )

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    for (const items of itemsByDay.values()) {
      const hit = items.find((item) => item.id === selectedItemId)
      if (hit) return hit
    }
    return null
  }, [itemsByDay, selectedItemId])

  /** Picking a day drops back to that day's agenda — the old detail is stale. */
  const selectDate = useCallback(
    (date: Date) => {
      setSelectedItemId(null)
      onSelectDate(date)
    },
    [onSelectDate]
  )

  const openMonth = useCallback(
    (month: Date) => {
      setSelectedItemId(null)
      onOpenMonth(month)
    },
    [onOpenMonth]
  )

  const selectItem = useCallback((item: CalendarItem | null) => {
    setSelectedItemId(item?.id ?? null)
  }, [])

  const itemCount = useMemo(() => {
    const ids = new Set<string>()
    for (const items of itemsByDay.values()) for (const item of items) ids.add(item.id)
    return ids.size
  }, [itemsByDay])

  return (
    <CalendarShell
      view={view}
      onViewChange={onViewChange}
      monthDate={monthDate}
      anchorDate={anchorDate}
      gridStart={gridStart}
      gridEnd={gridEnd}
      onPrev={onPrev}
      onNext={onNext}
      onToday={onToday}
      onSelectYear={onSelectYear}
      itemCount={itemCount}
      itemNoun="event"
      onNew={onNew}
      focusKey={`${selectedItemId ?? ''}|${format(selectedDate, 'yyyy-MM-dd')}`}
      onDismiss={() => setSelectedItemId(null)}
      panelTutorial="events-day-panel"
      panel={
        <CalendarDayPanel
          date={selectedDate}
          items={selectedDayItems}
          loading={loading}
          itemNoun="event"
          emptyLabel={t`No events on this day`}
          onJumpToNext={onJumpToNext}
          selectedItem={selectedItem}
          onSelectItem={selectItem}
          onAddNote={auth.user ? () => setComposing(true) : undefined}
          composer={
            composing ? (
              <CalendarNoteComposer
                date={selectedDate}
                saving={creating}
                onCancel={() => setComposing(false)}
                onSubmit={async (draft) => {
                  await createNote(draft)
                  setComposing(false)
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
          onSelectMonth={openMonth}
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
          itemNoun="event"
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
          itemNoun="event"
        />
      )}
    </CalendarShell>
  )
}
