import { addMinutes, format, isSameDay, startOfDay } from 'date-fns'
import type { CalendarItem } from './calendar'

/** Default visible window when nothing pushes it wider — 8am to 8pm. */
export const DEFAULT_WINDOW_START_MIN = 8 * 60
export const DEFAULT_WINDOW_END_MIN = 20 * 60

/**
 * Floor on a card's rendered duration. Grant deadlines and application
 * timestamps have no duration at all and would otherwise collapse to 0px.
 */
export const MIN_ITEM_MINUTES = 45

/** Height of one hour row. Layout is in px, not %, because MIN_ROW_PX is. */
export const HOUR_PX = 56

/**
 * Shortest a row inside a cluster may be drawn. Below this a title stops being
 * a title, so short rows are lifted to it and the space is taken from the tall
 * rows in the same cluster rather than from the grid.
 */
export const MIN_ROW_PX = 24

/** The window the day-header density spine maps onto — 6am to 11pm. */
export const SPINE_START_MIN = 6 * 60
export const SPINE_END_MIN = 23 * 60

/** Vertical breathing room under a cluster so consecutive boxes do not touch. */
const CLUSTER_GAP_PX = 3

const MINUTES_PER_DAY = 24 * 60

/** One event inside a cluster box. */
export interface ClusterRow {
  item: CalendarItem
  /** Minutes from midnight */
  startMin: number
  /** Minutes from midnight, already widened to `MIN_ITEM_MINUTES` */
  endMin: number
  /** Rendered height, already lifted to `MIN_ROW_PX` */
  heightPx: number
  /** Already finished — drains its colour rather than fading out */
  past: boolean
}

/**
 * A run of mutually-overlapping events, drawn as ONE opaque box of stacked
 * rows. Lanes were the old answer and they fail at three deep: three concurrent
 * events become three unreadable slivers. Stacked rows stay legible because the
 * box owns the full column width and every row gets at least `MIN_ROW_PX`.
 */
export interface WeekCluster {
  key: string
  /** Earliest start in the cluster, minutes from midnight */
  startMin: number
  /** Latest end in the cluster, minutes from midnight */
  endMin: number
  topPx: number
  heightPx: number
  rows: ClusterRow[]
}

export interface WeekColumn {
  day: Date
  /** `yyyy-MM-dd`, the same key `groupByDay` produces */
  key: string
  /** Multi-day spans — rendered on the rail above the time grid */
  allDay: CalendarItem[]
  clusters: WeekCluster[]
}

export interface WeekLayout {
  /** Minutes from midnight at the top of the grid */
  startMin: number
  /** Minutes from midnight at the bottom of the grid */
  endMin: number
  /** Whole-hour marks to label, `startMin/60 … endMin/60` */
  hours: number[]
  /** Height of the grid body in px */
  bodyPx: number
  columns: WeekColumn[]
}

interface BuildOptions {
  windowStartMin?: number
  windowEndMin?: number
  /** Injectable so the past-flag arithmetic is testable */
  now?: Date
}

/** Multi-day spans go on the all-day rail; everything else is positioned by time. */
export function isAllDayItem(item: CalendarItem): boolean {
  if (!item.end) return false
  const start = new Date(item.start)
  const end = new Date(item.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  return !isSameDay(start, end)
}

function minutesFromMidnight(date: Date): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, (date.getTime() - startOfDay(date).getTime()) / 60000))
}

/** Minutes from midnight for an item on `day`, widened to the readable minimum. */
function span(item: CalendarItem): { startMin: number; endMin: number } | null {
  const start = new Date(item.start)
  if (Number.isNaN(start.getTime())) return null
  const rawEnd = item.end ? new Date(item.end) : start
  const startMin = minutesFromMidnight(start)
  const rawEndMin = Number.isNaN(rawEnd.getTime()) ? startMin : minutesFromMidnight(rawEnd)
  const endMin = Math.min(MINUTES_PER_DAY, Math.max(rawEndMin, startMin + MIN_ITEM_MINUTES))
  return { startMin, endMin }
}

/** Has this item already finished, as of `now`? */
export function isPastItem(item: CalendarItem, now: Date = new Date()): boolean {
  const end = new Date(item.end ?? item.start)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() < now.getTime()
}

