import { describe, it, expect } from 'vitest'
import {
  barRect,
  buildWindow,
  dayOffset,
  formatWindowLabel,
  initialAnchorFor,
  isOffDay,
  pxForDate,
  shiftAnchor,
  windowBoundsFor,
} from './gantt-scale'
import { MIN_BAR_PX, type GanttEvent } from './gantt-types'

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h)

const event = (id: string, start: Date, end: Date): GanttEvent => ({
  id,
  title: id,
  resourceId: 'r',
  start,
  end,
})

describe('dayOffset', () => {
  it('is a whole number across a month, whatever the DST transitions in it', () => {
    // Midnight to midnight must never drift — this is why the whole part comes
    // from a calendar diff rather than a millisecond subtraction.
    expect(dayOffset(d(2026, 3, 31), d(2026, 3, 1))).toBe(30)
    expect(dayOffset(d(2026, 11, 1), d(2026, 10, 1))).toBe(31)
  })

  it('adds the wall-clock fraction of the day', () => {
    expect(dayOffset(d(2026, 2, 12, 12), d(2026, 2, 11))).toBe(1.5)
  })

  it('goes negative before the origin', () => {
    expect(dayOffset(d(2026, 2, 9, 18), d(2026, 2, 10))).toBe(-0.25)
  })
})

describe('windowBoundsFor', () => {
  it('snaps a week window to Monday and spans 4 weeks', () => {
    const { start, end } = windowBoundsFor(d(2026, 2, 11), 'week')
    expect(start).toEqual(d(2026, 2, 9))
    expect(end).toEqual(d(2026, 3, 9))
  })

  it('spans 3 months from the start of the anchor month', () => {
    const { start, end } = windowBoundsFor(d(2026, 2, 11), 'month')
    expect(start).toEqual(d(2026, 2, 1))
    expect(end).toEqual(d(2026, 5, 1))
  })

  it('snaps a quarter window to the quarter boundary', () => {
    const { start, end } = windowBoundsFor(d(2026, 2, 11), 'quarter')
    expect(start).toEqual(d(2026, 1, 1))
    expect(end).toEqual(d(2027, 1, 1))
  })
})

describe('buildWindow', () => {
  it('widths total the sum of the minor ticks', () => {
    for (const scale of ['week', 'month', 'quarter'] as const) {
      const win = buildWindow(d(2026, 2, 11), scale)
      const summed = win.minor.reduce((sum, tick) => sum + tick.width, 0)
      expect(summed).toBeCloseTo(win.totalWidth, 6)
    }
  })

  it('sizes months by their real length, including a leap February', () => {
    expect(buildWindow(d(2026, 2, 11), 'month').totalWidth).toBe(89 * 8)
    expect(buildWindow(d(2024, 2, 11), 'month').totalWidth).toBe(90 * 8)
  })

  it('shades merged weekend bands at week scale only', () => {
    const week = buildWindow(d(2026, 2, 11), 'week')
    // 4 Monday-first weeks — one Sat+Sun band each, merged into a single band.
    expect(week.offDayBands).toHaveLength(4)
    expect(week.offDayBands[0].width).toBe(2 * 48)
    expect(buildWindow(d(2026, 2, 11), 'month').offDayBands).toEqual([])
    expect(buildWindow(d(2026, 2, 11), 'quarter').offDayBands).toEqual([])
  })

  it('labels a clipped first tick with the unit it belongs to', () => {
    const win = buildWindow(d(2026, 2, 11), 'month')
    // Minor ticks are weeks; the first one starts before Feb 1 and is clipped.
    expect(win.minor[0].left).toBe(0)
    expect(win.minor[0].start.getTime()).toBeLessThan(win.start.getTime())
  })
})

