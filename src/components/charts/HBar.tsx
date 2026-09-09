import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { useChartPalette } from './palette'

export interface BarItem {
  label: string
  value: number
  /** A status or pipeline tone; defaults to the sequential hue. */
  color?: string
}

interface HBarProps {
  items: ReadonlyArray<BarItem>
  unit?: string
  format?: (value: number) => string
  /** Direct-label this many from the top; the rest read off the tooltip. */
  labelTop?: number
  rowHeight?: number
  /** Fixed width instead of filling the container — for tests and print. */
  width?: number
  /** Width reserved for the category labels. */
  labelWidth?: number
}

/**
 * Compare magnitudes: one hue, the bar carries the number.
 *
 * Horizontal so long category names (an OECS state, a project category) read
 * without rotation. A hairline track behind every bar shows where zero is —
 * a state with no members is still a row, drawn at zero, which is the honest
 * shape of "12 states, 9 represented". Only the leading entries and any zero
 * get a printed value; a number on every bar goes unread.
 */
export function HBar({
  items,
  unit = '',
  format,
  labelTop = 3,
  rowHeight = 26,
  width,
  labelWidth = 112,
}: HBarProps) {
  const palette = useChartPalette()
  const rows = items as BarItem[]
  const height = rows.length * rowHeight + 8
  const show = (n: number) => (format ? format(n) : `${n.toLocaleString()}${unit}`)

  const chart = (
    <BarChart
      layout="vertical"
      data={rows}
      width={width}
      height={width ? height : undefined}
      margin={{ top: 4, right: 48, bottom: 4, left: 0 }}
      barCategoryGap={rowHeight * 0.5}
    >
      <XAxis type="number" hide domain={[0, 'auto']} />
      <YAxis
        type="category"
        dataKey="label"
        width={labelWidth}
        tickLine={false}
        axisLine={false}
        tick={{ fill: palette.label, fontSize: 11 }}
        interval={0}
      />
      <Tooltip
        cursor={{ fill: palette.grid, fillOpacity: 0.5 }}
        content={(props) => <ChartTooltip {...props} format={format} unit={unit} />}
      />
      <Bar
        dataKey="value"
        name="Value"
        radius={[0, 4, 4, 0]}
        background={{ fill: palette.grid, radius: 4 }}
        isAnimationActive={false}
        minPointSize={2}
      >
        {rows.map((item, i) => (
          <Cell key={`${item.label}-${i}`} fill={item.color ?? palette.sequential[4]} />
        ))}
        <LabelList
          dataKey="value"
          position="right"
          content={(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown; index?: number }) => {
            const i = props.index ?? 0
            const value = Number(props.value)
            if (!(i < labelTop || value === 0)) return null
            const x = Number(props.x) + Number(props.width) + 6
            const y = Number(props.y) + Number(props.height) / 2
            return (
              <text
                x={x}
                y={y}
                dy={4}
                fill={palette.label}
                fontSize={11}
                fontWeight={i < labelTop ? 700 : 400}
              >
                {show(value)}
              </text>
            )
          }}
        />
      </Bar>
    </BarChart>
  )

  if (width) return chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chart}
    </ResponsiveContainer>
  )
}
