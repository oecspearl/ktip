import { useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { ChartFrame, HBar, type BarItem, type ChartColumn } from '../../../../components/charts'
import { useAdminAnalytics, type DistributionItem } from '../../../../hooks/useAdminAnalytics'
import { useCountries } from '../../../../hooks/useEmployers'
import { useKpiTargets, usePlatformPulse } from '../../../../hooks/usePlatformPulse'
import { useKpiHistory } from '../../../../hooks/useKpiSnapshots'
import { ROLE_LABELS } from '../../../../lib/constants'
import { resolveCopy } from '../../../../i18n/copy'
import { scopeNote, type HubProps } from '../hub-context'
import { KpiTiles, PulseError, SectionHeading, SeriesCard } from './shared'

const COMMUNITY_KPIS = [
  't33.new_registrations_total',
  't33.new_registrations_firms',
  't33.verified_mentors_investors',
  't33.oecs_state_coverage',
  't33.active_mentors',
  't33.active_investors',
  't33.partners_integrated',
  't33.partner_onboarded_users',
  't33.diaspora_members',
  't32.firms_participating',
]

const DIST_COLUMNS: ReadonlyArray<ChartColumn<DistributionItem>> = [
  { key: 'label', label: 'Group' },
  { key: 'count', label: 'Members', align: 'right' },
]

/** Who is here, where they are, and whether the partnerships are delivering. */
export default function CommunityTab({ filters, period, trend, country }: HubProps) {
  const { i18n } = useLingui()
  const { pulse, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)
  const history = useKpiHistory(filters.period === 'custom' ? 'month' : filters.period, 13)
  const { analytics, refetch } = useAdminAnalytics()
  const { countries } = useCountries()

  // Every OECS member state is a row, at zero if need be. "12 states, 9
  // represented" is the reading; a chart that only lists the nine hides the
  // three that matter most.
  const byCountry = useMemo(() => {
    if (!analytics || analytics.usersByCountry.state !== 'ok') return analytics?.usersByCountry
    const counts = new Map(analytics.usersByCountry.items.map((i) => [i.label, i.count]))
    const oecs = (countries ?? []).filter((c) => c.is_oecs_member).map((c) => c.name)
    const rows: DistributionItem[] = oecs.map((name) => ({ label: name, count: counts.get(name) ?? 0 }))
    const other = analytics.usersByCountry.items
      .filter((i) => !oecs.includes(i.label))
      .reduce((sum, i) => sum + i.count, 0)
    rows.sort((a, b) => b.count - a.count)
    if (other > 0) rows.push({ label: 'Outside the OECS', count: other })
    return { state: 'ok' as const, items: rows }
  }, [analytics, countries])

  const byRole = useMemo(() => {
    if (!analytics || analytics.usersByRole.state !== 'ok') return analytics?.usersByRole
    return {
      state: 'ok' as const,
      items: analytics.usersByRole.items
        .map((i) => ({ label: ROLE_LABELS[i.label] ? resolveCopy(i18n, ROLE_LABELS[i.label]) : i.label, count: i.count }))
        .sort((a, b) => b.count - a.count),
    }
  }, [analytics, i18n])

  const toBars = (items: DistributionItem[]): BarItem[] =>
    items.map((i) => ({ label: i.label, value: i.count, color: i.label === 'Outside the OECS' ? 'var(--color-chart-other)' : undefined }))

  return (
    <div className="space-y-6">
      <PulseError error={error} />

      <SectionHeading table="T33" title="Community growth" note={period.label} />
      <KpiTiles keys={COMMUNITY_KPIS} pulse={pulse} targets={targets} period={period} history={history} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeriesCard
            title="New registrations by role"
            subtitle={`per ${trend.grain}, stacked${country ? ` · ${country}` : ''}`}
            metric="registrations"
            trend={trend}
            country={country}
            stacked
            height={260}
          />
        </div>
        <ChartFrame<DistributionItem>
          title="Members by OECS state"
          subtitle={scopeNote(country) ?? 'all members, every state listed'}
          input={byCountry ?? { state: 'ok', items: [] }}
          columns={DIST_COLUMNS}
          onRetry={() => refetch()}
        >
          {(items) => <HBar items={toBars(items)} labelTop={3} />}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame<DistributionItem>
          title="Members by role"
          subtitle={scopeNote(country) ?? 'all members'}
          input={byRole ?? { state: 'ok', items: [] }}
          columns={DIST_COLUMNS}
          onRetry={() => refetch()}
        >
          {(items) => <HBar items={toBars(items)} labelTop={3} />}
        </ChartFrame>
        <SeriesCard
          title="New registrations by state"
          subtitle={`per ${trend.grain}, OECS members plus Other`}
          metric="registrations_by_country"
          trend={trend}
          country={null}
          stacked
        />
      </div>
    </div>
  )
}
