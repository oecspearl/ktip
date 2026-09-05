import { ChartUnavailable } from './ChartUnavailable'

interface BarChartItem {
  label: string
  count: number
}

interface BarChartProps {
  data: BarChartItem[]
  colorClass?: string
  labelMap?: Record<string, string>
  /**
   * Set when the query failed. An empty `data` then means "nothing matched",
   * which is the only thing the italic line below should ever say — see
   * src/lib/measured.ts for why the two were worth separating.
   */
  unavailable?: string
  onRetry?: () => void
}

export function BarChart({ data, colorClass, labelMap, unavailable, onRetry }: BarChartProps) {
  const maxCount = Math.max(...(data?.map((d) => d.count) || [0])) || 1

  if (unavailable) {
    return <ChartUnavailable reason={unavailable} onRetry={onRetry} />
  }

  if (!data?.length) {
    return <p className="text-sm text-ktip-sand-500 italic">No data available</p>
  }

  return (
    <div className="space-y-2.5">
      {data.map((item) => {
        const pct = Math.round((item.count / maxCount) * 100)
        const displayLabel = labelMap?.[item.label] || item.label.replace(/_/g, ' ')

        return (
          <div className="group" key={item.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ktip-sand-700 capitalize truncate mr-2" title={displayLabel}>
                {displayLabel}
              </span>
              <span className="text-ktip-sand-500 font-medium tabular-nums shrink-0">{item.count}</span>
            </div>
            <div className="w-full bg-ktip-sand-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${colorClass || 'bg-ktip-ocean-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
