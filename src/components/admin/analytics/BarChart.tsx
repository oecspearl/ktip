import { For, Show } from 'solid-js'

interface BarChartItem {
  label: string
  count: number
}

interface BarChartProps {
  data: BarChartItem[]
  colorClass?: string
  labelMap?: Record<string, string>
}

export function BarChart(props: BarChartProps) {
  const maxCount = () => {
    const max = Math.max(...(props.data?.map((d) => d.count) || [0]))
    return max || 1
  }

  return (
    <Show
      when={props.data?.length}
      fallback={<p class="text-sm text-ktip-sand-500 italic">No data available</p>}
    >
      <div class="space-y-2.5">
        <For each={props.data}>
          {(item) => {
            const pct = () => Math.round((item.count / maxCount()) * 100)
            const displayLabel = () =>
              props.labelMap?.[item.label] || item.label.replace(/_/g, ' ')

            return (
              <div class="group">
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="text-ktip-sand-700 capitalize truncate mr-2" title={displayLabel()}>
                    {displayLabel()}
                  </span>
                  <span class="text-ktip-sand-500 font-medium tabular-nums shrink-0">{item.count}</span>
                </div>
                <div class="w-full bg-ktip-sand-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    class={`h-full rounded-full transition-all duration-500 ${props.colorClass || 'bg-ktip-ocean-500'}`}
                    style={{ width: `${pct()}%` }}
                  />
                </div>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}