describe('barRect', () => {
  const win = buildWindow(d(2026, 2, 11), 'month') // Feb 1 – May 1, 8px/day

  it('places a bar fully inside the window', () => {
    expect(barRect(d(2026, 2, 11), d(2026, 2, 21), win)).toEqual({
      left: 80,
      width: 80,
      clippedStart: false,
      clippedEnd: false,
    })
  })

  it('clamps and flags a bar that starts before the window', () => {
    const rect = barRect(d(2026, 1, 20), d(2026, 2, 11), win)
    expect(rect).toMatchObject({ left: 0, width: 80, clippedStart: true, clippedEnd: false })
  })

  it('clamps and flags a bar that runs past the window', () => {
    const rect = barRect(d(2026, 4, 20), d(2026, 6, 1), win)
    expect(rect).toMatchObject({ left: 78 * 8, clippedStart: false, clippedEnd: true })
    expect(rect!.left + rect!.width).toBe(win.totalWidth)
  })

  it('returns null outside the window in either direction', () => {
    expect(barRect(d(2025, 11, 1), d(2025, 12, 1), win)).toBeNull()
    expect(barRect(d(2026, 6, 1), d(2026, 7, 1), win)).toBeNull()
  })

  it('gives a zero-length bar a visible minimum', () => {
    expect(barRect(d(2026, 2, 11), d(2026, 2, 11), win)!.width).toBe(MIN_BAR_PX)
  })
})

describe('pxForDate / isOffDay', () => {
  it('measures from the window start', () => {
    const win = buildWindow(d(2026, 2, 11), 'month')
    expect(pxForDate(d(2026, 2, 11), win)).toBe(80)
  })

  it('treats Saturday and Sunday as off days by default', () => {
    expect(isOffDay(d(2026, 2, 14))).toBe(true) // Saturday
    expect(isOffDay(d(2026, 2, 15))).toBe(true) // Sunday
    expect(isOffDay(d(2026, 2, 16))).toBe(false)
  })
})

describe('shiftAnchor', () => {
  it('steps by one unit, not one whole window', () => {
    expect(shiftAnchor(d(2026, 2, 11), 'month', 'next')).toEqual(d(2026, 3, 1))
    expect(shiftAnchor(d(2026, 2, 11), 'month', 'prev')).toEqual(d(2026, 1, 1))
  })

  it('round-trips prev then next', () => {
    for (const scale of ['week', 'month', 'quarter'] as const) {
      const back = shiftAnchor(d(2026, 2, 11), scale, 'prev')
      expect(shiftAnchor(back, scale, 'next')).toEqual(windowBoundsFor(d(2026, 2, 11), scale).start)
    }
  })
})

describe('initialAnchorFor', () => {
  const today = d(2026, 2, 11)

  it('falls back to today with no events', () => {
    expect(initialAnchorFor([], 'month', today)).toBe(today)
  })

  it('stays on today when anything overlaps the current window', () => {
    const events = [event('a', d(2026, 1, 5), d(2026, 2, 20))]
    expect(initialAnchorFor(events, 'month', today)).toBe(today)
  })

  it('jumps back to the most recent activity when everything is in the past', () => {
    const events = [
      event('a', d(2024, 3, 1), d(2024, 6, 1)),
      event('b', d(2025, 1, 1), d(2025, 4, 1)),
    ]
    expect(initialAnchorFor(events, 'month', today)).toEqual(d(2025, 4, 1))
  })

  it('jumps forward to the earliest start when everything is in the future', () => {
    const events = [event('a', d(2027, 3, 1), d(2027, 6, 1))]
    expect(initialAnchorFor(events, 'month', today)).toEqual(d(2027, 3, 1))
  })
})

describe('formatWindowLabel', () => {
  it('reads as a range at every scale', () => {
    expect(formatWindowLabel(buildWindow(d(2026, 2, 11), 'week'), 'week')).toBe(
      'Feb 9 – Mar 8, 2026'
    )
    expect(formatWindowLabel(buildWindow(d(2026, 2, 11), 'month'), 'month')).toBe('Feb – Apr 2026')
    expect(formatWindowLabel(buildWindow(d(2026, 2, 11), 'quarter'), 'quarter')).toBe(
      'Q1 2026 – Q4 2026'
    )
  })
})
