import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import type { MemberRank } from '../../types'

interface HeroStandingProps {
  rank: MemberRank
  points: number
  badgeCount: number
  /** Null when the viewer may not see it — the figure is then omitted. */
  connectionCount?: number | null
  /** Right-align the block — the centred-subject layout puts it on the far side. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * Where the member stands, written on the hero band itself.
 *
 * The same numbers StandingMeter shows in the content column, but set in
 * white on the aurora, under the name, so the band carries the whole card of
 * a person — who, what they hold, how far along — before the reader scrolls.
 * Renders nothing at zero badges for the reason StandingMeter does: a zeroed
 * scoreboard on a new member's page reads as a record of failure.
 */
export function HeroStanding({
  rank,
  points,
  badgeCount,
  connectionCount,
  align = 'start',
  className,
}: HeroStandingProps) {
  const { t } = useLingui()
  if (!badgeCount) return null

  const atTop = !rank.next_required
  const pct = atTop
    ? 100
    : Math.min(100, Math.round((rank.earned / (rank.next_required as number)) * 100))
  const end = align === 'end'

  return (
    <div className={cn('grid gap-3', end && 'lg:justify-items-end', className)}>
      <div className={cn('flex flex-wrap items-baseline gap-x-3', end && 'lg:justify-end')}>
        <span className="text-micro font-bold uppercase tracking-[0.18em] text-white/70">
          <Trans>Level {rank.level}</Trans>
        </span>
        <span className="font-display text-display-sm font-semibold leading-none text-white">
          {rank.name}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={rank.earned}
        aria-valuemin={0}
        aria-valuemax={rank.next_required ?? rank.earned}
        aria-label={t`Progress toward the next rank`}
        className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/20"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-green to-ktip-tropical-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-micro text-white/70">
        {rank.next_required ? (
          <Trans>
            {rank.earned} / {rank.next_required} toward {rank.next_name}
          </Trans>
        ) : (
          <Trans>Highest rank reached</Trans>
        )}
      </p>

      {/* Beside a centred subject this sits in a ~13rem column, where three
          48 px figures cannot fit on one line and the last one wraps onto a
          row of its own. There they are a size down. */}
      <dl className={cn('mt-3 flex flex-wrap gap-y-3', end ? 'gap-x-6' : 'gap-x-9', end && 'lg:justify-end')}>
        <Figure label={t`Points`} value={points} small={end} />
        <Figure label={t`Achievements`} value={badgeCount} small={end} />
        {connectionCount != null && (
          <Figure label={t`Connections`} value={connectionCount} small={end} />
        )}
      </dl>
    </div>
  )
}

function Figure({ label, value, small }: { label: string; value: number; small?: boolean }) {
  return (
    <div>
      <dd
        className={cn(
          'font-display font-semibold leading-none tabular-nums text-white',
          small ? 'text-title-lg' : 'text-display'
        )}
      >
        {value}
      </dd>
      <dt
        className={cn(
          'mt-2 font-bold uppercase text-white/65',
          small ? 'text-micro tracking-[0.12em]' : 'text-micro tracking-[0.18em]'
        )}
      >
        {label}
      </dt>
    </div>
  )
}
