import { createElement } from 'react'
import { MapPin, Video } from 'lucide-react'
import {
  CALENDAR_FALLBACK_GRADIENT,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_DOT_COLORS,
  EVENT_TYPE_GRADIENTS,
  EVENT_TYPE_LABELS,
} from '../../lib/constants'
import { ClimateBadge } from '../ui/ClimateBadge'
import type { CalendarItem } from '../../lib/calendar'
import { entityPath } from '../../lib/slug'
import type { Event } from '../../types'

/** Only non-live events carry a status overlay — a published event needs none. */
function statusLabel(event: Event): string | undefined {
  if (event.status === 'cancelled') return 'Cancelled'
  if (event.status === 'draft') return 'Draft'
  return undefined
}

/** Map an `Event` onto the generic calendar item shape. */
export function eventToCalendarItem(event: Event): CalendarItem {
  return {
    id: `event:${event.id}`,
    kind: 'event',
    title: event.title,
    start: event.start_date,
    end: event.end_date,
    href: entityPath('event', event),
    chipClass: EVENT_TYPE_COLORS[event.event_type],
    dotClass: EVENT_TYPE_DOT_COLORS[event.event_type],
    gradientClass: EVENT_TYPE_GRADIENTS[event.event_type] ?? CALENDAR_FALLBACK_GRADIENT,
    badgeLabel: EVENT_TYPE_LABELS[event.event_type],
    subtitle: event.is_virtual ? 'Virtual' : event.location || 'Location TBA',
    icon: event.is_virtual ? Video : MapPin,
    badges: event.is_climate_action ? createElement(ClimateBadge) : undefined,
    avatarUrl: event.organizer?.avatar_url,
    avatarName: event.organizer?.display_name,
    statusLabel: statusLabel(event),
    dimmed: event.status === 'cancelled',
  }
}
