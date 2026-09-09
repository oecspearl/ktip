import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'
import { kpiProgress, kpiStatus, type KpiStatus } from '../../lib/kpi-catalog'
import { useChartPalette } from './palette'

interface RadialTargetProps {
  value: number
  target: number
  /** 'down' KPIs (ticket hours, error rate) are met by being below target. */
  direction?: 'up' | 'down'
  size?: number
  /** Accessible name; the visible number is the percentage of target. */
  label: string
}

export const STATUS_WORDS: Record<KpiStatus, string> = {
  good: 'on track',
  warn: 'at risk',
  bad: 'off track',
  none: 'not measured',
}

/**
 * One value against its target, as a ring.
 *
 * This is the only radial form on the hub, and only for this job: a single
 * ratio against a limit is the one case where an arc reads faster than a bar.
 * Comparisons between things stay bars. The ring's colour is a STATUS — it
 * comes from kpiStatus(), the same thresholds the tiles use — never a series
 * hue, and the word is printed with it so colour is not the only carrier.
 */
export function RadialTarget({ value, target, direction = 'up', size = 96, label }: RadialTargetProps) {
  const palette = useChartPalette()
  const progress = kpiProgress(value, target, direction)
  const status = kpiStatus(progress)
  const pct = progress === null ? 0 : Math.round(progress * 100)
  const data = [{ name: label, v: Math.min(pct, 100) }]

  return (
    <div
      role="img"
      aria-label={`${label}: ${pct}% of target, ${STATUS_WORDS[status]}`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <RadialBarChart
        width={size}
        height={size}
        data={data}
        innerRadius="74%"
        outerRadius="100%"
        startAngle={90}
        endAngle={-270}
        barSize={size * 0.11}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="v"
          cornerRadius={size}
          background={{ fill: palette.grid }}
          fill={palette.status[status]}
          isAnimationActive={false}
        />
      </RadialBarChart>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="font-display text-lg font-bold leading-none text-ktip-sand-900 tabular-nums">
          {pct}%
        </span>
      </div>
    </div>
  )
}
