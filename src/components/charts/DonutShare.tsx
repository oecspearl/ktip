import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { seriesColor, useChartPalette } from './palette'

export interface ShareItem {
  label: string
  value: number
  /** A status or pipeline tone; defaults to the series slot for its index. */
  color?: string
}

interface DonutShareProps {
  items: ReadonlyArray<ShareItem>
  /** The hero number in the middle, usually the total. */
  center?: string
  centerLabel?: string
  size?: number
  /** Segments past this fold into "Other". Six is the reading limit. */
  maxSegments?: number
}

/** Folds anything past `max` into one Other row. Exported for the table view. */
export function foldShares(items: ReadonlyArray<ShareItem>, max = 6): ShareItem[] {
  if (items.length <= max) return [...items]
  const kept = items.slice(0, max - 1)
  const rest = items.slice(max - 1).reduce((sum, item) => sum + item.value, 0)
  return [...kept, { label: 'Other', value: rest }]
}

/**
 * Part-to-whole at a glance.
 *
 * A donut answers "roughly how is this split?" and nothing finer — close
 * values belong in a bar. So: at most six segments, a 2px surface gap between
 * them, and the total in the middle, which is the number most readers came
 * for. The legend with values lives in the parent (ChartFrame), never inside
 * the ring.
 */
export function DonutShare({ items, center, centerLabel, size = 140, maxSegments = 6 }: DonutShareProps) {
  const palette = useChartPalette()
  const data = foldShares(items, maxSegments)
  const radius = size / 2

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={radius * 0.64}
          outerRadius={radius - 2}
          startAngle={90}
          endAngle={-270}
          stroke={palette.surface}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((item, i) => (
            <Cell
              key={item.label}
              fill={item.label === 'Other' ? palette.other : (item.color ?? seriesColor(palette, i))}
            />
          ))}
        </Pie>
        <Tooltip content={(props) => <ChartTooltip {...props} />} />
      </PieChart>
      {center !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-bold leading-none text-ktip-sand-900 tabular-nums">
            {center}
          </span>
          {centerLabel && <span className="mt-0.5 text-xs text-ktip-sand-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}
