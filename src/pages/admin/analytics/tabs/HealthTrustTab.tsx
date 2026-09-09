import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Bug } from 'lucide-react'
import { AreaTrend, ChartFrame, type ChartColumn } from '../../../../components/charts'
import { useHealthSamples, type HealthSample } from '../../../../hooks/useHealthSamples'
import { useKpiTargets, usePlatformPulse } from '../../../../hooks/usePlatformPulse'
import { useKpiHistory } from '../../../../hooks/useKpiSnapshots'
import { isSentryNotConfigured, useSentryIssues } from '../../../../hooks/useSentryIssues'
import { bucketLabel } from '../../../../lib/kpi-series'
import type { HubProps } from '../hub-context'
import { KpiTiles, PulseError, SectionHeading, SeriesCard } from './shared'

const HEALTH_KPIS = [
  't36.uptime_pct',
  't36.error_rate_5xx',
  't36.p75_lcp_ms',
  't36.ticket_hours',
  't36.satisfaction',
  't36.security_incidents',
  't36.moderation_review_hours',
  't36.complaints_total',
]

const SAMPLE_COLUMNS: ReadonlyArray<ChartColumn<HealthSample>> = [
  { key: 'observed_at', label: 'Observed', format: (v) => new Date(String(v)).toLocaleDateString('en-GB') },
  { key: 'source', label: 'Source' },
  { key: 'uptime_pct', label: 'Uptime %', align: 'right', format: (v) => (v == null ? '—' : String(v)) },
  { key: 'error_rate_5xx', label: '5xx %', align: 'right', format: (v) => (v == null ? '—' : String(v)) },
  { key: 'p75_lcp_ms', label: 'p75 LCP ms', align: 'right', format: (v) => (v == null ? '—' : String(v)) },
]

/**
 * Whether the platform is up, fast and safe, and how complaints are handled.
 *
 * Three sources, kept visibly separate because they are different kinds of
 * fact: readings a probe took from outside (platform_health_samples), figures
 * the database can compute (tickets, moderation), and the error stream in
 * Sentry. An uptime figure and a ticket-hours figure sitting in identical
 * tiles would invite the same trust, and only one of them is measured.
 */
export default function HealthTrustTab({ filters, period, trend, country }: HubProps) {
  const { pulse, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)
  const history = useKpiHistory(filters.period === 'custom' ? 'month' : filters.period, 13)
  const { samples, refetch } = useHealthSamples({ start: trend.start, end: trend.end })
  const sentry = useSentryIssues({ scope: 'unresolved', statsPeriod: '14d' })

  const rows = useMemo(
    () =>
      samples?.state === 'ok'
        ? samples.items.map((s) => ({
            label: bucketLabel(s.observed_at.slice(0, 10), 'day'),
            uptime: s.uptime_pct,
            errors: s.error_rate_5xx,
            lcp: s.p75_lcp_ms,
          }))
        : [],
    [samples],
  )

  const sentryTotals = useMemo(
    () => ({
      issues: sentry.issues.length,
      events: sentry.issues.reduce((s, i) => s + i.count, 0),
      users: sentry.issues.reduce((s, i) => s + i.userCount, 0),
      errors: sentry.issues.filter((i) => i.level === 'error' || i.level === 'fatal').length,
    }),
    [sentry.issues],
  )

  const sampleFrame = (title: string, subtitle: string, key: 'uptime' | 'errors' | 'lcp', target?: number, unit = '') => (
    <ChartFrame<HealthSample>
      title={title}
      subtitle={subtitle}
      input={samples ?? { state: 'ok', items: [] }}
      columns={SAMPLE_COLUMNS}
      onRetry={() => refetch()}
      emptyText="No health samples in this window yet — the Monday job writes one a week"
    >
      {() => (
        <AreaTrend
          data={rows}
          xKey="label"
          series={[{ key, label: title }]}
          target={target}
          unit={unit}
          yMax={key === 'uptime' ? 100 : undefined}
          height={200}
        />
      )}
    </ChartFrame>
  )

  return (
    <div className="space-y-6">
      <PulseError error={error} />

      <SectionHeading table="T36" title="Platform health" note={period.label} />
      <KpiTiles keys={HEALTH_KPIS} pulse={pulse} targets={targets} period={period} history={history} />

      <SectionHeading
        title="Observed from outside"
        note="platform_health_samples — one row a week; uptime and 5xx need an external probe, page load comes from real readers"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {sampleFrame('Uptime', 'percent · target 99.5', 'uptime', 99.5, '%')}
        {sampleFrame('Server error rate', '5xx as % of requests · threshold 0.5', 'errors', 0.5, '%')}
        {sampleFrame('Page load, p75', 'ms · target 3000 · consenting readers', 'lcp', 3000, ' ms')}
      </div>

      <SectionHeading title="Trust" note="roadmap §6: complaint volumes go in the monthly and quarterly report" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeriesCard
            title="Complaints and reports filed"
            subtitle={`content reports, takedown notices and grievances per ${trend.grain}`}
            metric="content_reports"
            trend={trend}
            country={null}
            stacked
            height={240}
          />
        </div>
        <div className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bug size={16} className="text-ktip-ocean-600" />
            <h3 className="text-sm font-semibold text-ktip-sand-900">Errors, last 14 days</h3>
          </div>
          {sentry.error ? (
            <p className="text-sm text-ktip-sand-500">
              {isSentryNotConfigured(sentry.error)
                ? 'Sentry is not connected on this deployment.'
                : `Couldn't reach Sentry: ${(sentry.error as Error).message}`}
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ktip-sand-500">Open issues</dt>
                <dd className="text-2xl font-bold tabular-nums text-ktip-sand-900">{sentryTotals.issues}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Error-level</dt>
                <dd className="text-2xl font-bold tabular-nums text-chart-bad">{sentryTotals.errors}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Events</dt>
                <dd className="text-2xl font-bold tabular-nums text-ktip-sand-900">{sentryTotals.events.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-ktip-sand-500">Members affected</dt>
                <dd className="text-2xl font-bold tabular-nums text-ktip-sand-900">{sentryTotals.users.toLocaleString()}</dd>
              </div>
            </dl>
          )}
          <Link
            to="/admin/errors"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-700 hover:underline"
          >
            Open the error console
            <ArrowRight size={12} />
          </Link>
          {country && (
            <p className="mt-2 text-xs text-ktip-sand-500">Errors have no member country; this card ignores the filter.</p>
          )}
        </div>
      </div>
    </div>
  )
}
