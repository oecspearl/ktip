import type { ComponentType, ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import {
  CALENDAR_KIND_COLORS,
  CALENDAR_KIND_DOT_COLORS,
  RSVP_RELATION_LABELS,
  RSVP_STATUS_COLORS,
  RSVP_STATUS_DOT_COLORS,
} from './constants'
import {
  eachDayOfInterval,
  format,
  max as maxDate,
  min as minDate,
  startOfDay,
} from 'date-fns'

/**
 * Source of a dated item on a calendar. Events page only ever uses 'event';
 * the dashboard calendars aggregate every kind.
 */
export type CalendarItemKind =
  | 'event'
  | 'grant_deadline'
  | 'rsvp'
  | 'grant_application'
  /** The viewer's own note, task or reminder (migration 105) */
  | 'calendar_note'

/**
 * The viewer's own tie to an item that has no date of its own — an RSVP happens
 * *on* an event, it is not a second thing on the calendar. Folded into the host
 * item so one dated record renders as exactly one row.
 */
export interface CalendarItemRelation {
  kind: CalendarItemKind
  /** Short state, e.g. "Registered", "Waitlisted" */
  label: string
  /** Optional qualifier shown after the label in the day panel */
  detail?: string
  /** Solid accent used for the lower half of the item's split accent bar */
  dotClass: string
  /** Badge classes (bg + text + border) for the day panel */
  chipClass: string
  /** A withdrawn/cancelled tie — badge reads with an ✕ rather than a ✓ */
  negative?: boolean
}

/**
 * Display-ready calendar entry. Producers (events page adapter, dashboard feed)
 * pick the colors so the grid stays presentation-agnostic.
 */
export interface CalendarItem {
  /** Unique across kinds — prefix with the kind, e.g. `event:${id}` */
  id: string
  kind: CalendarItemKind
  title: string
  /** ISO timestamp */
  start: string
  /** ISO timestamp — set for multi-day spans */
  end?: string | null
  href?: string
  /** Tailwind chip classes (bg + text + border) */
  chipClass: string
  /** Solid accent color for day dots / card accent bars */
  dotClass: string
  /** Kind or type label shown as a badge in the day panel */
  badgeLabel?: string
  /** Secondary line in the day panel, e.g. "Virtual", "Deadline" */
  subtitle?: string
  /** Long-form body shown only in the panel's detail state */
  description?: string | null
  /** Where it happens, spelled out for the detail state — room, link, address */
  locationLabel?: string | null
  /**
   * Where the row came from. Everything on the platform is 'ktip'; 'external'
   * is reserved for subscribed calendars, which cannot be opened or edited here.
   */
  source?: 'ktip' | 'external'
  dimmed?: boolean
  /** Soft gradient fill (bg + border + text) used by week-view cards and month chips */
  gradientClass?: string
  /** Owner/organizer avatar shown on week cards */
  avatarUrl?: string | null
  /** Owner/organizer name — avatar alt text and initials fallback */
  avatarName?: string | null
  /** Muted overlay label for non-live items: "Cancelled", "Draft", "Pending" */
  statusLabel?: string
  /** Leading icon in the day panel, e.g. MapPin for in-person, Video for virtual */
  icon?: ComponentType<{ size?: number | string; className?: string }>
  /** Extra badges rendered after the subtitle in the day panel */
  badges?: ReactNode
  /** The viewer's own tie to this item — drives the split accent bar */
  relation?: CalendarItemRelation
  /** True when this item belongs to the viewer — powers the "Only mine" lens */
  mine?: boolean
}

/** The shape `foldRsvpsIntoEvents` needs from an `event_rsvps` row. */
export interface RsvpLike {
  event_id: string
  status: string
}

/** The viewer's registration, expressed as a relation on its event's row. */
export function rsvpRelation(status: string): CalendarItemRelation {
  const relation: CalendarItemRelation = {
    kind: 'rsvp',
    label: RSVP_RELATION_LABELS[status] ?? i18n._(msg`Registered`),
    dotClass: RSVP_STATUS_DOT_COLORS[status] ?? CALENDAR_KIND_DOT_COLORS.rsvp,
    chipClass: RSVP_STATUS_COLORS[status] ?? CALENDAR_KIND_COLORS.rsvp,
  }
  // Neither is attendance, and `negative` is what suppresses the check on the
  // row — a declined invitation showing the same tick as a confirmed seat is
  // the one reading the mark must never allow
  if (status === 'cancelled' || status === 'declined') {
    relation.negative = true
    relation.detail =
      status === 'declined'
        ? i18n._(msg`You declined this invitation`)
        : i18n._(msg`You are no longer attending`)
  }
  return relation
}

/**
 * A registration has no date of its own — it happens *on* an event. Fold each
 * one into its event's row so a registered event renders once, carrying the
 * viewer's status, rather than as two identical entries on the same day.
 *
 * Returns the registrations whose event has no row on the calendar (a draft
 * event, or the Events filter is off) so the caller can render those standalone
 * instead of dropping them.
 */
export function foldRsvpsIntoEvents<R extends RsvpLike>(
  eventItems: Map<string, CalendarItem>,
  rsvps: R[]
): R[] {
  const orphans: R[] = []
  for (const rsvp of rsvps) {
    const host = eventItems.get(rsvp.event_id)
    if (!host) {
      orphans.push(rsvp)
      continue
    }
    host.mine = true
    host.relation = rsvpRelation(rsvp.status)
  }
  return orphans
}

/**
 * Bucket anything dated into `yyyy-MM-dd` keys, expanding multi-day spans across
 * every visible day and clamping to the grid window. Entries are sorted by start.
 */
export function groupByDay<T>(
  items: T[] | undefined,
  gridStart: Date,
  gridEnd: Date,
  getSpan: (item: T) => { start: string; end?: string | null }
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  if (!items) return map

  for (const item of items) {
    const span = getSpan(item)
    const spanStart = startOfDay(new Date(span.start))
    let spanEnd = startOfDay(new Date(span.end ?? span.start))
    if (spanEnd < spanStart) spanEnd = spanStart
    const from = maxDate([spanStart, gridStart])
    const to = minDate([spanEnd, gridEnd])
    if (from > to) continue
    for (const day of eachDayOfInterval({ start: from, end: to })) {
      const key = format(day, 'yyyy-MM-dd')
      const list = map.get(key)
      if (list) list.push(item)
      else map.set(key, [item])
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => getSpan(a).start.localeCompare(getSpan(b).start))
  }
  return map
}

/** `groupByDay` specialised for `CalendarItem`s. */
export function groupItemsByDay(
  items: CalendarItem[] | undefined,
  gridStart: Date,
  gridEnd: Date
): Map<string, CalendarItem[]> {
  return groupByDay(items, gridStart, gridEnd, (item) => ({ start: item.start, end: item.end }))
}
