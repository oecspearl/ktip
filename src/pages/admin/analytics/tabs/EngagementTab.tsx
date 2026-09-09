import { ArrowRight, Info } from 'lucide-react'
import { ChartFrame, HBar, type BarItem, type ChartColumn } from '../../../../components/charts'
import {
  useAnalyticsData,
  type ConversionStat,
  type FeatureUsageStat,
  type FunnelStep,
  type PageViewStat,
  type SessionSummary,
} from '../../../../hooks/useAnalyticsData'
import { useKpiTargets, usePlatformPulse } from '../../../../hooks/usePlatformPulse'
import { useKpiHistory } from '../../../../hooks/useKpiSnapshots'
import { useAnalyticsConsent } from '../../../../lib/analytics-consent'
import { okList, unavailableList, type MeasuredList } from '../../../../lib/measured'
import type { HubProps } from '../hub-context'
import { KpiTiles, PulseError, SectionHeading, SeriesCard } from './shared'

const ENGAGEMENT_KPIS = [
  't34.mau_pct',
  't34.dau_pct',
  't34.retention_pct',
  't34.session_minutes',
  't34.nps',
  't35.resource_reach_pct',
  't37.grants_directory_reach_pct',
  't36.satisfaction',
]

const FUNNEL_LABELS: Record<string, string> = {
  modal_auto_opened: 'Modal auto-opened',
  modal_cta_opened: 'CTA clicked',
  step_1_complete: 'Step 1 complete',
  submit_attempt: 'Submit attempted',
  modal_dismissed: 'Dismissed',
}

const CONVERSION_LABELS: Record<string, string> = {
  prereg_submitted: 'Pre-registration submitted',
  login_success: 'Login',
  signup_success: 'Signup',
  onboarding_complete: 'Onboarding complete',
}

const PAGE_COLUMNS: ReadonlyArray<ChartColumn<PageViewStat>> = [
  { key: 'path', label: 'Page' },
  { key: 'count', label: 'Views', align: 'right' },
]
const FEATURE_COLUMNS: ReadonlyArray<ChartColumn<FeatureUsageStat>> = [
  { key: 'feature', label: 'Feature' },
  { key: 'action', label: 'Action' },
  { key: 'count', label: 'Uses', align: 'right' },
]
const FUNNEL_COLUMNS: ReadonlyArray<ChartColumn<FunnelStep>> = [
  { key: 'step', label: 'Step', format: (v) => FUNNEL_LABELS[String(v)] ?? String(v) },
  { key: 'count', label: 'Sessions', align: 'right' },
]
const CONVERSION_COLUMNS: ReadonlyArray<ChartColumn<ConversionStat>> = [
  { key: 'name', label: 'Conversion', format: (v) => CONVERSION_LABELS[String(v)] ?? String(v) },
  { key: 'count', label: 'Count', align: 'right' },
]

/** The usage hook throws on a refused read; the frames want a MeasuredList. */
function asList<T>(items: T[] | undefined, error: Error | null, what: string): MeasuredList<T> {
  if (error) return unavailableList(`${what}: ${error.message}`)
  return okList(items ?? [])
}

/**
 * Are people coming back, and what do they do when they do.
 *
 * Two sources with different honesty. The T34 tiles come from
 * user_activity_days and need no consent. Everything below the tiles comes
 * from analytics_events, whose inserts are consent-gated, so it describes
 * consenting sessions only and undercounts by construction. The banner says
 * so, and shows the admin's own consent state because on a small pilot that
 * is very often why the table is empty.
 */
