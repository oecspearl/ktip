import { useId } from 'react'
import { Area, AreaChart } from 'recharts'
import { useChartPalette } from './palette'

interface SparklineProps {
  values: ReadonlyArray<number | null>
  width?: number
  height?: number
  /** Defaults to the first series slot. */
  color?: string
  label: string
}

/**
 * A number's recent shape, beside the number.
 *
 * No axes, no grid, no tooltip: this is a glance, and the tile it sits in
 * carries the current value and the target. The full chart is one click away
 * on the Results tab. Fixed size on purpose — it lives in a tile, not a card.
 */
export function Sparkline({ values, width = 88, height = 32, color, label }: SparklineProps) {
  const palette = useChartPalette()
  const stroke = color ?? palette.series[0]
  const gradient = useId()
  const data = values.map((v, i) => ({ i, v }))
  const last = data.length - 1

  return (
    <div role="img" aria-label={label} className="shrink-0">
      <AreaChart width={width} height={height} data={data} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={1.5}
          fill={`url(#${gradient})`}
          fillOpacity={1}
          isAnimationActive={false}
          connectNulls={false}
          dot={(props: { cx?: number; cy?: number; index?: number }) =>
            props.index === last && typeof props.cx === 'number' && typeof props.cy === 'number' ? (
              <circle key="end" cx={props.cx} cy={props.cy} r={2.5} fill={stroke} />
            ) : (
              <g key={props.index} />
            )
          }
          activeDot={false}
        />
      </AreaChart>
    </div>
  )
}
