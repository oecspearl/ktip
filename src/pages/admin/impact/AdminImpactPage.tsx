import { useMemo, useState } from 'react'
import { Target, AlertTriangle } from 'lucide-react'
import { PageHero } from '../../../components/layout/PageHero'
import { KpiTargetTile } from '../../../components/admin/kpi/KpiTargetTile'
import { usePlatformPulse, useKpiTargets } from '../../../hooks/usePlatformPulse'
import {
  KPI_TABLE_ORDER,
  KPI_TABLE_TITLES,
  PLATFORM_KPIS,
  type KpiTable,
} from '../../../lib/kpi-catalog'

type PeriodKind = 'month' | 'quarter' | 'year'

/** Start and end of the current calendar month, quarter or year, as ISO dates. */
function periodFor(kind: PeriodKind): { start: string; end: string; label: string } {
  const now = new Date()
  const year = now.getUTCFullYear()

  if (kind === 'year') {
    return {
      start: `${year}-01-01`,
      end: `${year + 1}-01-01`,
      label: String(year),
    }
  }
  if (kind === 'quarter') {
    const q = Math.floor(now.getUTCMonth() / 3)
    const startMonth = q * 3
    const start = new Date(Date.UTC(year, startMonth, 1))
    const end = new Date(Date.UTC(year, startMonth + 3, 1))
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: `Q${q + 1} ${year}`,
    }
  }
  const start = new Date(Date.UTC(year, now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(year, now.getUTCMonth() + 1, 1))
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}

/**
 * The roadmap's results framework, target against actual.
 *
 * Its own page rather than a band on /admin: the console landing page is seen
 * by every seat AdminRoute admits, and thirty KPIs behind org:manage would make
 * it ninety percent invisible to both supervisors. /admin carries a four-tile
 * summary that links here.
 *
 * KPIs that nothing collects yet are rendered, not hidden. A framework that
 * quietly shows only what happens to be measurable is how a reporting gap goes
 * unnoticed until the month it is due.
 *
 * English, not lingui — src/pages/admin/ is excluded in scripts/i18n/config.mjs.
 */
export default function AdminImpactPage() {
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month')
  const period = useMemo(() => periodFor(periodKind), [periodKind])

  const { pulse, loading, error } = usePlatformPulse({ start: period.start, end: period.end })
  const { targets } = useKpiTargets(period.start)

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
    <>
      <PageHero
        inset
        compact
        eyebrow="Results Framework"
        title="Impact & KPIs"
        subtitle="Roadmap v1.1 §14, Tables 32-38 — target against actual"
        imageSeed="admin-impact"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 p-0.5">
            {(['month', 'quarter', 'year'] as PeriodKind[]).map((kind) => (
              <button
                key={kind}
                onClick={() => setPeriodKind(kind)}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  periodKind === kind ? 'bg-white text-gray-900' : 'text-white/80 hover:text-white'
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-3">
        <Target size={16} className="shrink-0 text-ktip-ocean-600" />
        <p className="text-sm text-ktip-sand-700">
          Showing <strong>{period.label}</strong>. {measurable} of {PLATFORM_KPIS.length} KPIs
          are measurable today; the rest are shown with what they still need.
        </p>
      </div>

      {/* An outright RPC failure is one message, not thirty identical amber
          tiles — the KPIs did not each fail, the pulse did. */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
          <div>
            <p className="text-sm font-medium text-ktip-sun-800">
              The platform pulse could not be read
            </p>
            <p className="mt-0.5 text-xs text-ktip-sun-700">
              {(error as Error).message}. Every figure below is blank for that reason, not because
              the platform is empty.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-ktip-sand-200" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {KPI_TABLE_ORDER.map((table) => {
            const kpis = byTable.get(table)
            if (!kpis?.length) return null

            return (
              <section key={table}>
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
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
