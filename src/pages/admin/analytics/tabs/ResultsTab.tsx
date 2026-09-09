import { useMemo } from 'react'
import { Target } from 'lucide-react'
import { KpiTargetTile } from '../../../../components/admin/kpi/KpiTargetTile'
import { useKpiTargets, usePlatformPulse } from '../../../../hooks/usePlatformPulse'
import { useKpiHistory } from '../../../../hooks/useKpiSnapshots'
import {
  KPI_TABLE_ORDER,
  KPI_TABLE_TITLES,
  PLATFORM_KPIS,
  type KpiTable,
} from '../../../../lib/kpi-catalog'
import type { HubProps } from '../hub-context'
import { PulseError, historyFor } from './shared'

/**
 * The roadmap's results framework, target against actual — every KPI in
 * Tables 32–38 plus the indicators stated elsewhere in the roadmap (146).
 *
 * KPIs that nothing collects yet are rendered, not hidden. A framework that
 * quietly shows only what happens to be measurable is how a reporting gap
 * goes unnoticed until the month it is due.
 *
 * Each tile carries a sparkline of its snapshot history at the selected
 * cadence, so "is this getting better" is answered on the tile rather than on
 * the Reports tab.
 */
export default function ResultsTab({ filters, period, country }: HubProps) {
  const { pulse, loading, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)
  const historyKind = filters.period === 'custom' ? 'month' : filters.period
  const history = useKpiHistory(historyKind, 13)

  const byTable = useMemo(() => {
    const groups = new Map<KpiTable, typeof PLATFORM_KPIS>()
    for (const kpi of PLATFORM_KPIS) {
      const existing = groups.get(kpi.table)
      if (existing) existing.push(kpi)
      else groups.set(kpi.table, [kpi])
    }
    return groups
  }, [])

  const measurable = PLATFORM_KPIS.filter((k) => k.phase === 1).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm-inset px-4 py-3">
        <Target size={16} className="shrink-0 text-ktip-ocean-600" />
        <p className="text-sm text-ktip-sand-700">
          Showing <strong>{period.label}</strong>. {measurable} of {PLATFORM_KPIS.length} KPIs are
          measurable today; the rest are shown with what they still need.
          {country && (
            <>
              {' '}
              Roadmap targets are regional, so these tiles report the whole platform, not {country}.
            </>
          )}
        </p>
      </div>

      <PulseError error={error} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {KPI_TABLE_ORDER.map((table) => {
            const kpis = byTable.get(table)
            if (!kpis?.length) return null
            return (
              <section key={table} data-tutorial={table === 'T32' ? 'analytics-results' : undefined}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-600">
                  {table} · {KPI_TABLE_TITLES[table]}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kpis.map((kpi) => (
                    <KpiTargetTile
                      key={kpi.key}
                      kpi={kpi}
                      measured={kpi.read(pulse)}
                      target={targets?.[kpi.key]?.target_value ?? null}
                      periodLabel={period.label}
                      history={history.periods.length ? historyFor(history, kpi.key) : undefined}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
