import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  hubParams,
  parseHubParams,
  periodFor,
  trendWindow,
  type HubFilters,
} from './analytics-filters'

const now = new Date('2026-09-09T12:00:00Z')

describe('periodFor', () => {
  it('names the current month, and steps back whole months', () => {
    expect(periodFor({ period: 'month', offset: 0, from: null, to: null }, now)).toEqual({
      start: '2026-09-01',
      end: '2026-10-01',
      label: 'September 2026',
    })
    expect(periodFor({ period: 'month', offset: 10, from: null, to: null }, now)).toMatchObject({
      start: '2025-11-01',
      end: '2025-12-01',
    })
  })

  it('handles quarters across a year boundary', () => {
    expect(periodFor({ period: 'quarter', offset: 0, from: null, to: null }, now)).toEqual({
      start: '2026-07-01',
      end: '2026-10-01',
      label: 'Q3 2026',
    })
    expect(periodFor({ period: 'quarter', offset: 3, from: null, to: null }, now)).toEqual({
      start: '2025-10-01',
      end: '2026-01-01',
      label: 'Q4 2025',
    })
  })

  it('takes a custom range as given, and refuses an empty one', () => {
    expect(periodFor({ period: 'custom', offset: 0, from: '2026-03-01', to: '2026-04-15' }, now)).toMatchObject({
      start: '2026-03-01',
      end: '2026-04-15',
    })
    // end before start: one day, never zero
    expect(periodFor({ period: 'custom', offset: 0, from: '2026-03-10', to: '2026-03-01' }, now)).toMatchObject({
      start: '2026-03-10',
      end: '2026-03-11',
    })
  })
})

describe('trendWindow', () => {
  it('looks twelve months back for a monthly view, at month grain', () => {
    const filters: HubFilters = { ...DEFAULT_FILTERS }
    const period = periodFor(filters, now)
    expect(trendWindow(filters, period)).toEqual({ start: '2025-10-01', end: '2026-10-01', grain: 'month' })
  })

  it('picks the grain from the length of a custom range', () => {
    const short: HubFilters = { ...DEFAULT_FILTERS, period: 'custom', from: '2026-08-01', to: '2026-08-31' }
    expect(trendWindow(short, periodFor(short, now)).grain).toBe('day')
    const medium: HubFilters = { ...DEFAULT_FILTERS, period: 'custom', from: '2026-01-01', to: '2026-09-01' }
    expect(trendWindow(medium, periodFor(medium, now)).grain).toBe('week')
    const long: HubFilters = { ...DEFAULT_FILTERS, period: 'custom', from: '2024-01-01', to: '2026-09-01' }
    expect(trendWindow(long, periodFor(long, now)).grain).toBe('month')
  })
})

describe('URL round trip', () => {
  it('omits defaults so the bare path stays bare', () => {
    expect(hubParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('survives a round trip', () => {
    const filters: HubFilters = {
      tab: 'community',
      period: 'quarter',
      offset: 2,
      from: null,
      to: null,
      country: 'Saint Lucia',
    }
    expect(parseHubParams(hubParams(filters))).toEqual(filters)
  })

  it('ignores junk', () => {
    const parsed = parseHubParams(new URLSearchParams('tab=nope&period=fortnight&offset=-3&from=yesterday'))
    expect(parsed).toEqual(DEFAULT_FILTERS)
  })

  it('drops the offset for a custom range and the dates for a calendar one', () => {
    const custom = hubParams({ ...DEFAULT_FILTERS, period: 'custom', offset: 4, from: '2026-01-01', to: '2026-02-01' })
    expect(custom.get('offset')).toBeNull()
    expect(custom.get('from')).toBe('2026-01-01')
    const calendar = hubParams({ ...DEFAULT_FILTERS, period: 'year', from: '2026-01-01', to: '2026-02-01' })
    expect(calendar.get('from')).toBeNull()
  })
})
