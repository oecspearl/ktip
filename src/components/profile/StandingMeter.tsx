import { Flame } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import type { MemberRank } from '../../types'

interface StandingMeterProps {
  rank: MemberRank
  points: number
  badgeCount: number
  /** Null when the viewer is not allowed to see it — the row is then omitted. */
  connectionCount?: number | null
  /** Null for everyone but the owner. A streak on someone else's profile reads
   *  as surveillance, so the server withholds it and this respects that. */
  streakDays?: number | null
  className?: string
}

/**
 * Where a member stands, as a meter rather than a sentence.
 *
 * This replaces two things that said the same thing badly. The page had a
 * whole card whose left half read "LEVEL 3 / Collaborator" and whose right
 * half was a `<dl>` of bare figures, with nothing connecting them; the drawer
 * had the string "Collaborator · 275 pts" in a fact row. Neither said how far
 * along the member was, even though `member_rank()` has always returned
 * `earned`, `next_name` and `next_required` — everything a progress bar needs,
 * with no new query.
 *
 * Ranks climb on badge COUNT, not points (migration 066), which is why the
 * bar is fed by `earned` and the points figure sits beside it rather than in
 * it.
 *
 * Renders nothing at zero badges. That rule is inherited deliberately: a
 * zeroed-out scoreboard on a brand-new member reads as a record of failure.
 */
export function StandingMeter({
  rank,
  points,
  badgeCount,
  connectionCount,
  streakDays,
  className,
}: StandingMeterProps) {
  const { t } = useLingui()
  if (!badgeCount) return null

  const atTop = !rank.next_required
  const pct = atTop
    ? 100
    : Math.min(100, Math.round((rank.earned / (rank.next_required as number)) * 100))

  return (
    <div
      className={cn(
        // L3 of the elevation ladder: recessed into the plate above it, so the
        // plate reads as one object with a slot cut into it rather than as two
        // stacked cards.
        'flex flex-wrap items-center gap-x-gutter gap-y-4 rounded-surface bg-ktip-sand-100 px-5 py-3.5 shadow-neu-sm-inset',
        className
      )}
    >
      <div className="min-w-[11rem] flex-1">
        <p className="text-micro font-semibold uppercase tracking-[0.14em] text-ktip-sand-500">
          <Trans>Level {rank.level}</Trans>
        </p>
        <p className="font-display text-title-sm font-bold leading-tight text-ktip-sand-900">
          {rank.name}
        </p>

        <div
          role="progressbar"
          aria-valuenow={rank.earned}
          aria-valuemin={0}
          aria-valuemax={rank.next_required ?? rank.earned}
          aria-label={t`Progress toward the next rank`}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ktip-sand-300"
        >
          <div
            className="h-full rounded-full bg-ktip-tropical-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="mt-1.5 text-micro text-ktip-sand-500">
          {rank.next_required ? (
            <Trans>
              {rank.earned} / {rank.next_required} toward {rank.next_name}
            </Trans>
          ) : (
            <Trans>Highest rank reached</Trans>
          )}
        </p>
      </div>

      <dl className="flex">
        <Figure label={t`Points`} value={points} />
        <Figure label={t`Achievements`} value={badgeCount} />
        {connectionCount != null && <Figure label={t`Connections`} value={connectionCount} />}
        {streakDays != null && (
          <Figure
            label={t`Streak`}
            value={streakDays}
            icon={<Flame size={11} aria-hidden="true" />}
          />
        )}
      </dl>
    </div>
  )
}

/** One figure in the meter's right-hand group, divided by a hairline. */
function Figure({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon?: React.ReactNode
}) {
  return (
    <div className="border-l border-ktip-sand-300 px-4 text-center first:border-l-0 first:pl-0 last:pr-0">
      <dt className="flex items-center justify-center gap-1 text-micro font-semibold uppercase tracking-[0.12em] text-ktip-sand-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-title font-bold leading-none tabular-nums text-ktip-ocean-700">
        {value}
      </dd>
    </div>
  )
}
