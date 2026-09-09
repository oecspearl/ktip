import { ChartFrame, DonutShare, HBar, type BarItem, type ChartColumn } from '../../../../components/charts'
import { useAdminAnalytics, type DistributionItem } from '../../../../hooks/useAdminAnalytics'
import { useKpiTargets, usePlatformPulse } from '../../../../hooks/usePlatformPulse'
import { useKpiHistory } from '../../../../hooks/useKpiSnapshots'
import {
  EVENT_TYPE_LABELS,
  GRANT_APPLICATION_STATUS_LABELS,
  PHASE_LABELS,
} from '../../../../lib/constants'
import type { MeasuredList } from '../../../../lib/measured'
import { scopeNote, type HubProps } from '../hub-context'
import { KpiTiles, PulseError, SectionHeading, SeriesCard } from './shared'

const ACTIVITY_KPIS = [
  't35.active_projects',
  't35.projects_per_month',
  't35.events_per_month',
  't35.event_registrations',
  't35.forum_posts_per_month',
  't35.connections_per_active_user',
  't35.challenges_completed',
  't35.challenge_submissions',
  't35.challenge_submission_states',
  't35.active_mentorships',
  't33.resources_published',
]

const FUNDING_KPIS = [
  't37.grants_listed',
  't37.users_connected_to_funding',
  't37.grants_awarded',
  't37.capital_facilitated_xcd',
]

const DIST_COLUMNS: ReadonlyArray<ChartColumn<DistributionItem>> = [
  { key: 'label', label: 'Group' },
  { key: 'count', label: 'Count', align: 'right' },
]

// Pipeline stages read in order, and the tones are the ones the member-facing
// PipelineDonut already uses — approved green, rejected grey, the rest the
// sequential ramp so "further along" reads darker.
const PIPELINE_TONE: Record<string, string> = {
  pending: 'var(--color-chart-seq-2)',
  under_review: 'var(--color-chart-seq-4)',
  approved: 'var(--color-chart-good)',
  rejected: 'var(--color-chart-other)',
}

/** Projects, events, discussions and funding — the work on the platform. */
export default function ActivityTab({ filters, period, trend, country }: HubProps) {
  const { pulse, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)
  const history = useKpiHistory(filters.period === 'custom' ? 'month' : filters.period, 13)
  const { analytics, refetch } = useAdminAnalytics()

  // The RPCs return slugs; the chart wants the labels members see.
  const relabel = (
    list: MeasuredList<DistributionItem> | undefined,
    labels: Record<string, string>,
  ): MeasuredList<DistributionItem> =>
    list?.state === 'ok'
      ? { state: 'ok', items: list.items.map((i) => ({ ...i, label: labels[i.label] ?? i.label })) }
      : (list ?? { state: 'ok', items: [] })

  const toBars = (items: DistributionItem[]): BarItem[] => items.map((i) => ({ label: i.label, value: i.count }))

  const pipeline = analytics?.grantPipeline
  const pipelineTotal = pipeline?.state === 'ok' ? pipeline.items.reduce((s, i) => s + i.count, 0) : 0

  return (
    <div className="space-y-6">
      <PulseError error={error} />

      <SectionHeading table="T35" title="Platform activity" note={period.label} />
      <KpiTiles keys={ACTIVITY_KPIS} pulse={pulse} targets={targets} period={period} history={history} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeriesCard
            title="Projects created"
            subtitle={`per ${trend.grain}${country ? ` · ${country}` : ''} · Table 35 asks for 5 a month`}
            metric="projects"
            trend={trend}
            country={country}
            target={trend.grain === 'month' ? 5 : undefined}
            height={260}
          />
        </div>
        <ChartFrame<DistributionItem>
          title="Grant application pipeline"
          subtitle={scopeNote(country) ?? 'every application, by stage'}
          input={relabel(pipeline, GRANT_APPLICATION_STATUS_LABELS)}
          columns={DIST_COLUMNS}
          legend={
            pipeline?.state === 'ok'
              ? pipeline.items.map((i) => ({
                  label: `${GRANT_APPLICATION_STATUS_LABELS[i.label] ?? i.label} ${i.count}`,
                  color: PIPELINE_TONE[i.label] ?? 'var(--color-chart-1)',
                }))
              : undefined
          }
          onRetry={() => refetch()}
        >
          {() => (
            <div className="flex justify-center py-2">
              <DonutShare
                items={
                  pipeline?.state === 'ok'
                    ? pipeline.items.map((i) => ({
                        label: GRANT_APPLICATION_STATUS_LABELS[i.label] ?? i.label,
                        value: i.count,
                        color: PIPELINE_TONE[i.label],
                      }))
                    : []
                }
                center={pipelineTotal.toLocaleString()}
                centerLabel="applications"
              />
            </div>
          )}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartFrame<DistributionItem>
          title="Projects by category"
          subtitle={scopeNote(country)}
          input={analytics?.projectsByCategory ?? { state: 'ok', items: [] }}
          columns={DIST_COLUMNS}
          onRetry={() => refetch()}
        >
          {(items) => <HBar items={toBars(items)} />}
        </ChartFrame>
        <ChartFrame<DistributionItem>
          title="Projects by phase"
          subtitle={scopeNote(country)}
          input={relabel(analytics?.projectsByPhase, PHASE_LABELS)}
          columns={DIST_COLUMNS}
          onRetry={() => refetch()}
        >
          {(items) => <HBar items={toBars(items)} labelTop={4} />}
        </ChartFrame>
        <ChartFrame<DistributionItem>
          title="Events by type"
          subtitle={scopeNote(country)}
          input={relabel(analytics?.eventsByType, EVENT_TYPE_LABELS)}
          columns={DIST_COLUMNS}
          onRetry={() => refetch()}
        >
          {(items) => <HBar items={toBars(items)} />}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SeriesCard
          title="Events hosted"
          subtitle={`published or completed, per ${trend.grain} · target 4 a month`}
          metric="events"
          trend={trend}
          country={country}
          target={trend.grain === 'month' ? 4 : undefined}
        />
        <SeriesCard
          title="Event registrations"
          subtitle={`per ${trend.grain}`}
          metric="event_registrations"
          trend={trend}
          country={country}
        />
        <SeriesCard
          title="Discussions started"
          subtitle={`forum posts per ${trend.grain} · target 50 a month`}
          metric="forum_posts"
          trend={trend}
          country={country}
          target={trend.grain === 'month' ? 50 : undefined}
        />
      </div>

      <SectionHeading table="T37" title="Funding" note={period.label} />
      <KpiTiles keys={FUNDING_KPIS} pulse={pulse} targets={targets} period={period} history={history} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SeriesCard
          title="Grant applications"
          subtitle={`submitted per ${trend.grain}`}
          metric="grant_applications"
          trend={trend}
          country={country}
        />
        <SeriesCard
          title="Connections made"
          subtitle={`accepted per ${trend.grain}`}
          metric="connections"
          trend={trend}
          country={country}
        />
      </div>
    </div>
  )
}
