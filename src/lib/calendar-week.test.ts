import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WINDOW_END_MIN,
  DEFAULT_WINDOW_START_MIN,
  MIN_ITEM_MINUTES,
  buildWeekLayout,
  formatHourLabel,
  isAllDayItem,
  timeToPct,
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

describe('buildWeekLayout', () => {
  it('returns the default window and no items for an empty week', () => {
    const layout = buildWeekLayout(days, new Map())
    expect(layout.startMin).toBe(DEFAULT_WINDOW_START_MIN)
    expect(layout.endMin).toBe(DEFAULT_WINDOW_END_MIN)
    expect(layout.columns[0].timed).toHaveLength(0)
    expect(layout.columns[0].allDay).toHaveLength(0)
    expect(layout.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  })

  it('positions a single item against the window', () => {
    // 12:00–14:00 inside an 8:00–20:00 window: a third down, a sixth tall
    const layout = buildWeekLayout(
      days,
      byDay(item({ id: 'a', start: at(DAY, 12), end: at(DAY, 14) }))
    )
    const [entry] = layout.columns[0].timed
    expect(entry.topPct).toBeCloseTo(100 / 3)
    expect(entry.heightPct).toBeCloseTo(100 / 6)
    expect(entry.lane).toBe(0)
    expect(entry.lanes).toBe(1)
  })

  it('splits two overlapping items into two lanes', () => {
    const layout = buildWeekLayout(
      days,
      byDay(
        item({ id: 'a', start: at(DAY, 10), end: at(DAY, 12) }),
        item({ id: 'b', start: at(DAY, 11), end: at(DAY, 13) })
      )
    )
    const timed = layout.columns[0].timed
    expect(timed.map((t) => t.lanes)).toEqual([2, 2])
    expect(new Set(timed.map((t) => t.lane))).toEqual(new Set([0, 1]))
  })

  it('handles a three-deep overlap', () => {
    const layout = buildWeekLayout(
      days,
      byDay(
        item({ id: 'a', start: at(DAY, 10), end: at(DAY, 13) }),
        item({ id: 'b', start: at(DAY, 11), end: at(DAY, 13) }),
        item({ id: 'c', start: at(DAY, 12), end: at(DAY, 13) })
      )
    )
    const timed = layout.columns[0].timed
    expect(timed.every((t) => t.lanes === 3)).toBe(true)
    expect(new Set(timed.map((t) => t.lane))).toEqual(new Set([0, 1, 2]))
  })

  it('keeps non-overlapping items in a single lane', () => {
    const layout = buildWeekLayout(
      days,
      byDay(
        item({ id: 'a', start: at(DAY, 9), end: at(DAY, 10) }),
        item({ id: 'b', start: at(DAY, 14), end: at(DAY, 15) })
      )
    )
    expect(layout.columns[0].timed.every((t) => t.lane === 0 && t.lanes === 1)).toBe(true)
  })

  it('gives zero-duration items a minimum height', () => {
    const layout = buildWeekLayout(days, byDay(item({ id: 'deadline', start: at(DAY, 17) })))
    const [entry] = layout.columns[0].timed
    expect(entry.endMin - entry.startMin).toBe(MIN_ITEM_MINUTES)
    expect(entry.heightPct).toBeGreaterThan(0)
  })

  it('routes multi-day spans to the all-day rail', () => {
    const layout = buildWeekLayout(
      days,
      byDay(item({ id: 'hackathon', start: at(DAY, 9), end: at('2026-07-17', 17) }))
    )
    expect(layout.columns[0].allDay.map((i) => i.id)).toEqual(['hackathon'])
    expect(layout.columns[0].timed).toHaveLength(0)
  })

  it('widens the window to cover early and late items', () => {
    const layout = buildWeekLayout(
      days,
      byDay(
        item({ id: 'early', start: at(DAY, 6, 30), end: at(DAY, 7) }),
        item({ id: 'late', start: at(DAY, 21), end: at(DAY, 22, 30) })
      )
    )
    expect(layout.startMin).toBe(6 * 60)
    expect(layout.endMin).toBe(23 * 60)
  })

  it('never positions an item past the bottom of the grid', () => {
    const layout = buildWeekLayout(days, byDay(item({ id: 'late', start: at(DAY, 23, 45) })))
    const [entry] = layout.columns[0].timed
    expect(entry.topPct + entry.heightPct).toBeLessThanOrEqual(100)
  })
})

describe('isAllDayItem', () => {
  it('is false without an end and for same-day spans', () => {
    expect(isAllDayItem(item({ id: 'a', start: at(DAY, 9) }))).toBe(false)
    expect(isAllDayItem(item({ id: 'b', start: at(DAY, 9), end: at(DAY, 17) }))).toBe(false)
  })
})

describe('timeToPct', () => {
  const layout = buildWeekLayout(days, new Map())

  it('maps a time inside the window and rejects one outside', () => {
    expect(timeToPct(new Date(`${DAY}T14:00:00`), layout)).toBeCloseTo(50)
    expect(timeToPct(new Date(`${DAY}T03:00:00`), layout)).toBeNull()
  })
})

describe('formatHourLabel', () => {
  it('formats 12-hour labels', () => {
    expect(formatHourLabel(0)).toBe('12 AM')
    expect(formatHourLabel(9)).toBe('9 AM')
    expect(formatHourLabel(12)).toBe('12 PM')
    expect(formatHourLabel(13)).toBe('1 PM')
    expect(formatHourLabel(24)).toBe('12 AM')
  })
})
