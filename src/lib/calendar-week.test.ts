import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WINDOW_END_MIN,
  DEFAULT_WINDOW_START_MIN,
  HOUR_PX,
  MIN_ITEM_MINUTES,
  MIN_ROW_PX,
  buildDensitySpine,
  buildWeekLayout,
  columnRows,
  formatDuration,
  formatHourLabel,
  formatMinuteRange,
  formatMinutes,
  isAllDayItem,
  isPastItem,
  rowHeights,
  timeToPx,
} from './calendar-week'
import type { CalendarItem } from './calendar'

/** Local wall-clock ISO — the layout works in local time, like the grid does. */
const at = (day: string, hour: number, minute = 0) =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).toISOString()

const item = (over: Partial<CalendarItem> & { id: string; start: string }): CalendarItem => ({
  kind: 'event',
  title: over.id,
  chipClass: '',
  dotClass: '',
  ...over,
})

const DAY = '2026-07-15'
const days = [new Date(`${DAY}T00:00:00`)]
const byDay = (...items: CalendarItem[]) => new Map([[DAY, items]])

/** Fixed clock so the past-flag arithmetic does not depend on the wall clock. */
const NOW = new Date(`${DAY}T12:00:00`)
const layoutOf = (...items: CalendarItem[]) => buildWeekLayout(days, byDay(...items), { now: NOW })

