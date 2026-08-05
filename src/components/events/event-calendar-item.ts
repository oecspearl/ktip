import { createElement } from 'react'
import { MapPin, Video } from 'lucide-react'
import {
  CALENDAR_ACCENT_COLORS,
  CALENDAR_ACCENT_DOT_COLORS,
  CALENDAR_ACCENT_GRADIENTS,
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
  const accent = event.accent_color ?? null
  return {
    id: `event:${event.id}`,
    kind: 'event',
    title: event.title,
    start: event.start_date,
    end: event.end_date,
    href: entityPath('event', event),
    // The organiser's own colour wins; the type palette is the fallback it
    // always was (migration 105)
    chipClass: accent
      ? CALENDAR_ACCENT_COLORS[accent]
      : EVENT_TYPE_COLORS[event.event_type],
    dotClass: accent
      ? CALENDAR_ACCENT_DOT_COLORS[accent]
      : EVENT_TYPE_DOT_COLORS[event.event_type],
    gradientClass: accent
      ? CALENDAR_ACCENT_GRADIENTS[accent]
      : (EVENT_TYPE_GRADIENTS[event.event_type] ?? CALENDAR_FALLBACK_GRADIENT),
    badgeLabel: EVENT_TYPE_LABELS[event.event_type],
    subtitle: event.is_virtual ? 'Virtual' : event.location || 'Location TBA',
    // The summary is written to be read on its own; the description is the full
    // page body and only stands in when there is no summary
    description: event.summary || event.description,
    locationLabel: event.is_virtual ? 'Virtual event' : event.location,
    icon: event.is_virtual ? Video : MapPin,
    badges: event.is_climate_action ? createElement(ClimateBadge) : undefined,
    avatarUrl: event.organizer?.avatar_url,
    avatarName: event.organizer?.display_name,
    statusLabel: statusLabel(event),
    dimmed: event.status === 'cancelled',
  }
}
