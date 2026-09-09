import type { LucideIcon } from 'lucide-react'
import { StatTile, StatCard } from '../dashboard/stats/StatTile'
import { formatMoneyTotals, type MoneyTotal } from '../../lib/grant-metrics'
import { cn } from '../../lib/utils'

/**
 * The stat strip above a funding list — counts on top, money underneath.
 *
 * Built on the Overview bento's own tiles rather than a second look for the
 * same job: a member who has seen their dashboard should recognise this block
 * immediately, and there is no argument for two kinds of stat card.
 *
 * Every label arrives already translated. That is StatTile's own contract
 * (`label: string`), and it keeps the `t` macro at the page where the sentence
 * is actually written.
 */

export interface FundingStatTile {
  label: string
  /** null renders an em dash — the tile is present, the number is not readable */
  value: number | null
  icon: LucideIcon
}

export interface MoneyLine {
  label: string
  totals: MoneyTotal[]
}

/**
 * Money totals, one row per line and one figure per currency inside it.
 *
 * A StatCard rather than a StatTile because a total is not a number: it is
 * "US$1.2M · XCD400,000", which is what happens when you refuse to invent an
 * exchange rate. See sumByCurrency in lib/grant-metrics.
 */
export function MoneyCard({
  title,
  lines,
  className,
}: {
  title: string
  lines: MoneyLine[]
  className?: string
}) {
  return (
    <StatCard title={title} className={className}>
      <dl className="space-y-3">
        {lines.map((line) => (
          <div key={line.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
              {line.label}
            </dt>
            <dd className="font-display text-xl font-extrabold leading-none tabular-nums text-ktip-sand-900">
              {formatMoneyTotals(line.totals) ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </StatCard>
  )
}

export function FundingStats({
  tiles,
  money,
  className,
}: {
  tiles: FundingStatTile[]
  money?: { title: string; lines: MoneyLine[] }
  className?: string
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} />
        ))}
      </div>

      {money && <MoneyCard title={money.title} lines={money.lines} />}
    </div>
  )
}
