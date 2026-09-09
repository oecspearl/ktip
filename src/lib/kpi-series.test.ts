import { describe, expect, it } from 'vitest'
import { bucketLabel, pivotSeries, totalsOf, type SeriesPoint } from './kpi-series'

describe('pivotSeries', () => {
  const points: SeriesPoint[] = [
    { bucket: '2026-07-01', segment: 'Students', value: 4 },
    { bucket: '2026-07-01', segment: 'Mentors', value: 1 },
    { bucket: '2026-08-01', segment: 'Students', value: 6 },
    // Mentors absent for August: the RPC zero-fills, so this is a hole to
    // close, not a line to break.
    { bucket: '2026-06-01', segment: 'Students', value: 3 },
    { bucket: '2026-06-01', segment: 'Mentors', value: 2 },
  ]

  it('turns long rows into one row per bucket, sorted, with a column per segment', () => {
    const pivot = pivotSeries(points, 'month')
    expect(pivot.segments).toEqual(['Students', 'Mentors'])
    expect(pivot.rows.map((r) => r.bucket)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
    expect(pivot.rows[1]).toMatchObject({ label: 'Jul 26', Students: 4, Mentors: 1 })
    expect(pivot.rows[2]).toMatchObject({ label: 'Aug 26', Students: 6, Mentors: 0 })
  })

  it('sums segments for the total line', () => {
    expect(totalsOf(pivotSeries(points, 'month'))).toEqual([5, 5, 6])
  })

  it('returns nothing for nothing', () => {
    expect(pivotSeries([], 'month')).toEqual({ rows: [], segments: [] })
  })
})

describe('bucketLabel', () => {
  it('names months and days differently', () => {
    expect(bucketLabel('2026-08-01', 'month')).toBe('Aug 26')
    expect(bucketLabel('2026-08-03', 'day')).toBe('3 Aug')
    expect(bucketLabel('2026-08-03', 'week')).toBe('3 Aug')
  })

  it('passes an unparseable bucket through', () => {
    expect(bucketLabel('n/a', 'month')).toBe('n/a')
  })
})
