import { useMemo, useState } from 'react'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { PageHero } from '../../../components/layout/PageHero'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../contexts/ToastContext'
import {
  useKpiHistory,
  useSnapshotKpis,
  startOfPeriod,
  type PeriodKind,
} from '../../../hooks/useKpiSnapshots'
import { PLATFORM_KPIS, formatKpiValue, type PlatformKpi } from '../../../lib/kpi-catalog'

const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: 'Weekly Pulse',
  month: 'Monthly Report',
  quarter: 'Quarterly Report',
  year: 'Annual Report',
}

/**
 * The §14 Table 39 reporting surface.
 *
 * ONE page with a period switch, not four. The roadmap lists a Weekly Platform
 * Pulse, a Monthly Report, a Quarterly Report and an Annual State of the
 * Ecosystem Report — but they are the same figures over different windows, and
 * four pages would be four places for a KPI definition to drift.
 *
 * Reads kpi_snapshots, NOT the live pulse. That is the whole point: a past week
 * has to render as what it was when it was taken. A live view under a past
 * heading is a report that changes every time somebody opens it, and nobody
 * notices until two documents disagree.
 *
 * English, not lingui — src/pages/admin/ is excluded in scripts/i18n/config.mjs.
 */
export default function AdminPulsePage() {
  const toast = useToast()
  const [periodKind, setPeriodKind] = useState<PeriodKind>('week')
  const { byPeriod, periods, loading, error, refetch } = useKpiHistory(periodKind)
  const { snapshot, loading: snapshotting } = useSnapshotKpis()

  const currentStart = useMemo(() => startOfPeriod(periodKind), [periodKind])

  // Only KPIs that could ever have been snapshotted. A Phase 3 metric nobody
  // has attested yet would otherwise be thirty empty columns.
  const columns = useMemo(
    () => PLATFORM_KPIS.filter((k) => periods.some((p) => byPeriod.get(p)?.[k.key] != null)),
    [periods, byPeriod]
  )

  const recompute = async () => {
    try {
      await snapshot({ periodKind, periodStart: currentStart })
      toast.success(`Reading taken for ${currentStart}`)
    } catch (err: any) {
      toast.error(err.message || 'Could not take the reading')
    }
  }

  const exportCsv = () => {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [['Period', ...columns.map((c) => escape(c.label))].join(',')]

    for (const period of periods) {
      const row = byPeriod.get(period) || {}
      lines.push(
        [
          period,
          ...columns.map((c) => {
            const value = row[c.key]
            // An unmeasured period exports as UNAVAILABLE, never as an empty
            // cell a spreadsheet will read as zero.
            return value == null ? 'UNAVAILABLE' : String(value)
          }),
        ].join(',')
      )
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ktip-${periodKind}-pulse-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Reporting"
        title={PERIOD_LABELS[periodKind]}
        subtitle="Roadmap v1.1 §14 Table 39 — readings as they were taken, not as they are now"
        imageSeed="admin-analytics"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 p-0.5">
            {(['week', 'month', 'quarter', 'year'] as PeriodKind[]).map((kind) => (
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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ktip-sand-600">
          {periods.length
            ? `${periods.length} ${periodKind}${periods.length === 1 ? '' : 's'} recorded. Current period starts ${currentStart}.`
            : `No readings yet. Take one for the period starting ${currentStart}.`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw size={14} />}
            loading={snapshotting}
            onClick={recompute}
          >
            Recompute this period
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Download size={14} />}
            onClick={exportCsv}
            disabled={!periods.length}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* A scheduled job is the normal writer; the button above is the fallback
          and the backfill path. Saying so here means an operator on a plan
          without cron knows the framework still works. */}
      <div className="mb-6 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-3 text-sm text-ktip-sand-700">
        Readings are taken automatically each Monday by <code>/api/cron/kpi-snapshot</code>. If
        scheduled jobs are unavailable on this plan, take them by hand with the button above —
        the framework works either way, it just needs somebody to press it.
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
          <div>
            <p className="text-sm font-medium text-ktip-sun-800">History could not be read</p>
            <p className="mt-0.5 text-xs text-ktip-sun-700">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg border border-ktip-sand-200" />
      ) : !periods.length ? (
        <div className="rounded-lg border border-ktip-sand-200 py-16 text-center">
          <h3 className="mb-1 text-lg font-semibold text-gray-900">No readings recorded</h3>
          <p className="mx-auto max-w-md text-sm text-gray-600">
            Point-in-time metrics cannot be reconstructed later, so a period with no reading stays
            blank permanently. Take the first one now.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ktip-sand-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ktip-sand-200 bg-ktip-sand-50">
                <th className="sticky left-0 bg-ktip-sand-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Period
                </th>
                {columns.map((kpi) => (
                  <th
                    key={kpi.key}
                    title={kpi.definitionNote}
                    className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                  >
                    {kpi.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ktip-sand-200">
              {periods.map((period) => (
                <tr key={period} className="transition-colors hover:bg-ktip-sand-50/50">
                  <td className="sticky left-0 bg-white px-4 py-3 text-sm font-medium text-gray-900">
                    {period}
                  </td>
                  {columns.map((kpi) => (
                    <Cell key={kpi.key} kpi={kpi} value={byPeriod.get(period)?.[kpi.key] ?? null} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-ktip-sand-500">
        An em dash means the metric could not be measured in that period. It does not mean zero —
        see <code>kpi_snapshots.value</code> in migration 132.
      </div>

      <button onClick={() => refetch()} className="sr-only">
        Refresh
      </button>
    </>
  )
}

function Cell({ kpi, value }: { kpi: PlatformKpi; value: number | null }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums">
      {value === null ? (
        <span className="text-ktip-sand-400">—</span>
      ) : (
        <span className="text-gray-900">{formatKpiValue(value, kpi.unit)}</span>
      )}
    </td>
  )
}
