import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { FileText, MapPin, Timer, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import {
  CALENDAR_KIND_COLORS,
  CALENDAR_KIND_DOT_COLORS,
  CALENDAR_KIND_GRADIENTS,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_DOT_COLORS,
  EVENT_TYPE_GRADIENTS,
  EVENT_TYPE_LABELS,
  GRANT_APPLICATION_STATUS_LABELS,
  RSVP_STATUS_LABELS,
} from '../lib/constants'
import { foldRsvpsIntoEvents } from '../lib/calendar'
import type { CalendarItem, CalendarItemKind } from '../lib/calendar'
import { entityPath } from '../lib/slug'
import type { Event, Grant } from '../types'

export type CalendarScope = 'platform' | 'personal'

interface CalendarFeedOptions {
  /** 'platform' = everything (admin); 'personal' = only this user's items */
  scope: CalendarScope
  /** ISO start of the visible grid */
  start: string
  /** ISO end of the visible grid */
  end: string
  kinds: CalendarItemKind[]
  /** Required for the personal scope's own-records filters */
  userId?: string
  enabled?: boolean
}

function eventItem(event: Event, dimmed: boolean): CalendarItem {
  return {
    id: `event:${event.id}`,
    kind: 'event',
    title: event.title,
    start: event.start_date,
    end: event.end_date,
    href: entityPath('event', event),
    chipClass: EVENT_TYPE_COLORS[event.event_type] ?? CALENDAR_KIND_COLORS.event,
    dotClass: EVENT_TYPE_DOT_COLORS[event.event_type] ?? CALENDAR_KIND_DOT_COLORS.event,
    gradientClass: EVENT_TYPE_GRADIENTS[event.event_type] ?? CALENDAR_KIND_GRADIENTS.event,
    badgeLabel: EVENT_TYPE_LABELS[event.event_type] ?? 'Event',
    subtitle:
      event.status === 'draft'
        ? 'Draft'
        : event.is_virtual
          ? 'Virtual'
          : event.location || 'Location TBA',
    icon: event.is_virtual ? Video : MapPin,
    avatarUrl: event.organizer?.avatar_url,
    avatarName: event.organizer?.display_name,
    statusLabel:
      event.status === 'cancelled' ? 'Cancelled' : event.status === 'draft' ? 'Draft' : undefined,
    dimmed,
  }
}

/**
 * Aggregates every dated record relevant to a dashboard into `CalendarItem`s for
 * the visible month window. Each kind is fetched only when it is toggled on.
 */
export function useCalendarFeed({
  scope,
  start,
  end,
  kinds,
  userId,
  enabled = true,
}: CalendarFeedOptions) {
  const wants = (kind: CalendarItemKind) => kinds.includes(kind)

  const fetchFeed = async (): Promise<CalendarItem[]> => {
    // Multi-day spans can start before the window — reach back a month for them
    const eventsFrom = subDays(new Date(start), 31).toISOString()

    const [events, grants, rsvps, applications] = await Promise.all([
      wants('event')
        ? (async () => {
            let query = supabase
              .from('events')
              // organizer joined for the week view's avatar chips
              .select('*, organizer:profiles(*)')
              .gte('start_date', eventsFrom)
              .lte('start_date', end)
              .order('start_date', { ascending: true })
            // Platform scope keeps drafts (RLS limits them to admins/organizers)
            if (scope === 'personal') query = query.neq('status', 'draft' as any)
            const { data, error } = await query
            if (error) throw error
            // Same laundering as useEvents — the generated row type does not
            // model the profiles join
            return ((data as any[]) || []) as Event[]
          })()
        : Promise.resolve([] as Event[]),

      wants('grant_deadline')
        ? (async () => {
            const { data, error } = await supabase
              .from('grants')
              .select('*')
              .eq('is_active', true)
              .not('deadline', 'is', null)
              .gte('deadline', start)
              .lte('deadline', end)
              .order('deadline', { ascending: true })
            if (error) throw error
            return ((data as any[]) || []) as Grant[]
          })()
        : Promise.resolve([] as Grant[]),

      wants('rsvp') && userId
        ? (async () => {
            const { data, error } = await supabase
              .from('event_rsvps')
              .select('*, event:events(*)')
              .eq('user_id', userId)
            if (error) throw error
            return (data as any[]) || []
          })()
        : Promise.resolve([] as any[]),

      wants('grant_application') && (scope === 'platform' || userId)
        ? (async () => {
            let query = supabase
              .from('grant_applications')
              .select('*, grant:grants(*)')
              .gte('updated_at', start)
              .lte('updated_at', end)
              .order('updated_at', { ascending: true })
            if (scope === 'personal') query = query.eq('user_id', userId!)
            else query = query.neq('status', 'draft' as any)
            const { data, error } = await query
            if (error) throw error
            return (data as any[]) || []
          })()
        : Promise.resolve([] as any[]),
    ])

    const items: CalendarItem[] = []
    // Keyed so an RSVP can annotate its event instead of adding a second row
    const eventItems = new Map<string, CalendarItem>()

    for (const event of events) {
      const item = eventItem(event, event.status === 'cancelled' || event.status === 'draft')
      items.push(item)
      eventItems.set(event.id, item)
    }

    for (const grant of grants) {
      if (!grant.deadline) continue
      items.push({
        id: `grant_deadline:${grant.id}`,
        kind: 'grant_deadline',
        title: `Deadline: ${grant.title}`,
        start: grant.deadline,
        href: entityPath('grant', grant),
        chipClass: CALENDAR_KIND_COLORS.grant_deadline,
        dotClass: CALENDAR_KIND_DOT_COLORS.grant_deadline,
        gradientClass: CALENDAR_KIND_GRADIENTS.grant_deadline,
        badgeLabel: 'Grant Deadline',
        subtitle: 'Applications close',
        icon: Timer,
      })
    }

    const windowStart = new Date(eventsFrom)
    const windowEnd = new Date(end)
    const visibleRsvps = rsvps.filter((rsvp) => {
      const event = rsvp.event as Event | null
      if (!event) return false
      const eventStart = new Date(event.start_date)
      return eventStart >= windowStart && eventStart <= windowEnd
    })

    // Registrations ride on their event's row rather than adding a second one.
    // Whatever has no event row left on the calendar still gets its own entry.
    for (const rsvp of foldRsvpsIntoEvents(eventItems, visibleRsvps)) {
      const event = rsvp.event as Event
      items.push({
        id: `rsvp:${rsvp.id}`,
        kind: 'rsvp',
        title: event.title,
        start: event.start_date,
        end: event.end_date,
        href: entityPath('event', event),
        chipClass: CALENDAR_KIND_COLORS.rsvp,
        dotClass: CALENDAR_KIND_DOT_COLORS.rsvp,
        gradientClass: CALENDAR_KIND_GRADIENTS.rsvp,
        badgeLabel: 'Registered',
        subtitle: RSVP_STATUS_LABELS[rsvp.status] ?? undefined,
        icon: event.is_virtual ? Video : MapPin,
        statusLabel:
          rsvp.status === 'confirmed' ? undefined : RSVP_STATUS_LABELS[rsvp.status] ?? undefined,
        dimmed: rsvp.status === 'cancelled',
        mine: true,
      })
    }

    for (const application of applications) {
      const title = application.grant?.title ?? 'Grant application'
      items.push({
        id: `grant_application:${application.id}`,
        kind: 'grant_application',
        title: `Application: ${title}`,
        start: application.updated_at,
        href: scope === 'platform' ? '/admin/grants' : '/grants/my-applications',
        chipClass: CALENDAR_KIND_COLORS.grant_application,
        dotClass: CALENDAR_KIND_DOT_COLORS.grant_application,
        gradientClass: CALENDAR_KIND_GRADIENTS.grant_application,
        badgeLabel: 'Application',
        subtitle: GRANT_APPLICATION_STATUS_LABELS[application.status] ?? undefined,
        icon: FileText,
        statusLabel: GRANT_APPLICATION_STATUS_LABELS[application.status] ?? undefined,
        mine: scope === 'personal',
      })
    }

    return items
  }

  const active = enabled && kinds.length > 0 && (scope === 'platform' || Boolean(userId))

  const query = useQuery({
    queryKey: keys.list('calendar-feed', {
      scope,
      // Day granularity keeps the key stable across re-renders within a month
      start: format(new Date(start), 'yyyy-MM-dd'),
      end: format(new Date(end), 'yyyy-MM-dd'),
      kinds: [...kinds].sort(),
      userId: scope === 'personal' ? userId : undefined,
    }),
    queryFn: fetchFeed,
    enabled: active,
  })

  return {
    items: active ? query.data : [],
    // A disabled query stays `isPending` forever — never report that as loading
    loading: active && (query.isPending || query.isFetching),
    error: query.error,
    refetch: query.refetch,
  }
}