export default function EngagementTab({ filters, period, trend, country }: HubProps) {
  const { pulse, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)
  const history = useKpiHistory(filters.period === 'custom' ? 'month' : filters.period, 13)
  const usage = useAnalyticsData({ start: period.start, end: period.end })
  const consent = useAnalyticsConsent()
  const usageError = usage.error as Error | null

  return (
    <div className="space-y-6">
      <PulseError error={error} />

      <SectionHeading table="T34" title="User engagement" note={period.label} />
      <KpiTiles keys={ENGAGEMENT_KPIS} pulse={pulse} targets={targets} period={period} history={history} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SeriesCard
          title="Active members"
          subtitle={`distinct members with an activity day, per ${trend.grain}${country ? ` · ${country}` : ''}`}
          metric="active_users"
          trend={trend}
          country={country}
        />
        <SeriesCard
          title="Daily active members"
          subtitle={`mean daily distinct members, per ${trend.grain}${country ? ` · ${country}` : ''}`}
          metric="daily_active"
          trend={trend}
          country={country}
        />
      </div>

      <SectionHeading title="Usage" note="consenting sessions only" />
      <div className="flex items-start gap-3 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-ktip-ocean-600" />
        <p className="text-sm text-ktip-sand-700">
          Usage events are written only for visitors who accepted the analytics banner, so these
          figures undercount rather than overcount — treat them as a floor. Your own browser's
          consent is <strong>{consent}</strong>
          {consent !== 'granted' && ', so your own visits are not counted'}. Member counts, active
          days and the roadmap KPIs above do not come from this table and need no consent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeriesCard
            title="Page views"
            subtitle={`per ${trend.grain}, consenting sessions`}
            metric="page_views"
            trend={trend}
            country={null}
            height={240}
          />
        </div>
        <ChartFrame<FunnelStep>
          title="Pre-registration funnel"
          subtitle="the gap between two steps is the useful number"
          input={asList(usage.preregFunnel, usageError, 'funnel steps')}
          columns={FUNNEL_COLUMNS}
          emptyText="No funnel events in this period"
        >
          {(steps) => (
            <HBar
              items={steps
                .filter((s) => s.step !== 'modal_dismissed')
                .map((s): BarItem => ({ label: FUNNEL_LABELS[s.step] ?? s.step, value: s.count }))}
              labelTop={5}
            />
          )}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartFrame<PageViewStat>
          title="Top pages"
          input={asList(usage.topPages?.slice(0, 10), usageError, 'top pages')}
          columns={PAGE_COLUMNS}
          emptyText="No page views in this period"
        >
          {(pages) => <HBar items={pages.map((p) => ({ label: p.path, value: p.count }))} labelWidth={140} />}
        </ChartFrame>
        <ChartFrame<FeatureUsageStat>
          title="Feature usage"
          input={asList(usage.featureUsage?.slice(0, 10), usageError, 'feature usage')}
          columns={FEATURE_COLUMNS}
          emptyText="No feature events in this period"
        >
          {(features) => (
            <HBar
              items={features.map((f) => ({ label: f.action ? `${f.feature}: ${f.action}` : f.feature, value: f.count }))}
              labelWidth={140}
            />
          )}
        </ChartFrame>
        <ChartFrame<ConversionStat>
          title="Conversions"
          input={asList(usage.conversions, usageError, 'conversions')}
          columns={CONVERSION_COLUMNS}
          emptyText="No conversions in this period"
        >
          {(conversions) => (
            <ul className="divide-y divide-ktip-sand-200 text-sm">
              {conversions.map((c) => (
                <li key={c.name} className="flex items-center justify-between py-2">
                  <span className="text-ktip-sand-700">{CONVERSION_LABELS[c.name] ?? c.name}</span>
                  <span className="text-lg font-bold tabular-nums text-ktip-sand-900">{c.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
      </div>

      <ChartFrame<SessionSummary>
        title="Recent journeys"
        subtitle="the last 25 consenting sessions, in page order"
        input={asList(usage.recentSessions?.slice(0, 25), usageError, 'sessions')}
        columns={[
          { key: 'session_id', label: 'Session', format: (v) => String(v).slice(0, 8) },
          { key: 'page_count', label: 'Pages', align: 'right' },
          { key: 'started_at', label: 'Started', format: (v) => new Date(String(v)).toLocaleString() },
        ]}
        emptyText="No sessions in this period"
      >
        {(sessions) => (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ktip-sand-200 text-left text-xs text-ktip-sand-500">
                  <th className="pb-2 pr-4 font-semibold">Session</th>
                  <th className="pb-2 pr-4 font-semibold">Member</th>
                  <th className="pb-2 pr-4 font-semibold">Pages</th>
                  <th className="pb-2 pr-4 font-semibold">Started</th>
                  <th className="pb-2 font-semibold">Journey</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.session_id} className="border-b border-ktip-sand-100">
                    <td className="py-2 pr-4 font-mono text-xs text-ktip-sand-600">{session.session_id.slice(0, 8)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {session.user_id ? (
                        <span className="font-mono text-ktip-sand-700">{session.user_id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-ktip-sand-500">Anonymous</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-medium tabular-nums text-ktip-sand-900">{session.page_count}</td>
                    <td className="py-2 pr-4 text-xs text-ktip-sand-600">{new Date(session.started_at).toLocaleString()}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {session.pages.slice(0, 6).map((page, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ArrowRight size={10} className="shrink-0 text-ktip-sand-400" />}
                            <span className="max-w-[120px] truncate bg-ktip-sand-100 px-1.5 py-0.5 text-xs text-ktip-sand-700">{page}</span>
                          </span>
                        ))}
                        {session.pages.length > 6 && (
                          <span className="text-xs text-ktip-sand-500">+{session.pages.length - 6} more</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartFrame>
    </div>
  )
}
