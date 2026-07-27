import { For, Show, createMemo } from 'solid-js'
import type { MonthlyGrowth } from '../../../hooks/useAdminAnalytics'

interface GrowthChartProps {
  data: MonthlyGrowth[]
}

export function GrowthChart(props: GrowthChartProps) {
  const maxCount = createMemo(() => {
    const max = Math.max(...(props.data?.map((d) => d.count) || [0]))
    return max || 1
  })

  const formatMonth = (month: string) => {
    if (!month) return ''
    const [year, m] = month.split('-')
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${monthNames[parseInt(m, 10) - 1]} ${year?.slice(2)}`
  }

  return (
    <Show
      when={props.data?.length}
      fallback={<p class="text-sm text-ktip-sand-500 italic">No growth data available yet</p>}
    >
      <div class="flex items-end gap-1.5 h-40">
        <For each={props.data}>
          {(item) => {
            const pct = () => Math.max(4, Math.round((item.count / maxCount()) * 100))

            return (
              <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span class="text-xs text-ktip-sand-500 font-medium tabular-nums">{item.count}</span>
                <div
                  class="w-full bg-ktip-ocean-500 rounded-t-md transition-all duration-500 min-h-[4px]"
                  style={{ height: `${pct()}%` }}
                  title={`${formatMonth(item.month)}: ${item.count} users`}
                />
                <span class="text-[10px] text-ktip-sand-400 truncate w-full text-center">
                  {formatMonth(item.month)}
                </span>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}
