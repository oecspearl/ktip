import { useMemo } from 'react'
import { LayoutGrid } from 'lucide-react'
import { BarChart } from '../../admin/analytics/BarChart'
import { StatCard, StatTile } from './StatTile'
import { ActivityBars } from './ActivityBars'
import { PipelineDonut } from './PipelineDonut'
import { RankProgress } from './RankProgress'
import { useAuth } from '../../../contexts/AuthContext'
import { useAchievementContext } from '../../../contexts/AchievementContext'
import { useMemberStats } from '../../../hooks/useMemberStats'
import { visibleCharts, visibleKpis, type ChartKey, type KpiSource } from '../../../lib/member-kpis'
import { Trans, useLingui } from '@lingui/react/macro'

/** Top half: the counts block on the left, Standing matching its height. */
const TOP_ROW = 'grid grid-cols-1 gap-4 lg:grid-cols-2'

/**
 * The counts block — six columns of its own, lead tile at 4x4 and the rest at
 * 2x2 flowing around it: two down the right edge, three along the bottom.
 *
 * Dense auto-flow rather than a slot table keyed by tile count. The
 * arrangement above is what six tiles produce naturally, and any other count
 * still packs without holes — which matters, because how many tiles a member
 * gets depends on their role.
 */
const TILE_BLOCK =
  'grid grid-cols-2 gap-4 sm:grid-cols-6 sm:auto-rows-[minmax(3.5rem,auto)] [grid-auto-flow:dense]'

/**
 * Span for tile `i` of `n`.
 *
 * The lead tile is 4x4 and the rest are 2x2 flowing around it — two down the
 * right edge, then rows of three underneath. Six tiles close a rectangle
 * exactly; five and seven do not, and how many tiles a member gets is decided
 * by their role gates, not by this file. So a partial last row is widened to
 * fill instead of left ragged: a gap beside a card reads as a card that failed
 * to load rather than as a set that happened to be an awkward size.
 */
function tileSpan(i: number, n: number): string {
  if (i === 0) return n === 1 ? 'sm:col-span-6 sm:row-span-4' : 'sm:col-span-4 sm:row-span-4'
  // The right edge, beside the lead tile. Alone there, it covers both rows.
  if (i <= 2) return n === 2 ? 'sm:col-span-2 sm:row-span-4' : 'sm:col-span-2 sm:row-span-2'
  const trailing = (n - 3) % 3
  if (trailing === 0 || i < n - trailing) return 'sm:col-span-2 sm:row-span-2'
  return trailing === 1 ? 'sm:col-span-6 sm:row-span-2' : 'sm:col-span-3 sm:row-span-2'
}

/** Bottom half: the three charts on a 12-column track. */
const CHART_ROW = 'grid grid-cols-1 gap-4 md:grid-cols-12'

/**
 * Cap on the counts block. Beyond this the block grows taller than Standing
 * beside it, and a multi-role account showing every role at once is the only
 * way to get there.
 */
const MAX_TILES = 7

/**
 * Body placeholder for a chart card whose data is still in flight.
 *
 * The charts each have an honest empty state — "Nothing started in the last
 * six months" — and showing it against a not-yet-loaded array states something
 * false about the member for as long as the query takes.
 */
function ChartPending() {
  return <div className="h-28 animate-pulse-soft rounded-xl bg-ktip-sand-50" />
}

/**
 * The at-a-glance metric bento at the top of the dashboard Overview.
 *
 * Two data speeds. Standing and Connections read from context that is already
 * loaded app-wide, so they paint on the first frame; the counts arrive from
 * `useMemberStats` a beat later.
 *
 * That difference must not move anything. A tile with no readable value is
 * dropped — see the note on MemberStats about counts RLS will not let the
 * browser see — but "not readable" and "not arrived yet" look identical from
 * here, so while the query is in flight the slot is held with a skeleton
 * instead. Dropping them outright made the block start at one tile and grow to
 * six, and every card after the first appeared to arrive late.
 */
