import { useMemo } from 'react'
import { LayoutGrid } from 'lucide-react'
import { BarChart } from '../../admin/analytics/BarChart'
import { StatCard, StatTile } from './StatTile'
import { ActivityBars } from './ActivityBars'
import { PipelineDonut } from './PipelineDonut'
import { RankProgress } from './RankProgress'
import { useAuth } from '../../../contexts/AuthContext'
import { useAchievementContext } from '../../../contexts/AchievementContext'
import { useConnectionCount } from '../../../hooks/useConnections'
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

const HERO_TILE = 'sm:col-span-4 sm:row-span-4'
const SMALL_TILE = 'sm:col-span-2 sm:row-span-2'

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
  const { count: connections } = useConnectionCount(auth.user?.id)
  const { stats, loading: statsLoading } = useMemberStats()

  const tiles = useMemo(() => {
    const source: KpiSource = { stats, achievements: achievements?.stats, connections }
    return visibleKpis(auth.profile?.roles, auth.profile?.active_role)
      .map((tile) => ({ tile, value: tile.value(source) }))
      .filter(({ value }) => value !== null || statsLoading)
      .slice(0, MAX_TILES)
  }, [
    auth.profile?.roles,
    auth.profile?.active_role,
    stats,
    statsLoading,
    achievements,
    connections,
  ])

  const charts: ChartKey[] = useMemo(
    () => visibleCharts(auth.profile?.roles, auth.profile?.active_role),
    [auth.profile?.roles, auth.profile?.active_role]
  )

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
                const span = i === 0 ? HERO_TILE : SMALL_TILE
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

          {/* Activity takes whatever the pipeline does not — a student has no
              pipeline to draw, and a hole in the row reads as something that
              failed to load rather than something that does not apply. */}
          <div className={CHART_ROW}>
            {charts.includes('activity') && (
              <StatCard
                title={t`Started in the last 6 months`}
                className={charts.includes('pipeline') ? 'md:col-span-5' : 'md:col-span-7'}
              >
                {statsLoading ? <ChartPending /> : <ActivityBars data={stats?.activity ?? []} />}
              </StatCard>
            )}

            {charts.includes('pipeline') && (
              <StatCard title={t`Application pipeline`} className="md:col-span-3">
                {statsLoading ? <ChartPending /> : <PipelineDonut data={stats?.pipeline ?? []} />}
              </StatCard>
            )}

            {charts.includes('engagement') && (
              <StatCard
                title={t`Engagement received`}
                className={charts.includes('pipeline') ? 'md:col-span-4' : 'md:col-span-5'}
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
        </div>
      </div>
    </div>
  )
}
