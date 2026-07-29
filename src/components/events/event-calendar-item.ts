import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_DOT_COLORS,
  EVENT_TYPE_LABELS,
} from '../../lib/constants'
import type { CalendarItem } from '../../lib/calendar'
import type { Event } from '../../types'

/** Map an `Event` onto the generic calendar item shape. */
export function eventToCalendarItem(event: Event): CalendarItem {
  return {
    id: `event:${event.id}`,
    kind: 'event',
    title: event.title,
    start: event.start_date,
    end: event.end_date,
    href: `/events/${event.id}`,
    chipClass: EVENT_TYPE_COLORS[event.event_type],
    dotClass: EVENT_TYPE_DOT_COLORS[event.event_type],
    badgeLabel: EVENT_TYPE_LABELS[event.event_type],
    subtitle: event.is_virtual ? 'Virtual' : event.location || 'Location TBA',
    dimmed: event.status === 'cancelled',
  }
}
