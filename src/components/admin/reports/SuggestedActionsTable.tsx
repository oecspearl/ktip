import { PLATFORM_KPIS } from '../../../lib/kpi-catalog'
import type { SuggestedAction } from '../../../lib/kpi-report-schema'

const PRIORITY_CLASS: Record<SuggestedAction['priority'], string> = {
  high: 'bg-chart-bad/10 text-chart-bad',
  medium: 'bg-chart-warn/10 text-chart-warn',
  low: 'bg-ktip-sand-100 text-ktip-sand-600',
}

const ORDER: Record<SuggestedAction['priority'], number> = { high: 0, medium: 1, low: 2 }

/**
 * The report's suggested actions: what, for which KPI, whose job, how urgent.
 *
 * Every row names a kpi_key that exists in the catalog — the provider drops
 * any that do not — so the KPI label is looked up rather than trusted from
 * the model's text. Sorted by priority, high first.
 */
export function SuggestedActionsTable({ actions }: { actions: ReadonlyArray<SuggestedAction> }) {
  if (!actions.length) {
    return <p className="text-sm italic text-ktip-sand-500">No actions were suggested for this period.</p>
  }
  const sorted = [...actions].sort((a, b) => ORDER[a.priority] - ORDER[b.priority])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ktip-sand-200 text-left text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            <th className="py-2 pr-3">Action</th>
            <th className="py-2 pr-3">KPI</th>
            <th className="py-2 pr-3">Owner</th>
            <th className="py-2">Priority</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ktip-sand-100">
          {sorted.map((action, i) => {
            const kpi = PLATFORM_KPIS.find((k) => k.key === action.kpi_key)
            return (
              <tr key={`${action.kpi_key}-${i}`} className="align-top">
                <td className="py-2.5 pr-3 text-ktip-sand-900">
                  <p>{action.action}</p>
                  <p className="mt-1 text-xs text-ktip-sand-500">{action.rationale}</p>
                </td>
                <td className="py-2.5 pr-3 text-xs text-ktip-sand-700">
                  {kpi ? kpi.label : action.kpi_key}
                  <span className="block font-mono text-[0.7rem] text-ktip-sand-400">{action.kpi_key}</span>
                </td>
                <td className="py-2.5 pr-3 text-xs text-ktip-sand-700">{action.owner_role}</td>
                <td className="py-2.5">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold capitalize ${PRIORITY_CLASS[action.priority]}`}>
                    {action.priority}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