export function OverviewStats() {
  const { i18n, t } = useLingui()
  const auth = useAuth()
  const { achievements } = useAchievementContext()
  const { stats, loading: statsLoading } = useMemberStats()

  const tiles = useMemo(() => {
    const source: KpiSource = { stats, achievements: achievements?.stats }
    return visibleKpis(auth.profile?.roles, auth.profile?.active_role)
      .map((tile) => ({ tile, value: tile.value(source) }))
      .filter(({ value }) => value !== null || statsLoading)
      .slice(0, MAX_TILES)
  }, [auth.profile?.roles, auth.profile?.active_role, stats, statsLoading, achievements])

  const charts: ChartKey[] = useMemo(
    () => visibleCharts(auth.profile?.roles, auth.profile?.active_role),
    [auth.profile?.roles, auth.profile?.active_role]
  )

  const hasPipeline = charts.includes('pipeline')
  const hasResources = charts.includes('resources')

  const engagement = useMemo(
    () =>
      stats
        ? [
            { label: t`Views`, count: stats.views_received },
            { label: t`Likes`, count: stats.likes_received },
            { label: t`Followers`, count: stats.follows_received },
            { label: t`Comments`, count: stats.comments_received },
          ].filter((row) => row.count > 0)
        : [],
    [stats, t]
  )

  if (!auth.user) return null

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <LayoutGrid size={18} className="text-ktip-ocean-600" />
        <h2 className="font-display text-xl font-bold text-ktip-sand-900">
          <Trans>Overview</Trans>
        </h2>
      </div>

      <div className="space-y-4">
          <div className={TOP_ROW}>
            <div className={TILE_BLOCK}>
              {tiles.map(({ tile, value }, i) => {
                const span = tileSpan(i, tiles.length)
                // Slot held, number pending. Same span, so nothing reflows when
                // the count lands.
                if (value === null) {
                  return (
                    <div
                      key={tile.key}
                      className={`${span} animate-pulse-soft rounded-2xl border border-ktip-sand-200 bg-ktip-sand-50`}
                    />
                  )
                }
                return (
                  <StatTile
                    key={tile.key}
                    label={i18n._(tile.label)}
                    value={value}
                    icon={tile.icon}
                    to={tile.to}
                    hero={i === 0}
                    className={span}
                  />
                )
              })}
            </div>

            {charts.includes('rank') && (
              <StatCard title={t`Standing`}>
                <RankProgress
                  rank={achievements?.stats.rank}
                  points={achievements?.stats.points ?? 0}
                  badges={achievements?.stats.earned ?? 0}
                  streakDays={achievements?.stats.streak_days ?? 0}
                  activeDays={achievements?.stats.total_active_days ?? 0}
                />
              </StatCard>
            )}
          </div>

          {/* Activity and Engagement take whatever the two narrow cards do not
              — a student has no pipeline to draw and only four roles publish
              resources, and a hole in the row reads as something that failed to
              load rather than something that does not apply. Every combination
              has to total twelve or the row wraps and steps. */}
          <div className={CHART_ROW}>
            {charts.includes('activity') && (
              <StatCard
                title={t`Started in the last 6 months`}
                className={
                  hasPipeline
                    ? hasResources
                      ? 'md:col-span-4'
                      : 'md:col-span-5'
                    : hasResources
                      ? 'md:col-span-5'
                      : 'md:col-span-7'
                }
              >
                {statsLoading ? <ChartPending /> : <ActivityBars data={stats?.activity ?? []} />}
              </StatCard>
            )}

            {hasPipeline && (
              <StatCard title={t`Application pipeline`} className="md:col-span-3">
                {statsLoading ? <ChartPending /> : <PipelineDonut data={stats?.pipeline ?? []} />}
              </StatCard>
            )}

            {charts.includes('engagement') && (
              <StatCard
                title={t`Engagement received`}
                className={
                  hasPipeline
                    ? hasResources
                      ? 'md:col-span-3'
                      : 'md:col-span-4'
                    : 'md:col-span-5'
                }
              >
                {statsLoading ? (
                  <ChartPending />
                ) : engagement.length ? (
                  // Pantone 375, the other half of the OECS pair. What you put
                  // in is navy; what you got back is green
                  <BarChart data={engagement} colorClass="bg-ktip-tropical-500" />
                ) : (
                  <p className="text-sm italic text-ktip-sand-500">
                    <Trans>Publish a project and the engagement it earns shows up here.</Trans>
                  </p>
                )}
              </StatCard>
            )}

            {/* A count, not a plot. It sits in this row rather than the bento
                because as a tile it was the odd one out of every set that
                carries it — see the note in member-kpis. */}
            {hasResources && (
              <StatCard title={t`Resources published`} className="md:col-span-2">
                {statsLoading ? (
                  <ChartPending />
                ) : (
                  <div className="flex h-full items-end">
                    <span className="font-display text-5xl font-extrabold leading-none tabular-nums text-ktip-sand-900">
                      {stats?.resources == null ? '—' : stats.resources.toLocaleString()}
                    </span>
                  </div>
                )}
              </StatCard>
            )}
        </div>
      </div>
    </div>
  )
}
