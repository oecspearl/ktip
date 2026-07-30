import { format, isSameDay, startOfDay } from 'date-fns'
import type { CalendarItem } from './calendar'

/** Default visible window when nothing pushes it wider — 8am to 8pm. */
export const DEFAULT_WINDOW_START_MIN = 8 * 60
export const DEFAULT_WINDOW_END_MIN = 20 * 60

/**
 * Floor on a card's rendered duration. Grant deadlines and application
 * timestamps have no duration at all and would otherwise collapse to 0px.
 */
export const MIN_ITEM_MINUTES = 45

const MINUTES_PER_DAY = 24 * 60

export interface PositionedItem {
  item: CalendarItem
  /** Minutes from midnight */
  startMin: number
  /** Minutes from midnight, already widened to `MIN_ITEM_MINUTES` */
  endMin: number
  /** Offset from the top of the grid body, 0–100 */
  topPct: number
  /** Height as a share of the grid body, 0–100 */
  heightPct: number
  /** Column index within its overlap cluster */
  lane: number
  /** Width of the overlap cluster this item belongs to */
  lanes: number
}

export interface WeekColumn {
  day: Date
  /** `yyyy-MM-dd`, the same key `groupByDay` produces */
  key: string
  /** Multi-day spans — rendered on the rail above the time grid */
  allDay: CalendarItem[]
  timed: PositionedItem[]
}

export interface WeekLayout {
  /** Minutes from midnight at the top of the grid */
  startMin: number
  /** Minutes from midnight at the bottom of the grid */
  endMin: number
  /** Whole-hour marks to label, `startMin/60 … endMin/60` */
  hours: number[]
  columns: WeekColumn[]
}

interface BuildOptions {
  windowStartMin?: number
  windowEndMin?: number
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

/**
 * Assign overlapping items to side-by-side lanes. Items are swept in start
 * order into clusters of mutually-overlapping entries; every item in a cluster
 * reports the same `lanes` count so their widths add up to the full column.
 */
function packLanes(items: PositionedItem[]): void {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  let cluster: PositionedItem[] = []
  let laneEnds: number[] = []

  const flush = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length || 1
    cluster = []
    laneEnds = []
  }

  for (const entry of sorted) {
    // No lane is still occupied at this start time — the cluster is closed
    if (cluster.length > 0 && laneEnds.every((end) => end <= entry.startMin)) flush()

    let lane = laneEnds.findIndex((end) => end <= entry.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(entry.endMin)
    } else {
      laneEnds[lane] = entry.endMin
    }

    entry.lane = lane
    cluster.push(entry)
  }

  flush()
}

/**
 * Turn a week's worth of `CalendarItem`s into positioned week-view cards.
 * Pure — no React, no DOM — so the layout rules stay unit-testable.
 */
export function buildWeekLayout(
  days: Date[],
  itemsByDay: Map<string, CalendarItem[]>,
  options: BuildOptions = {}
): WeekLayout {
  const columns: WeekColumn[] = days.map((day) => {
    const key = format(day, 'yyyy-MM-dd')
    const items = itemsByDay.get(key) ?? []
    const allDay: CalendarItem[] = []
    const timed: PositionedItem[] = []

    for (const item of items) {
      if (isAllDayItem(item)) {
        allDay.push(item)
        continue
      }
      const start = new Date(item.start)
      if (Number.isNaN(start.getTime())) continue
      const rawEnd = item.end ? new Date(item.end) : start
      const startMin = minutesFromMidnight(start)
      const rawEndMin = Number.isNaN(rawEnd.getTime()) ? startMin : minutesFromMidnight(rawEnd)
      const endMin = Math.min(
        MINUTES_PER_DAY,
        Math.max(rawEndMin, startMin + MIN_ITEM_MINUTES)
      )
      timed.push({ item, startMin, endMin, topPct: 0, heightPct: 0, lane: 0, lanes: 1 })
    }

    packLanes(timed)
    return { day, key, allDay, timed }
  })

  // Widen the default window to cover anything scheduled outside it
  let startMin = options.windowStartMin ?? DEFAULT_WINDOW_START_MIN
  let endMin = options.windowEndMin ?? DEFAULT_WINDOW_END_MIN
  for (const column of columns) {
    for (const entry of column.timed) {
      startMin = Math.min(startMin, Math.floor(entry.startMin / 60) * 60)
      endMin = Math.max(endMin, Math.ceil(entry.endMin / 60) * 60)
    }
  }
  startMin = Math.max(0, startMin)
  endMin = Math.min(MINUTES_PER_DAY, Math.max(endMin, startMin + 60))

  const span = endMin - startMin
  for (const column of columns) {
    for (const entry of column.timed) {
      const top = ((entry.startMin - startMin) / span) * 100
      const height = ((entry.endMin - entry.startMin) / span) * 100
      entry.topPct = Math.max(0, Math.min(100, top))
      entry.heightPct = Math.max(0, Math.min(100 - entry.topPct, height))
    }
  }

  const hours: number[] = []
  for (let hour = startMin / 60; hour <= endMin / 60; hour++) hours.push(hour)

  return { startMin, endMin, hours, columns }
}

/**
 * Where a wall-clock time sits in the grid body, as a percentage. `null` when
 * it falls outside the visible window (so the now-line is simply not drawn).
 */
export function timeToPct(date: Date, layout: WeekLayout): number | null {
  const minutes = minutesFromMidnight(date)
  if (minutes < layout.startMin || minutes > layout.endMin) return null
  return ((minutes - layout.startMin) / (layout.endMin - layout.startMin)) * 100
}

/** `9 → "9 AM"`, `13 → "1 PM"`, `0 → "12 AM"` */
export function formatHourLabel(hour: number): string {
  const normalized = hour % 24
  const suffix = normalized < 12 ? 'AM' : 'PM'
  const display = normalized % 12 === 0 ? 12 : normalized % 12
  return `${display} ${suffix}`
}
