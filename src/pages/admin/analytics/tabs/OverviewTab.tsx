import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { RadialTarget, STATUS_WORDS } from '../../../../components/charts'
import { useKpiTargets, usePlatformPulse } from '../../../../hooks/usePlatformPulse'
import {
  PLATFORM_KPIS,
  formatKpiValue,
  kpiProgress,
  kpiStatus,
  type KpiStatus,
} from '../../../../lib/kpi-catalog'
import type { HubProps } from '../hub-context'
import { PulseError, SeriesCard } from './shared'

/**
 * The four the programme lead is asked about most: are people joining, are
 * they coming back, is there work on the platform, and is money moving.
 */
const HEADLINE_KPI_KEYS = [
  't33.new_registrations_total',
  't34.mau_pct',
  't35.active_projects',
  't37.users_connected_to_funding',
]

const STRIP_CLASS: Record<KpiStatus, string> = {
  good: 'text-chart-good',
  warn: 'text-chart-warn',
  bad: 'text-chart-bad',
  none: 'text-ktip-sand-400',
}

export default function OverviewTab({ period, trend, country }: HubProps) {
  const { pulse, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)

  // Every KPI's status, counted. The same kpiStatus() the tiles use, so the
  // strip and the tiles cannot disagree about how many are off track.
  const counts = useMemo(() => {
    const tally: Record<KpiStatus, number> = { good: 0, warn: 0, bad: 0, none: 0 }
    for (const kpi of PLATFORM_KPIS) {
      const measured = kpi.read(pulse)
      const target = targets?.[kpi.key]?.target_value ?? null
      const progress =
        measured.state === 'ok' && target !== null && !kpi.reportedOnly
          ? kpiProgress(measured.value, target, kpi.direction)
          : null
      tally[kpiStatus(progress)] += 1
    }
    return tally
  }, [pulse, targets])

  return (
    <div className="space-y-6">
      <PulseError error={error} />

      {/* Headline gauges */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HEADLINE_KPI_KEYS.map((key) => {
          const kpi = PLATFORM_KPIS.find((k) => k.key === key)
          if (!kpi) return null
          const measured = kpi.read(pulse)
          const target = targets?.[kpi.key]?.target_value ?? null
          const readable = measured.state === 'ok' && target !== null
          const status = kpiStatus(
            readable ? kpiProgress(measured.value, target, kpi.direction) : null,
          )
          return (
            <div key={kpi.key} className="flex items-center gap-4 neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-4">
              {readable ? (
                <RadialTarget value={measured.value} target={target} direction={kpi.direction} label={kpi.label} />
              ) : (
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-8 border-ktip-sand-100 text-2xl font-bold text-ktip-sand-400"
                  aria-label={`${kpi.label}: not measured`}
                >
                  —
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">{kpi.table}</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">
                  {measured.state === 'ok' ? formatKpiValue(measured.value, kpi.unit) : '—'}
                </p>
                <p className="text-xs text-ktip-sand-600">
                  {kpi.label}
                  {target !== null ? ` · target ${formatKpiValue(target, kpi.unit)}` : ''}
                </p>
                <p className={`mt-1 text-xs font-semibold ${STRIP_CLASS[status]}`}>
                  {measured.state === 'unavailable'
                    ? "couldn't load"
                    : measured.state === 'not-instrumented'
                      ? 'not yet measured'
                      : STATUS_WORDS[status]}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-2 divide-x divide-ktip-sand-200 overflow-hidden neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm sm:grid-cols-4">
        {(
          [
            ['good', 'on track'],
            ['warn', 'at risk (80–99% of target)'],
            ['bad', 'off track'],
            ['none', 'not yet measured'],
          ] as Array<[KpiStatus, string]>
        ).map(([status, label]) => (
          <div key={status} className="flex items-baseline gap-2 px-4 py-3">
            <span className={`text-2xl font-bold tabular-nums ${STRIP_CLASS[status]}`}>{counts[status]}</span>
            <span className="text-xs text-ktip-sand-600">{label}</span>
          </div>
        ))}
        <Link
          to={{ search: '?tab=results' }}
          className="col-span-full flex items-center justify-end gap-1 border-t border-ktip-sand-200 px-4 py-2 text-xs font-medium text-ktip-ocean-700 hover:underline sm:col-span-4"
        >
          All {PLATFORM_KPIS.length} KPIs in the results framework
          <ArrowRight size={12} />
        </Link>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SeriesCard
          title="New registrations"
          subtitle={`per ${trend.grain}${country ? ` · ${country}` : ''}`}
          metric="registrations"
          trend={trend}
          country={country}
          total
        />
        <SeriesCard
          title="Active members"
          subtitle={`distinct members with an activity day, per ${trend.grain}${country ? ` · ${country}` : ''}`}
          metric="active_users"
          trend={trend}
          country={country}
        />
      </div>
    </div>
  )
}
