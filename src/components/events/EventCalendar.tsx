import { useMemo } from 'react'
import { CalendarGrid } from '../calendar/CalendarGrid'
import { eventToCalendarItem } from './event-calendar-item'
import type { CalendarItem } from '../../lib/calendar'
import type { Event } from '../../types'

interface EventCalendarProps {
  monthDate: Date
  selectedDate: Date
  eventsByDay: Map<string, Event[]>
  direction: 'left' | 'right'
  onSelectDate: (date: Date) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
}

/**
 * Events-page calendar — adapts `Event`s to `CalendarItem`s and renders the
 * shared month grid.
 */
export function EventCalendar({ eventsByDay, ...gridProps }: EventCalendarProps) {
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const [key, events] of eventsByDay) {
      map.set(key, events.map(eventToCalendarItem))
    }
    return map
  }, [eventsByDay])

  return <CalendarGrid {...gridProps} itemsByDay={itemsByDay} itemNoun="event" />
}
