import { Link } from 'react-router'
import { Award, CalendarRange, ChevronRight, Flame, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MemberRank } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface RankProgressProps {
  rank: MemberRank | undefined
  points: number
  badges: number
  streakDays: number
  activeDays: number
}

const R = 44
const CIRCUMFERENCE = 2 * Math.PI * R

/** One figure in the strip along the bottom of the card. */
function Figure({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-ktip-sand-500">
        <Icon size={14} className="shrink-0" />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 font-display text-2xl font-extrabold leading-none tabular-nums text-ktip-sand-900">
        {value.toLocaleString()}
      </div>
    </div>
  )
}

/**
 * Standing — the hero tile of the Overview bento.
 *
 * Everything about where the member sits lives here rather than scattered
 * across four separate one-number tiles: the rank arc, the climb to the next
 * one, and the four figures that feed it. They were always one story, and
 * splitting them meant the arc had no context and the counts had no meaning.
 *
 * `next_required` is null at the top rank — the arc fills and the caption says
 * so, rather than drawing a bar that can never move again.
 */
export function RankProgress({ rank, points, badges, streakDays, activeDays }: RankProgressProps) {
  const { t } = useLingui()

  if (!rank) {
    return (
      <p className="text-sm italic text-ktip-sand-500">
        <Trans>Your standing appears once you have earned a badge.</Trans>
      </p>
    )
  }

  const atTop = !rank.next_required
  const pct = atTop
    ? 100
    : Math.min(100, Math.round((rank.earned / (rank.next_required as number)) * 100))

  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img">
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="9"
              className="text-ktip-sand-100"
              stroke="currentColor"
            />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              className="text-ktip-ocean-500 transition-all duration-500"
              stroke="currentColor"
            >
              <title>{`${pct}%`}</title>
            </circle>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-extrabold leading-none tabular-nums text-ktip-sand-900">
              {rank.level}
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-wider text-ktip-sand-500">
              <Trans>Level</Trans>
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-2xl font-bold text-ktip-sand-900">
            {rank.name}
          </div>

          {atTop ? (
            <p className="mt-1 text-sm text-ktip-sand-500">
              <Trans>Highest rank reached</Trans>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ktip-sand-600">
                <Trans>
                  {rank.earned} / {rank.next_required} toward {rank.next_name}
                </Trans>
              </p>
              <div
                role="progressbar"
                aria-valuenow={rank.earned}
                aria-valuemin={0}
                aria-valuemax={rank.next_required ?? rank.earned}
                aria-label={t`Progress toward the next rank`}
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ktip-sand-100"
              >
                <div
                  className="h-full rounded-full bg-ktip-ocean-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          )}

          <Link
            to="/dashboard/achievements"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
          >
            <Trans>See all badges</Trans>
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* The four figures the arc is made of, kept with it rather than spread
          across the tile row where none of them explained the others */}
      <div className="grid grid-cols-2 gap-4 border-t border-ktip-sand-200 pt-4 sm:grid-cols-4">
        <Figure icon={Trophy} value={points} label={t`Points`} />
        <Figure icon={Award} value={badges} label={t`Badges`} />
        <Figure icon={Flame} value={streakDays} label={t`Day streak`} />
        <Figure icon={CalendarRange} value={activeDays} label={t`Active days`} />
      </div>
    </div>
  )
}
