import type { SeriesGrain } from '../../../lib/kpi-series'

/**
 * The analytics hub's filter state, kept in the URL.
 *
 * Search params rather than React state so a filtered view is a link an admin
 * can paste into a report or a message, and so the browser's back button steps
 * through periods the way people expect. Everything here is a pure function of
 * strings, tested without the router.
 */

export const HUB_TABS = [
  'overview',
  'results',
  'community',
  'activity',
  'engagement',
  'health',
  'reports',
] as const
export type HubTab = (typeof HUB_TABS)[number]

export const HUB_TAB_LABELS: Record<HubTab, string> = {
  overview: 'Overview',
  results: 'Results framework',
  community: 'Community',
  activity: 'Activity',
  engagement: 'Engagement',
  health: 'Health & trust',
  reports: 'Reports',
}

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom'

export interface HubFilters {
  tab: HubTab
  period: PeriodKind
  /** Whole periods back from the current one; 0 is now. Ignored for custom. */
  offset: number
  /** ISO dates for a custom range, start inclusive and end exclusive. */
  from: string | null
  to: string | null
  /** A profiles.country name, or null for the whole platform. */
  country: string | null
}

export const DEFAULT_FILTERS: HubFilters = {
  tab: 'overview',
  period: 'month',
  offset: 0,
  from: null,
  to: null,
  country: null,
}

export interface Period {
  start: string
  end: string
  label: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The calendar month, quarter or year `offset` periods back from `now`, or a
 * custom range. Dates are UTC throughout, matching date_trunc() in Postgres.
 */
export function periodFor(filters: Pick<HubFilters, 'period' | 'offset' | 'from' | 'to'>, now = new Date()): Period {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const back = Math.max(0, Math.floor(filters.offset || 0))

  if (filters.period === 'custom') {
    const from = filters.from && ISO_DATE.test(filters.from) ? filters.from : iso(new Date(Date.UTC(year, month, 1)))
    let to = filters.to && ISO_DATE.test(filters.to) ? filters.to : iso(new Date(Date.UTC(year, month, now.getUTCDate() + 1)))
    if (to <= from) to = iso(new Date(new Date(`${from}T00:00:00Z`).getTime() + 86_400_000))
    return { start: from, end: to, label: `${from} to ${to}` }
  }

  if (filters.period === 'year') {
    const y = year - back
    return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: String(y) }
  }

  if (filters.period === 'quarter') {
    const q = Math.floor(month / 3) - back
    const start = new Date(Date.UTC(year, q * 3, 1))
    const end = new Date(Date.UTC(year, q * 3 + 3, 1))
    return {
      start: iso(start),
      end: iso(end),
      label: `Q${((start.getUTCMonth() / 3) | 0) + 1} ${start.getUTCFullYear()}`,
    }
  }

  const start = new Date(Date.UTC(year, month - back, 1))
  const end = new Date(Date.UTC(year, month - back + 1, 1))
  return {
    start: iso(start),
    end: iso(end),
    label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}

export interface TrendWindow {
  start: string
  end: string
  grain: SeriesGrain
}

/**
 * The window the trend charts draw, given the period the tiles report on.
 *
 * A tile answers "how did this month go"; a trend answers "how has it been
 * going", so it always looks further back than the tile: twelve months at
 * month grain for a monthly view, eight quarters for a quarterly one, the
 * whole year for an annual one. A custom range is drawn as itself, at the
 * finest grain that keeps the point count readable.
 */
export function trendWindow(filters: HubFilters, period: Period): TrendWindow {
  if (filters.period === 'custom') {
    const days = (Date.parse(period.end) - Date.parse(period.start)) / 86_400_000
    return { start: period.start, end: period.end, grain: days <= 62 ? 'day' : days <= 372 ? 'week' : 'month' }
  }
  const end = new Date(`${period.end}T00:00:00Z`)
  const monthsBack = filters.period === 'year' ? 12 : filters.period === 'quarter' ? 24 : 12
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthsBack, 1))
  return { start: iso(start), end: period.end, grain: 'month' }
}

/** Filters from the URL; anything unrecognised falls back to the default. */
export function parseHubParams(params: URLSearchParams): HubFilters {
  const tab = params.get('tab')
  const period = params.get('period')
  const offset = Number(params.get('offset'))
  const from = params.get('from')
  const to = params.get('to')
  const country = params.get('country')
  return {
    tab: (HUB_TABS as readonly string[]).includes(tab ?? '') ? (tab as HubTab) : DEFAULT_FILTERS.tab,
    period: period === 'quarter' || period === 'year' || period === 'custom' ? period : 'month',
    offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
    from: from && ISO_DATE.test(from) ? from : null,
    to: to && ISO_DATE.test(to) ? to : null,
    country: country ? country : null,
  }
}

/** The URL for a set of filters, omitting defaults so the plain path stays plain. */
export function hubParams(filters: HubFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.tab !== DEFAULT_FILTERS.tab) params.set('tab', filters.tab)
  if (filters.period !== DEFAULT_FILTERS.period) params.set('period', filters.period)
  if (filters.period !== 'custom' && filters.offset > 0) params.set('offset', String(filters.offset))
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  if (filters.country) params.set('country', filters.country)
  return params
}
