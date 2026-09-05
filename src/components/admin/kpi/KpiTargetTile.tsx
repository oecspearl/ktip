import { AlertTriangle, Info } from 'lucide-react'
import type { Measured } from '../../../lib/measured'
import {
  formatKpiValue,
  kpiProgress,
  type PlatformKpi,
} from '../../../lib/kpi-catalog'

interface KpiTargetTileProps {
  kpi: PlatformKpi
  measured: Measured
  target: number | null
  periodLabel?: string
}

/**
 * One roadmap KPI: what it reads, what it should read, and how far apart.
 *
 * Three states, and keeping them apart is the whole point — see
 * src/lib/measured.ts:
 *
 *   not-instrumented  grey, em dash, "Not yet measured"    a roadmap item
 *   unavailable       amber, em dash, the reason           somebody's bug
 *   ok                the value, the target, a bar         a number to report
 *
 * A tile that rendered 0 for the first two would put a false figure in a report
 * to the World Bank, which is the failure this whole surface exists to avoid.
 *
 * English, not lingui — src/pages/admin/ is excluded in scripts/i18n/config.mjs.
 */
export function KpiTargetTile({ kpi, measured, target, periodLabel }: KpiTargetTileProps) {
  const Icon = kpi.icon
  const progress =
    measured.state === 'ok' && target !== null
      ? kpiProgress(measured.value, target, kpi.direction)
      : null

  // 100% is met, 80% is close enough to leave alone, below that needs someone.
  const barClass =
    progress === null
      ? 'bg-ktip-sand-300'
      : progress >= 1
        ? 'bg-ktip-tropical-500'
        : progress >= 0.8
          ? 'bg-ktip-sun-500'
          : 'bg-red-400'

  const failed = measured.state === 'unavailable'
  const pending = measured.state === 'not-instrumented'

  return (
    <div
      className={`rounded-lg border p-4 ${
        failed
          ? 'border-ktip-sun-200 bg-ktip-sun-50/50'
          : pending
            ? 'border-dashed border-ktip-sand-200 bg-ktip-sand-50/40'
            : 'border-ktip-sand-200'
      }`}
    >
      <div className="mb-2 flex items-start gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            failed ? 'bg-ktip-sun-100' : 'bg-ktip-ocean-100'
          }`}
        >
          {failed ? (
            <AlertTriangle size={16} className="text-ktip-sun-700" />
          ) : (
            <Icon size={16} className={pending ? 'text-ktip-sand-400' : 'text-ktip-ocean-600'} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight text-gray-900">{kpi.label}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {kpi.table} · {kpi.cadence}
            {periodLabel ? ` · ${periodLabel}` : ''}
          </p>
        </div>
        {/* The definition is the first thing a reviewer asks about, especially
            where we had to decide what the roadmap left open. */}
        <span
          title={kpi.definitionNote}
          className="shrink-0 cursor-help text-ktip-sand-400 transition-colors hover:text-ktip-sand-600"
        >
          <Info size={14} />
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={`text-2xl font-bold ${
            measured.state === 'ok' ? 'text-gray-900' : 'text-ktip-sand-400'
          }`}
        >
          {measured.state === 'ok' ? formatKpiValue(measured.value, kpi.unit) : '—'}
        </span>
        {target !== null && (
          <span className="text-xs text-gray-500">
            {kpi.direction === 'down' ? 'max' : 'of'} {formatKpiValue(target, kpi.unit)}
          </span>
        )}
      </div>

      {progress !== null && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ktip-sand-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barClass}`}
            style={{ width: `${Math.min(progress, 1) * 100}%` }}
          />
        </div>
      )}

      {failed && <p className="mt-2 text-xs text-ktip-sun-700">{measured.reason}</p>}
      {pending && (
        <p className="mt-2 text-xs text-ktip-sand-500">
          Not yet measured — phase {kpi.phase}
        </p>
      )}
    </div>
  )
}
