import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { KpiTargetTile } from '../../../../components/admin/kpi/KpiTargetTile'
import { AreaTrend, ChartFrame, type ChartColumn } from '../../../../components/charts'
import { useKpiSeries } from '../../../../hooks/useKpiSeries'
import { useKpiHistory } from '../../../../hooks/useKpiSnapshots'
import { pivotSeries, totalsOf, type SeriesMetric, type SeriesPoint } from '../../../../lib/kpi-series'
import { PLATFORM_KPIS, type PlatformPulse } from '../../../../lib/kpi-catalog'
import type { KpiTarget } from '../../../../hooks/usePlatformPulse'
import type { HubProps } from '../hub-context'

/** A row of KPI tiles for the given keys, with sparklines from the snapshot history. */
export function KpiTiles({
  keys: kpiKeys,
  pulse,
  targets,
  period,
  history,
}: {
  keys: readonly string[]
  pulse: PlatformPulse | undefined
  targets: Record<string, KpiTarget> | undefined
  period: HubProps['period']
  history?: ReturnType<typeof useKpiHistory>
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpiKeys.map((key) => {
        const kpi = PLATFORM_KPIS.find((k) => k.key === key)
        if (!kpi) return null
        return (
          <KpiTargetTile
            key={kpi.key}
            kpi={kpi}
            measured={kpi.read(pulse)}
            target={targets?.[kpi.key]?.target_value ?? null}
            periodLabel={period.label}
            history={history ? historyFor(history, kpi.key) : undefined}
          />
        )
      })}
    </div>
  )
}

/** Snapshot values for one key, oldest first, as the sparkline wants them. */
export function historyFor(history: ReturnType<typeof useKpiHistory>, key: string): Array<number | null> {
  return [...history.periods].reverse().map((p) => history.byPeriod.get(p)?.[key] ?? null)
}

const SERIES_COLUMNS: ReadonlyArray<ChartColumn<SeriesPoint>> = [
  { key: 'bucket', label: 'Period' },
  { key: 'segment', label: 'Series' },
  { key: 'value', label: 'Value', align: 'right', format: (v) => Number(v).toLocaleString() },
]

/**
 * One metric from get_kpi_series, drawn as an area.
 *
 * Multi-segment metrics stack; single-segment ones draw one line. Either way
 * the table view is the long rows straight from the RPC.
 */
export function SeriesCard({
  title,
  subtitle,
  metric,
  trend,
  country,
  target,
  targetLabel,
  unit,
  stacked,
  total,
  height,
}: {
  title: string
  subtitle?: string
  metric: SeriesMetric
  trend: HubProps['trend']
  country: string | null
  target?: number
  targetLabel?: string
  unit?: string
  /** Stack the segments (default when there is more than one). */
  stacked?: boolean
  /** Collapse the segments into one total line. */
  total?: boolean
  height?: number
}) {
  const { series, refetch } = useKpiSeries({
    metric,
    grain: trend.grain,
    start: trend.start,
    end: trend.end,
    country,
  })

  const pivot = useMemo(
    () => (series?.state === 'ok' ? pivotSeries(series.items, trend.grain) : null),
    [series, trend.grain],
  )

  const legend =
    pivot && pivot.segments.length > 1 && !total
      ? pivot.segments.map((s, i) => ({ label: s, color: `var(--color-chart-${Math.min(i + 1, 5)})` }))
      : undefined

  return (
    <ChartFrame<SeriesPoint>
      title={title}
      subtitle={subtitle}
      input={series ?? { state: 'ok', items: [] }}
      columns={SERIES_COLUMNS}
      legend={legend}
      onRetry={() => refetch()}
    >
      {() => {
        if (!pivot) return null
        if (total || pivot.segments.length === 1) {
          const totals = totalsOf(pivot)
          const rows = pivot.rows.map((row, i) => ({ label: row.label, total: totals[i] }))
          return (
            <AreaTrend
              data={rows}
              xKey="label"
              series={[{ key: 'total', label: title }]}
              target={target}
              targetLabel={targetLabel}
              unit={unit}
              height={height}
            />
          )
        }
        return (
          <AreaTrend
            data={pivot.rows}
            xKey="label"
            series={pivot.segments.map((s) => ({ key: s, label: s }))}
            stacked={stacked ?? true}
            unit={unit}
            height={height}
          />
        )
      }}
    </ChartFrame>
  )
}

/** The amber banner for a pulse that could not be read — one message, not thirty tiles. */
export function PulseError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
      <div>
        <p className="text-sm font-medium text-ktip-sun-800">The platform pulse could not be read</p>
        <p className="mt-0.5 text-xs text-ktip-sun-700">
          {(error as Error).message}. Every KPI figure on this tab is blank for that reason, not because
          the platform is empty.
        </p>
      </div>
    </div>
  )
}

export function SectionHeading({ table, title, note }: { table?: string; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      {table && <span className="text-xs font-semibold uppercase tracking-wider text-ktip-ocean-600">{table}</span>}
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {note && <span className="text-xs text-ktip-sand-500">{note}</span>}
    </div>
  )
}
