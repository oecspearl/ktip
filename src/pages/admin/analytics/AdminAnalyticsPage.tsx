import { Suspense, lazy, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHero } from '../../../components/layout/PageHero'
import { useCountries } from '../../../hooks/useEmployers'
import {
  HUB_TABS,
  HUB_TAB_LABELS,
  hubParams,
  parseHubParams,
  periodFor,
  trendWindow,
  type HubFilters,
  type HubTab,
  type PeriodKind,
} from './analytics-filters'
import type { HubProps } from './hub-context'

/**
 * The analytics hub: one page, seven tabs, one filter row.
 *
 * Before this the console's numbers lived in three places that shared nothing —
 * the Platform Overview's distribution charts (no date range), the Usage
 * Analytics page (consent-gated event reads, its own 7/30/90-day switch), and
 * the Impact + Reports pages (the roadmap's results framework, a third period
 * picker). Nothing could be filtered by country. The same month was three
 * different windows depending on which page you were on.
 *
 * Now: the period and country are chosen once, in the URL (see
 * analytics-filters.ts), and every tab reads them. Tabs are a search param
 * rather than child routes on purpose — `path: '/admin/analytics'` is what the
 * site-map and tutorial tests enumerate, and the old /admin/impact and
 * /admin/pulse addresses redirect into `?tab=`.
 *
 * Each tab is its own chunk. An admin who only ever opens Reports should not
 * download the engagement tables to get there.
 *
 * English, not lingui — src/pages/admin/ is excluded in scripts/i18n/config.mjs.
 */

const TABS: Record<HubTab, React.LazyExoticComponent<React.ComponentType<HubProps>>> = {
  overview: lazy(() => import('./tabs/OverviewTab')),
  results: lazy(() => import('./tabs/ResultsTab')),
  community: lazy(() => import('./tabs/CommunityTab')),
  activity: lazy(() => import('./tabs/ActivityTab')),
  engagement: lazy(() => import('./tabs/EngagementTab')),
  health: lazy(() => import('./tabs/HealthTrustTab')),
  reports: lazy(() => import('./tabs/ReportsTab')),
}

const PERIOD_KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
]

export default function AdminAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseHubParams(searchParams), [searchParams])
  const period = useMemo(() => periodFor(filters), [filters])
  const trend = useMemo(() => trendWindow(filters, period), [filters, period])
  const { countries } = useCountries()

  const update = useCallback(
    (patch: Partial<HubFilters>) => {
      // Changing the period kind resets the offset: "two quarters ago" is not a
      // sensible place to land from "two months ago".
      const next: HubFilters = { ...filters, ...patch }
      if (patch.period && patch.period !== filters.period) next.offset = 0
      setSearchParams(hubParams(next), { replace: false })
    },
    [filters, setSearchParams],
  )

  const Tab = TABS[filters.tab]
  const oecs = (countries ?? []).filter((c) => c.is_oecs_member)

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Analytics & Reports"
        subtitle="Roadmap §14 results framework, platform usage and the reporting pulse — one period, one country filter, every tab"
        imageSeed="admin-analytics"
      />

      {/* Filter row. One row above the tabs, per the chart interaction spec:
          filters change what every chart shows, so they sit above all of them
          rather than inside any one. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-ktip-sand-200 bg-ktip-cream px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">Period</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-ktip-sand-300" role="group" aria-label="Period kind">
            {PERIOD_KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                onClick={() => update({ period: kind.value })}
                aria-pressed={filters.period === kind.value}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filters.period === kind.value
                    ? 'bg-ktip-ocean-500 text-white'
                    : 'text-ktip-sand-700 hover:bg-ktip-sand-100'
                }`}
              >
                {kind.label}
              </button>
            ))}
          </div>
          {filters.period === 'custom' ? (
            <span className="inline-flex items-center gap-1 text-sm">
              <input
                type="date"
                aria-label="From"
                value={filters.from ?? period.start}
                onChange={(e) => update({ from: e.currentTarget.value || null })}
                className="rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1 text-xs text-ktip-sand-900"
              />
              <span className="text-ktip-sand-500">to</span>
              <input
                type="date"
                aria-label="To (exclusive)"
                value={filters.to ?? period.end}
                onChange={(e) => update({ to: e.currentTarget.value || null })}
                className="rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1 text-xs text-ktip-sand-900"
              />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-ktip-sand-900 tabular-nums">
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => update({ offset: filters.offset + 1 })}
                className="rounded-md p-1 text-ktip-sand-600 hover:bg-ktip-sand-100"
              >
                <ChevronLeft size={16} />
              </button>
              {period.label}
              <button
                type="button"
                aria-label="Next period"
                disabled={filters.offset === 0}
                onClick={() => update({ offset: Math.max(0, filters.offset - 1) })}
                className="rounded-md p-1 text-ktip-sand-600 hover:bg-ktip-sand-100 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="hub-country" className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            Country
          </label>
          <select
            id="hub-country"
            value={filters.country ?? ''}
            onChange={(e) => update({ country: e.currentTarget.value || null })}
            className="rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1.5 text-xs text-ktip-sand-900"
          >
            <option value="">All OECS states</option>
            {oecs.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <p className="ml-auto text-xs text-ktip-sand-500">
          {filters.country
            ? 'Country filters the trends and breakdowns. Roadmap targets are regional, so the results tiles keep reporting the whole platform.'
            : 'Tiles report the selected period; trends look back further.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 overflow-x-auto border-b border-ktip-sand-200">
        <div role="tablist" aria-label="Analytics sections" className="flex min-w-max gap-1">
          {HUB_TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={filters.tab === tab}
              data-tutorial={tab === 'overview' ? 'analytics-tabs' : undefined}
              onClick={() => update({ tab })}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                filters.tab === tab
                  ? 'border-ktip-ocean-500 text-ktip-ocean-700'
                  : 'border-transparent text-ktip-sand-500 hover:text-ktip-sand-900'
              }`}
            >
              {HUB_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg border border-ktip-sand-200" />}>
          <Tab filters={filters} period={period} trend={trend} country={filters.country} />
        </Suspense>
      </div>
    </>
  )
}
