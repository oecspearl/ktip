import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { seriesColor, useChartPalette } from './palette'

export interface AreaSeries {
  /** The field on each row holding this series' value. */
  key: string
  label: string
}

export type TrendRow = Record<string, number | string | null | undefined>

interface AreaTrendProps {
  data: ReadonlyArray<TrendRow>
  /** The field holding the x label (a month, a week, a day). */
  xKey: string
  series: ReadonlyArray<AreaSeries>
  /** Stack the series (composition over time) instead of overlaying them. */
  stacked?: boolean
  /** A horizontal reference: the roadmap target or a threshold. */
  target?: number
  targetLabel?: string
  unit?: string
  format?: (value: number) => string
  height?: number
  /** Fixed width instead of filling the container — for tests and print. */
  width?: number
  /** Pin the top of the scale, so a target line is never off the chart. */
  yMax?: number
}

/**
 * Trend over time, the workhorse of the hub.
 *
 * Marks follow the data-viz spec: a 2px line, a gradient fill that fades to
 * the surface, no dot on every point, a labelled endpoint, a hairline grid
 * one shade off the card, and a crosshair tooltip — an HTML chart is
 * interactive by default. One y axis, always: two measures of different scale
 * get two charts, never a second axis.
 *
 * Colour follows the series index in fixed order (identity), so filtering a
 * series out never repaints the survivors.
 */
export function AreaTrend({
  data,
  xKey,
  series,
  stacked = false,
  target,
  targetLabel,
  unit = '',
  format,
  height = 220,
  width,
  yMax,
}: AreaTrendProps) {
  const palette = useChartPalette()
  const gradientBase = useId()
  const rows = data as TrendRow[]
  const show = (n: number) => (format ? format(n) : `${n.toLocaleString()}${unit}`)
  const lastIndex = rows.length - 1

  const chart = (
    <AreaChart
      data={rows}
      width={width}
      height={width ? height : undefined}
      margin={{ top: 18, right: 16, bottom: 4, left: 0 }}
    >
      <defs>
        {series.map((s, i) => {
          const color = seriesColor(palette, i)
          return (
            <linearGradient key={s.key} id={`${gradientBase}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={stacked ? 0.7 : 0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={stacked ? 0.5 : 0.02} />
            </linearGradient>
          )
        })}
      </defs>
      <CartesianGrid vertical={false} stroke={palette.grid} strokeWidth={1} />
      <XAxis
        dataKey={xKey}
        tickLine={false}
        axisLine={{ stroke: palette.axis }}
        tick={{ fill: palette.label, fontSize: 11 }}
        interval="preserveStartEnd"
        minTickGap={24}
      />
      <YAxis
        width={40}
        tickLine={false}
        axisLine={false}
        tick={{ fill: palette.label, fontSize: 11 }}
        tickFormatter={(v: number) => v.toLocaleString()}
        domain={[0, yMax ?? 'auto']}
        allowDecimals={false}
      />
      <Tooltip
        cursor={{ stroke: palette.label, strokeWidth: 1 }}
        content={(props) => <ChartTooltip {...props} format={format} unit={unit} />}
      />
      {target !== undefined && (
        <ReferenceLine
          y={target}
          stroke={palette.label}
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
          label={{
            value: targetLabel ?? `target ${show(target)}`,
            position: 'insideTopRight',
            fill: palette.label,
            fontSize: 11,
          }}
        />
      )}
      {series.map((s, i) => {
        const color = seriesColor(palette, i)
        return (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? 'stack' : undefined}
            stroke={stacked ? palette.surface : color}
            strokeWidth={2}
            fill={`url(#${gradientBase}-${i})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, stroke: palette.surface, strokeWidth: 2, fill: color }}
            isAnimationActive={false}
            connectNulls={false}
            label={
              stacked || series.length > 1
                ? false
                : (props: { x?: number | string; y?: number | string; index?: number; value?: unknown }) => {
                    const x = Number(props.x)
                    const y = Number(props.y)
                    const value = Number(props.value)
                    if (props.index !== lastIndex || ![x, y, value].every(Number.isFinite)) return null
                    return (
                      <text
                        x={x - 6}
                        y={y - 8}
                        textAnchor="end"
                        fill={palette.label}
                        fontSize={11}
                        fontWeight={700}
                      >
                        {show(value)}
                      </text>
                    )
                  }
            }
          />
        )
      })}
    </AreaChart>
  )

  if (width) return chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chart}
    </ResponsiveContainer>
  )
}
