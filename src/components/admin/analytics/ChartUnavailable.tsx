import { AlertTriangle, RotateCw } from 'lucide-react'

interface ChartUnavailableProps {
  reason: string
  onRetry?: () => void
}

/**
 * What a chart shows when the query behind it failed.
 *
 * Deliberately not the italic "No data available" line: that sentence is a
 * claim about the platform, and reading it after a permission change or a
 * renamed RPC is how a broken dashboard goes unnoticed for a month. Amber, an
 * icon, the reason, and a way to try again — none of which look like an answer.
 *
 * The truthful empty state keeps the italic line, which now only ever means
 * what it says.
 *
 * English, not lingui: src/pages/admin/ and its components are excluded in
 * scripts/i18n/config.mjs, and the reason string names a failing RPC to
 * whoever is going to fix it.
 */
export function ChartUnavailable({ reason, onRetry }: ChartUnavailableProps) {
  return (
    <div className="rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ktip-sun-800">Couldn't load this</p>
          <p className="mt-0.5 break-words text-xs text-ktip-sun-700">{reason}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ktip-sun-800 transition-colors hover:bg-ktip-sun-100"
          >
            <RotateCw size={12} />
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
