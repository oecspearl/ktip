import type { ComponentType, ReactNode } from 'react'
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
export type CalendarItemKind = 'event' | 'grant_deadline' | 'rsvp' | 'grant_application'

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