describe('buildWeekLayout', () => {
  it('returns the default window and no items for an empty week', () => {
    const layout = buildWeekLayout(days, new Map(), { now: NOW })
    expect(layout.startMin).toBe(DEFAULT_WINDOW_START_MIN)
    expect(layout.endMin).toBe(DEFAULT_WINDOW_END_MIN)
    expect(layout.columns[0].clusters).toHaveLength(0)
    expect(layout.columns[0].allDay).toHaveLength(0)
    expect(layout.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(layout.bodyPx).toBe(12 * HOUR_PX)
  })

  it('positions a single item against the window', () => {
    // 12:00–14:00 inside an 8:00–20:00 window: four hours down, two tall
    const layout = layoutOf(item({ id: 'a', start: at(DAY, 12), end: at(DAY, 14) }))
    const [cluster] = layout.columns[0].clusters
    expect(cluster.topPx).toBeCloseTo(4 * HOUR_PX)
    expect(cluster.heightPx).toBeCloseTo(2 * HOUR_PX - 3)
    expect(cluster.rows).toHaveLength(1)
    expect(cluster.rows[0].heightPx).toBeCloseTo(cluster.heightPx)
  })

  it('collapses two overlapping items into one cluster of two rows', () => {
    const layout = layoutOf(
      item({ id: 'a', start: at(DAY, 10), end: at(DAY, 12) }),
      item({ id: 'b', start: at(DAY, 11), end: at(DAY, 13) })
    )
    const clusters = layout.columns[0].clusters
    expect(clusters).toHaveLength(1)
    expect(clusters[0].rows.map((row) => row.item.id)).toEqual(['a', 'b'])
    expect(clusters[0].startMin).toBe(10 * 60)
    expect(clusters[0].endMin).toBe(13 * 60)
  })

  it('handles a three-deep overlap as one box', () => {
    const layout = layoutOf(
      item({ id: 'a', start: at(DAY, 10), end: at(DAY, 13) }),
      item({ id: 'b', start: at(DAY, 11), end: at(DAY, 13) }),
      item({ id: 'c', start: at(DAY, 12), end: at(DAY, 13) })
    )
    const clusters = layout.columns[0].clusters
    expect(clusters).toHaveLength(1)
    expect(clusters[0].rows).toHaveLength(3)
    // Rows tile the box exactly — no gaps, no overflow
    const total = clusters[0].rows.reduce((sum, row) => sum + row.heightPx, 0)
    expect(total).toBeCloseTo(clusters[0].heightPx)
  })

  it('puts the shorter of two items starting together on top', () => {
    const layout = layoutOf(
      item({ id: 'long', start: at(DAY, 15), end: at(DAY, 17) }),
      item({ id: 'short', start: at(DAY, 15), end: at(DAY, 16) })
    )
    expect(layout.columns[0].clusters[0].rows.map((row) => row.item.id)).toEqual(['short', 'long'])
  })

  it('keeps non-overlapping items in separate clusters', () => {
    const layout = layoutOf(
      item({ id: 'a', start: at(DAY, 9), end: at(DAY, 10) }),
      item({ id: 'b', start: at(DAY, 14), end: at(DAY, 15) })
    )
    expect(layout.columns[0].clusters).toHaveLength(2)
    expect(layout.columns[0].clusters.every((cluster) => cluster.rows.length === 1)).toBe(true)
  })

  it('treats a back-to-back handover as two clusters, not an overlap', () => {
    const layout = layoutOf(
      item({ id: 'a', start: at(DAY, 9), end: at(DAY, 10) }),
      item({ id: 'b', start: at(DAY, 10), end: at(DAY, 11) })
    )
    expect(layout.columns[0].clusters).toHaveLength(2)
  })

  it('lifts a squeezed row to the readable minimum', () => {
    // 15 minutes against 3 hours would otherwise render about 4px tall
    const layout = layoutOf(
      item({ id: 'long', start: at(DAY, 9), end: at(DAY, 12) }),
      item({ id: 'blip', start: at(DAY, 9, 30), end: at(DAY, 9, 45) })
    )
    const [cluster] = layout.columns[0].clusters
    expect(cluster.rows.every((row) => row.heightPx >= MIN_ROW_PX)).toBe(true)
  })

  it('gives zero-duration items a minimum duration', () => {
    const layout = layoutOf(item({ id: 'deadline', start: at(DAY, 17) }))
    const [row] = layout.columns[0].clusters[0].rows
    expect(row.endMin - row.startMin).toBe(MIN_ITEM_MINUTES)
    expect(row.heightPx).toBeGreaterThan(0)
  })

  it('flags rows that have already finished', () => {
    const layout = layoutOf(
      item({ id: 'done', start: at(DAY, 9), end: at(DAY, 10) }),
      item({ id: 'later', start: at(DAY, 15), end: at(DAY, 16) })
    )
    const rows = columnRows(layout.columns[0])
    expect(rows.map((row) => [row.item.id, row.past])).toEqual([
      ['done', true],
      ['later', false],
    ])
  })

  it('routes multi-day spans to the all-day rail', () => {
    const layout = layoutOf(item({ id: 'hackathon', start: at(DAY, 9), end: at('2026-07-17', 17) }))
    expect(layout.columns[0].allDay.map((i) => i.id)).toEqual(['hackathon'])
    expect(layout.columns[0].clusters).toHaveLength(0)
  })

  it('widens the window to cover early and late items', () => {
    const layout = layoutOf(
      item({ id: 'early', start: at(DAY, 6, 30), end: at(DAY, 7) }),
      item({ id: 'late', start: at(DAY, 21), end: at(DAY, 22, 30) })
    )
    expect(layout.startMin).toBe(6 * 60)
    expect(layout.endMin).toBe(23 * 60)
  })

  it('never positions a cluster past the bottom of the grid', () => {
    const layout = layoutOf(item({ id: 'late', start: at(DAY, 23, 45) }))
    const [cluster] = layout.columns[0].clusters
    expect(cluster.topPx + cluster.heightPx).toBeLessThanOrEqual(layout.bodyPx)
  })

  it('lays out any number of days, so the day view is one column', () => {
    const layout = buildWeekLayout(days, byDay(item({ id: 'a', start: at(DAY, 9) })), { now: NOW })
    expect(layout.columns).toHaveLength(1)
  })
})

describe('rowHeights', () => {
  it('splits proportionally when nothing needs lifting', () => {
    expect(rowHeights([60, 60], 100)).toEqual([50, 50])
    expect(rowHeights([90, 30], 120)).toEqual([90, 30])
  })

  it('lifts short rows and takes the space from the tall ones', () => {
    const heights = rowHeights([180, 15], 200, 24)
    expect(heights[1]).toBe(24)
    expect(heights[0] + heights[1]).toBeCloseTo(200)
  })

  it('cannot lift past the space available', () => {
    // Three rows, 60px box, 24px minimum: 72px is wanted and 60 exists
    const heights = rowHeights([60, 60, 60], 60, 24)
    expect(heights.reduce((a, b) => a + b, 0)).toBeCloseTo(60)
  })
})

describe('buildDensitySpine', () => {
  it('maps an item onto the 6am–11pm window', () => {
    // 6am start is the left edge; a one-hour band is 1/17th of the window
    const [segment] = buildDensitySpine([
      item({ id: 'a', start: at(DAY, 6), end: at(DAY, 7), dotClass: 'bg-ktip-ocean-500' }),
    ])
    expect(segment.leftPct).toBeCloseTo(0)
    expect(segment.widthPct).toBeCloseTo(100 / 17)
    expect(segment.accentClass).toBe('bg-ktip-ocean-500')
  })

  it('clamps to the window and drops anything outside it', () => {
    const segments = buildDensitySpine([
      item({ id: 'night', start: at(DAY, 2), end: at(DAY, 3) }),
      item({ id: 'dawn', start: at(DAY, 5), end: at(DAY, 7) }),
    ])
    expect(segments).toHaveLength(1)
    expect(segments[0].leftPct).toBeCloseTo(0)
    expect(segments[0].widthPct).toBeCloseTo(100 / 17)
  })

  it('ignores multi-day spans, which live on the all-day rail', () => {
    expect(
      buildDensitySpine([item({ id: 'a', start: at(DAY, 9), end: at('2026-07-17', 9) })])
    ).toEqual([])
  })
})

describe('isAllDayItem', () => {
  it('is false without an end and for same-day spans', () => {
    expect(isAllDayItem(item({ id: 'a', start: at(DAY, 9) }))).toBe(false)
    expect(isAllDayItem(item({ id: 'b', start: at(DAY, 9), end: at(DAY, 17) }))).toBe(false)
  })
})

describe('isPastItem', () => {
  it('reads the end, falling back to the start', () => {
    expect(isPastItem(item({ id: 'a', start: at(DAY, 9), end: at(DAY, 10) }), NOW)).toBe(true)
    expect(isPastItem(item({ id: 'b', start: at(DAY, 11), end: at(DAY, 13) }), NOW)).toBe(false)
    expect(isPastItem(item({ id: 'c', start: at(DAY, 9) }), NOW)).toBe(true)
  })
})

describe('timeToPx', () => {
  const layout = buildWeekLayout(days, new Map(), { now: NOW })

  it('maps a time inside the window and rejects one outside', () => {
    expect(timeToPx(new Date(`${DAY}T14:00:00`), layout)).toBeCloseTo(6 * HOUR_PX)
    expect(timeToPx(new Date(`${DAY}T03:00:00`), layout)).toBeNull()
  })
})

describe('time formatting', () => {
  it('formats hour labels in both clocks', () => {
    expect(formatHourLabel(0)).toBe('12 AM')
    expect(formatHourLabel(9)).toBe('9 AM')
    expect(formatHourLabel(12)).toBe('12 PM')
    expect(formatHourLabel(13)).toBe('1 PM')
    expect(formatHourLabel(24)).toBe('12 AM')
    expect(formatHourLabel(0, true)).toBe('00:00')
    expect(formatHourLabel(9, true)).toBe('09:00')
    expect(formatHourLabel(13, true)).toBe('13:00')
  })

  it('drops a zero minute in 12h and keeps it in 24h', () => {
    expect(formatMinutes(9 * 60)).toBe('9 AM')
    expect(formatMinutes(9 * 60 + 30)).toBe('9:30 AM')
    expect(formatMinutes(9 * 60, true)).toBe('09:00')
    expect(formatMinutes(0)).toBe('12 AM')
  })

  it('says the meridiem once when a range stays inside one half', () => {
    expect(formatMinuteRange(9 * 60, 10 * 60 + 30)).toBe('9 – 10:30 AM')
    expect(formatMinuteRange(11 * 60, 13 * 60)).toBe('11 AM – 1 PM')
    expect(formatMinuteRange(9 * 60, 10 * 60, true)).toBe('09:00 – 10:00')
  })

  it('formats durations', () => {
    expect(formatDuration(9 * 60, 10 * 60 + 30)).toBe('1h 30m')
    expect(formatDuration(9 * 60, 9 * 60 + 45)).toBe('45m')
    expect(formatDuration(9 * 60, 11 * 60)).toBe('2h')
    expect(formatDuration(9 * 60, 9 * 60)).toBe('0m')
  })
})