/**
 * Split a cluster's height between its rows in proportion to duration, then
 * lift anything under `MIN_ROW_PX`, taking the deficit from the rows that have
 * room to give. A 15-minute row next to a 3-hour one is otherwise 4px tall.
 */
export function rowHeights(
  durations: number[],
  totalPx: number,
  minPx: number = MIN_ROW_PX
): number[] {
  if (durations.length === 0) return []
  const safe = durations.map((d) => Math.max(d, 1))
  const sum = safe.reduce((a, b) => a + b, 0)
  const heights = safe.map((d) => (d / sum) * totalPx)

  let deficit = 0
  let surplus = 0
  for (const h of heights) {
    if (h < minPx) deficit += minPx - h
    else surplus += h - minPx
  }
  if (deficit > 0 && surplus > 0) {
    // Pro rata: every tall row gives up the same share of its own surplus
    const take = Math.min(1, deficit / surplus)
    return heights.map((h) => (h < minPx ? minPx : h - (h - minPx) * take))
  }
  return heights
}

/**
 * Sweep same-day items into clusters of mutually-overlapping entries. Order
 * inside a cluster is earlier start first; when two start together the one that
 * ENDS FIRST sits on top, so the short thing is never buried under the long one.
 */
function buildClusters(items: CalendarItem[], day: Date, now: Date): WeekCluster[] {
  const entries: Array<{ item: CalendarItem; startMin: number; endMin: number }> = []
  for (const item of items) {
    const s = span(item)
    if (s) entries.push({ item, ...s })
  }
  entries.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  const clusters: WeekCluster[] = []
  let current: typeof entries = []
  let currentEnd = -1

  const flush = () => {
    if (current.length === 0) return
    const startMin = current[0].startMin
    const endMin = currentEnd
    clusters.push({
      key: `${format(day, 'yyyy-MM-dd')}:${startMin}`,
      startMin,
      endMin,
      topPx: 0,
      heightPx: 0,
      rows: current.map((entry) => ({
        item: entry.item,
        startMin: entry.startMin,
        endMin: entry.endMin,
        heightPx: 0,
        past: addMinutes(startOfDay(day), entry.endMin).getTime() < now.getTime(),
      })),
    })
    current = []
    currentEnd = -1
  }

  for (const entry of entries) {
    // Nothing in the cluster is still running at this start time — close it
    if (current.length > 0 && entry.startMin >= currentEnd) flush()
    current.push(entry)
    currentEnd = Math.max(currentEnd, entry.endMin)
  }
  flush()

  return clusters
}

/**
 * Turn a run of days' worth of `CalendarItem`s into positioned cluster boxes.
 * Pure — no React, no DOM — so the layout rules stay unit-testable. Works for
 * any day count, which is what makes the day view the week view with one column.
 */
export function buildWeekLayout(
  days: Date[],
  itemsByDay: Map<string, CalendarItem[]>,
  options: BuildOptions = {}
): WeekLayout {
  const now = options.now ?? new Date()

  const columns: WeekColumn[] = days.map((day) => {
    const key = format(day, 'yyyy-MM-dd')
    const items = itemsByDay.get(key) ?? []
    const allDay: CalendarItem[] = []
    const timed: CalendarItem[] = []

    for (const item of items) {
      if (isAllDayItem(item)) allDay.push(item)
      else timed.push(item)
    }

    return { day, key, allDay, clusters: buildClusters(timed, day, now) }
  })

  // Widen the default window to cover anything scheduled outside it
  let startMin = options.windowStartMin ?? DEFAULT_WINDOW_START_MIN
  let endMin = options.windowEndMin ?? DEFAULT_WINDOW_END_MIN
  for (const column of columns) {
    for (const cluster of column.clusters) {
      startMin = Math.min(startMin, Math.floor(cluster.startMin / 60) * 60)
      endMin = Math.max(endMin, Math.ceil(cluster.endMin / 60) * 60)
    }
  }
  startMin = Math.max(0, startMin)
  endMin = Math.min(MINUTES_PER_DAY, Math.max(endMin, startMin + 60))

  const hours: number[] = []
  for (let hour = startMin / 60; hour <= endMin / 60; hour++) hours.push(hour)
  const bodyPx = (hours.length - 1) * HOUR_PX

  for (const column of columns) {
    for (const cluster of column.clusters) {
      const top = ((cluster.startMin - startMin) / 60) * HOUR_PX
      const raw = ((cluster.endMin - cluster.startMin) / 60) * HOUR_PX - CLUSTER_GAP_PX
      // Height first, then the offset is clamped to fit it — a late cluster
      // lifted to the row floor would otherwise hang off the bottom of the grid
      cluster.heightPx = Math.max(cluster.rows.length * MIN_ROW_PX, Math.min(bodyPx, raw))
      cluster.topPx = Math.max(0, Math.min(top, bodyPx - cluster.heightPx))
      const heights = rowHeights(
        cluster.rows.map((row) => row.endMin - row.startMin),
        cluster.heightPx
      )
      cluster.rows.forEach((row, index) => {
        row.heightPx = heights[index]
      })
    }
  }

  return { startMin, endMin, hours, bodyPx, columns }
}

