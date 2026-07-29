import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subDays,
} from 'date-fns'
import {
  DEFAULT_OFF_DAYS,
  SCALE_SPECS,
  type BarRect,
  type GanttDirection,
  type GanttEvent,
  type GanttOffDayBand,
  type GanttScale,
  type GanttTick,
  type GanttWindow,
  MIN_BAR_PX,
} from './gantt-types'

type TickUnit = 'day' | 'week' | 'month' | 'quarter'

/** Weeks run Monday-first throughout the gantt. */
const WEEK_OPTS = { weekStartsOn: 1 } as const

/**
 * Distance in days, fractional. The whole part comes from date-fns' calendar
 * diff so DST transitions don't drift the grid; the fraction is wall-clock, so
 * an afternoon event still lands mid-column at week scale.
 */
export function dayOffset(date: Date, from: Date): number {
  const whole = differenceInCalendarDays(date, from)
  const frac = (date.getHours() * 60 + date.getMinutes()) / 1440
  return whole + frac
}

function startOfUnit(date: Date, unit: TickUnit): Date {
  switch (unit) {
    case 'day':
      return startOfDay(date)
    case 'week':
      return startOfWeek(date, WEEK_OPTS)
    case 'month':
      return startOfMonth(date)
    case 'quarter':
      return startOfQuarter(date)
  }
}

function addUnit(date: Date, unit: TickUnit, amount: number): Date {
  switch (unit) {
    case 'day':
      return addDays(date, amount)
    case 'week':
      return addWeeks(date, amount)
    case 'month':
      return addMonths(date, amount)
    case 'quarter':
      return addQuarters(date, amount)
  }
}

/** Window bounds for the scale, anchored on the unit containing `anchor`. End is exclusive. */
export function windowBoundsFor(anchor: Date, scale: GanttScale): { start: Date; end: Date } {
  const spec = SCALE_SPECS[scale]
  const start = startOfUnit(anchor, spec.windowUnit)
  return { start, end: addUnit(start, spec.windowUnit, spec.windowCount) }
}

/**
 * Ticks covering [winStart, winEnd). First and last cells may be partial, but
 * their label always names the real unit they belong to.
 */
function buildTicks(
  unit: TickUnit,
  winStart: Date,
  winEnd: Date,
  pxPerDay: number,
  fmt: string
): GanttTick[] {
  const ticks: GanttTick[] = []
  let cursor = startOfUnit(winStart, unit)

  while (cursor < winEnd) {
    const next = addUnit(cursor, unit, 1)
    const cellStart = cursor < winStart ? winStart : cursor
    const cellEnd = next > winEnd ? winEnd : next
    const left = dayOffset(cellStart, winStart) * pxPerDay
    const width = dayOffset(cellEnd, cellStart) * pxPerDay
    if (width > 0) {
      ticks.push({
        key: cursor.toISOString(),
        start: cursor,
        end: next,
        left,
        width,
        label: format(cursor, fmt),
      })
    }
    cursor = next
  }

  return ticks
}

export function isOffDay(date: Date, offDays: readonly number[] = DEFAULT_OFF_DAYS): boolean {
  return offDays.includes(date.getDay())
}

/** Consecutive off-days merge into one band, so a weekend is a single element. */
function buildOffDayBands(
  winStart: Date,
  winEnd: Date,
  pxPerDay: number,
  offDays: readonly number[]
): GanttOffDayBand[] {
  const bands: GanttOffDayBand[] = []
  let runStart: Date | null = null
  let cursor = startOfDay(winStart)

  const flush = (runEnd: Date) => {
    if (!runStart) return
    const left = dayOffset(runStart, winStart) * pxPerDay
    bands.push({
      key: runStart.toISOString(),
      left,
      width: dayOffset(runEnd, runStart) * pxPerDay,
    })
    runStart = null
  }

  while (cursor < winEnd) {
    const next = addDays(cursor, 1)
    if (isOffDay(cursor, offDays)) {
      if (!runStart) runStart = cursor
    } else {
      flush(cursor)
    }
    cursor = next
  }
  flush(cursor)

  return bands
}

export function buildWindow(
  anchor: Date,
  scale: GanttScale,
  offDays: readonly number[] = DEFAULT_OFF_DAYS
): GanttWindow {
  const spec = SCALE_SPECS[scale]
  const { start, end } = windowBoundsFor(anchor, scale)
  const pxPerDay = spec.pxPerDay

  return {
    start,
    end,
    pxPerDay,
    totalWidth: dayOffset(end, start) * pxPerDay,
    minor: buildTicks(spec.minorUnit, start, end, pxPerDay, spec.minorFormat),
    major: buildTicks(spec.majorUnit, start, end, pxPerDay, spec.majorFormat),
    offDayBands: spec.shadeOffDays ? buildOffDayBands(start, end, pxPerDay, offDays) : [],
  }
}

/**
 * Step by one window *unit*, not one full window — at month scale that is one
 * month inside a three-month view, so two thirds of the context is preserved.
 */
export function shiftAnchor(anchor: Date, scale: GanttScale, dir: GanttDirection): Date {
  const spec = SCALE_SPECS[scale]
  const start = startOfUnit(anchor, spec.windowUnit)
  return addUnit(start, spec.windowUnit, dir === 'next' ? 1 : -1)
}

export function pxForDate(date: Date, win: GanttWindow): number {
  return dayOffset(date, win.start) * win.pxPerDay
}

/** Null when the interval falls entirely outside the window. */
export function barRect(start: Date, end: Date, win: GanttWindow): BarRect | null {
  if (end < win.start || start >= win.end) return null

  const rawLeft = dayOffset(start, win.start) * win.pxPerDay
  const rawRight = dayOffset(end, win.start) * win.pxPerDay
  const left = Math.max(0, rawLeft)
  const right = Math.min(win.totalWidth, rawRight)

  return {
    left,
    width: Math.max(MIN_BAR_PX, right - left),
    clippedStart: rawLeft < 0,
    clippedEnd: rawRight > win.totalWidth,
  }
}

/**
 * Where to open. Today if anything is in flight around now, otherwise the most
 * recent activity — a dormant member should never land on an empty grid.
 */
export function initialAnchorFor(events: GanttEvent[], scale: GanttScale, today: Date): Date {
  if (events.length === 0) return today

  const { start, end } = windowBoundsFor(today, scale)
  const overlaps = events.some((e) => e.end >= start && e.start < end)
  if (overlaps) return today

  let maxEnd = events[0].end
  let minStart = events[0].start
  for (const e of events) {
    if (e.end > maxEnd) maxEnd = e.end
    if (e.start < minStart) minStart = e.start
  }

  return maxEnd < start ? maxEnd : minStart
}

export function formatWindowLabel(win: GanttWindow, scale: GanttScale): string {
  const last = subDays(win.end, 1)
  switch (scale) {
    case 'week':
      return `${format(win.start, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`
    case 'month':
      return `${format(win.start, 'MMM')} – ${format(last, 'MMM yyyy')}`
    case 'quarter':
      return `${format(win.start, 'QQQ yyyy')} – ${format(last, 'QQQ yyyy')}`
  }
}
