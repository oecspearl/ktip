import { useMemo } from 'react'
import { CalendarGrid } from '../calendar/CalendarGrid'
import { CalendarShell } from '../calendar/CalendarShell'
import { WeekView } from '../calendar/WeekView'
import { eventToCalendarItem } from './event-calendar-item'
import type { CalendarItem } from '../../lib/calendar'
import type { CalendarView } from '../calendar/useCalendarRange'
import type { Event } from '../../types'

interface EventCalendarProps {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  monthDate: Date
  gridStart: Date
  gridEnd: Date
  selectedDate: Date
  eventsByDay: Map<string, Event[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

/**
 * Events-page calendar — adapts `Event`s to `CalendarItem`s and renders the
 * shared month grid or week time-grid.
 */
export function EventCalendar({
  view,
  onViewChange,
  monthDate,
  gridStart,
  gridEnd,
  selectedDate,
  eventsByDay,
  direction,
  onSelectDate,
  onPrev,
  onNext,
  onToday,
}: EventCalendarProps) {
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const [key, events] of eventsByDay) {
      map.set(key, events.map(eventToCalendarItem))
    }
    return map
  }, [eventsByDay])

  return (
    <CalendarShell
      view={view}
      onViewChange={onViewChange}
      monthDate={monthDate}
      gridStart={gridStart}
      gridEnd={gridEnd}
      onPrev={onPrev}
      onNext={onNext}
      onToday={onToday}
    >
      {view === 'week' ? (
        <WeekView
          gridStart={gridStart}
          gridEnd={gridEnd}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          direction={direction}
          onSelectDate={onSelectDate}
          itemNoun="event"
        />
      ) : (
        <CalendarGrid
          monthDate={monthDate}
          selectedDate={selectedDate}
          itemsByDay={itemsByDay}
          direction={direction}
          onSelectDate={onSelectDate}
          itemNoun="event"
        />
      )}
    </CalendarShell>
  )
}