/** Every cluster row on a column, flattened — handy for counts and lookups. */
export function columnRows(column: WeekColumn): ClusterRow[] {
  return column.clusters.flatMap((cluster) => cluster.rows)
}

/** One band on a day header's density spine. */
export interface SpineSegment {
  leftPct: number
  widthPct: number
  /** The item's solid accent class, e.g. `bg-ktip-ocean-500` */
  accentClass: string
}

/**
 * Where a day's items sit across the working day, as bands on a 3px rule under
 * the date. Reading a week's shape should not cost a scroll through the grid.
 */
export function buildDensitySpine(items: CalendarItem[]): SpineSegment[] {
  const window = SPINE_END_MIN - SPINE_START_MIN
  const segments: SpineSegment[] = []

  for (const item of items) {
    if (isAllDayItem(item)) continue
    const s = span(item)
    if (!s) continue
    const from = Math.max(s.startMin, SPINE_START_MIN)
    const to = Math.min(s.endMin, SPINE_END_MIN)
    if (to <= from) continue
    segments.push({
      leftPct: ((from - SPINE_START_MIN) / window) * 100,
      widthPct: ((to - from) / window) * 100,
      accentClass: item.dotClass,
    })
  }

  return segments
}

/**
 * Where a wall-clock time sits in the grid body, in px. `null` when it falls
 * outside the visible window (so the now-line is simply not drawn).
 */
export function timeToPx(date: Date, layout: WeekLayout): number | null {
  const minutes = minutesFromMidnight(date)
  if (minutes < layout.startMin || minutes > layout.endMin) return null
  return ((minutes - layout.startMin) / 60) * HOUR_PX
}

/** `9 → "9 AM"` / `"09:00"`, `13 → "1 PM"` / `"13:00"`, `0 → "12 AM"` / `"00:00"` */
export function formatHourLabel(hour: number, use24 = false): string {
  const normalized = hour % 24
  if (use24) return `${String(normalized).padStart(2, '0')}:00`
  const suffix = normalized < 12 ? 'AM' : 'PM'
  const display = normalized % 12 === 0 ? 12 : normalized % 12
  return `${display} ${suffix}`
}

/** `540 → "9 AM"` / `"09:00"`, `570 → "9:30 AM"` / `"09:30"` */
export function formatMinutes(minutes: number, use24 = false): string {
  const hour = Math.floor(minutes / 60) % 24
  const minute = Math.round(minutes % 60)
  if (use24) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${suffix}`
}

/** `9 – 10:30 AM` — the meridiem is dropped from the start when both share one. */
export function formatMinuteRange(startMin: number, endMin: number, use24 = false): string {
  if (endMin <= startMin) return formatMinutes(startMin, use24)
  if (use24) return `${formatMinutes(startMin, true)} – ${formatMinutes(endMin, true)}`
  const sameHalf = Math.floor(startMin / 60) % 24 < 12 === Math.floor(endMin / 60) % 24 < 12
  const start = sameHalf
    ? formatMinutes(startMin).replace(/ (AM|PM)$/, '')
    : formatMinutes(startMin)
  return `${start} – ${formatMinutes(endMin)}`
}

/** `90 minutes → "1h 30m"`, `45 → "45m"`, `0 → "0m"` */
export function formatDuration(startMin: number, endMin: number): string {
  const total = Math.max(0, Math.round(endMin - startMin))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (!hours && !minutes) return '0m'
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ')
}

/** Minutes from midnight for an item, or `null` when its start is unparseable. */
export function itemSpan(item: CalendarItem): { startMin: number; endMin: number } | null {
  return span(item)
}
