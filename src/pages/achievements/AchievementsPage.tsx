import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Flame, Pin, Search, Trophy, Users, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { TagFilterChips } from '../../components/ui/TagFilterChips'
import { TrophyCard, SecretTrophyCard } from '../../components/achievements/TrophyCard'
import { FireworksOverlay } from '../../components/achievements/FireworksOverlay'
import { useAchievementContext } from '../../contexts/AchievementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useAllBadges, useUserBadges } from '../../hooks/useBadges'
import { useShowcaseMutation, useTrackFlag } from '../../hooks/useAchievements'
import { useProfileStats } from '../../hooks/useProfileStats'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToast } from '../../contexts/ToastContext'
import {
  RARITY_LABEL,
  RARITY_ORDER,
  rarityOf,
} from '../../lib/achievement-style'
import { cn } from '../../lib/utils'
import type { BadgeDefinition } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { resolveCopy } from '../../i18n/copy'

const CATEGORY_LABELS: Record<string, MessageDescriptor> = {
  projects: msg`Projects`,
  grants: msg`Grants`,
  events: msg`Events`,
  community: msg`Community`,
  network: msg`Network`,
  collaboration: msg`Collaboration`,
  knowledge: msg`Knowledge`,
  profile: msg`Profile`,
  dedication: msg`Dedication`,
  meta: msg`Milestones`,
  hidden: msg`Secrets`,
}

const MAX_SHOWCASE = 5

type StatusFilter = 'all' | 'progress' | 'earned' | 'locked'

const STATUS_TABS: { key: StatusFilter; label: MessageDescriptor }[] = [
  { key: 'all', label: msg`All` },
  { key: 'progress', label: msg`In progress` },
  { key: 'earned', label: msg`Earned` },
  { key: 'locked', label: msg`Locked` },
]

/**
 * The gallery's only live home is the dashboard tab (AchievementsTab renders it
 * with `embedded`; /achievements redirects there). `embedded` drops the
 * standalone container and h1 because the tab panel already supplies the width,
 * padding and page heading — without it a page would nest inside a page.
 */
export default function AchievementsPage({ embedded = false }: { embedded?: boolean }) {
    const { t, i18n } = useLingui()
  usePageTitle(t`Achievements`)
  const auth = useAuth()
  const toast = useToast()
  const { achievements, loading, assetMap } = useAchievementContext()
  const { badges: allBadges } = useAllBadges()
  const { badges: myBadges } = useUserBadges(auth.user?.id)
  const { stats: myStats } = useProfileStats(auth.user?.id)
  const showcaseMutation = useShowcaseMutation()
  const trackFlag = useTrackFlag()

  const [category, setCategory] = useState<string>('all')
  const [rarities, setRarities] = useState<string[]>([])
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [pinning, setPinning] = useState(false)
  const [pinned, setPinned] = useState<string[]>([])
  const [detail, setDetail] = useState<BadgeDefinition | null>(null)

  // Powers the 'curious' hidden achievement. Once per mount, not per render.
  useEffect(() => {
    trackFlag('achievements_views')
  }, [trackFlag])

  const earnedById = useMemo(() => {
    const map = new Map<string, string>()
    for (const ub of myBadges || []) map.set(ub.badge_id, ub.awarded_at)
    return map
  }, [myBadges])

  const progressBySlug = useMemo(() => {
    const map = new Map<string, { current: number; target: number }>()
    for (const p of achievements?.progress || []) {
      map.set(p.slug, { current: p.current, target: p.target })
    }
    return map
  }, [achievements])

  /**
   * One lookup for both key spaces. `earnedById` is keyed on badge id and
   * `progressBySlug` on slug, which is a standing trap when reading a tile —
   * everything below goes through this instead of picking the wrong map.
   * Falls back to the badge's own `check_value` so a countable achievement with
   * no server progress row still shows 0 / target rather than nothing.
   */
  const readBadge = useMemo(() => {
    return (badge: BadgeDefinition) => {
      const earnedAt = earnedById.get(badge.id) ?? null
      const serverProgress = progressBySlug.get(badge.slug) ?? null
      const progress =
        serverProgress ??
        (badge.check_value && badge.check_value > 0
          ? { current: 0, target: badge.check_value }
          : null)
      const pct =
        !earnedAt && progress && progress.target > 0
          ? Math.min(1, progress.current / progress.target)
          : 0
      return { earnedAt, progress, pct, started: !earnedAt && pct > 0 }
    }
  }, [earnedById, progressBySlug])

  // Hidden badges are dropped from the grid until earned; only their count is
  // shown. They arrive from the API because the table is public — masking is a
  // presentation choice, not a security boundary.
  const { visible, unearnedSecrets } = useMemo(() => {
    const all = allBadges || []
    const secrets = all.filter((b) => b.is_hidden && !earnedById.has(b.id))
    const shown = all.filter((b) => !b.is_hidden || earnedById.has(b.id))
    return { visible: shown, unearnedSecrets: secrets.length }
  }, [allBadges, earnedById])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const b of visible) set.add(b.category || 'community')
    return Array.from(set).sort()
  }, [visible])

  const statusCounts = useMemo(() => {
    let earned = 0
    let progress = 0
    for (const b of visible) {
      const read = readBadge(b)
      if (read.earnedAt) earned++
      else if (read.started) progress++
    }
    return { all: visible.length, earned, progress, locked: visible.length - earned }
  }, [visible, readBadge])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = visible.filter((b) => {
      if (category !== 'all' && (b.category || 'community') !== category) return false
      if (rarities.length && !rarities.includes(RARITY_LABEL[rarityOf(b.rarity)])) return false
      if (needle && !`${b.name} ${b.description}`.toLowerCase().includes(needle)) return false

      const read = readBadge(b)
      if (status === 'earned' && !read.earnedAt) return false
      if (status === 'locked' && read.earnedAt) return false
      if (status === 'progress' && !read.started) return false
      return true
    })

    // Closest to unlocking first, then everything else earned-most-recent
    // first. A flat alphabetical list of 75 buried the three tiles that
    // actually tell you what to do next.
    return rows.sort((a, b) => {
      const ra = readBadge(a)
      const rb = readBadge(b)
      const rank = (r: typeof ra) => (r.started ? 0 : r.earnedAt ? 1 : 2)
      const diff = rank(ra) - rank(rb)
      if (diff !== 0) return diff
      if (rank(ra) === 0) return rb.pct - ra.pct
      if (rank(ra) === 1) return (rb.earnedAt || '').localeCompare(ra.earnedAt || '')
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
    })
  }, [visible, category, rarities, status, search, readBadge])

  const stats = achievements?.stats
  const rank = stats?.rank
  const level = rank?.level ?? 1
  const earnedCount = stats?.earned ?? 0
  const totalAvailable = stats?.total_available ?? 0
  const pinnedCount = pinned.length

  const rankPct =
    rank && rank.next_required
      ? Math.min(100, Math.round((rank.earned / rank.next_required) * 100))
      : 100

  // Seed from what is actually pinned, not from the first five earned —
  // otherwise opening the editor and saving silently replaces the member's
  // chosen showcase with their most recent badges.
  const startPinning = () => {
    setPinned((myStats?.showcase || []).map((pin) => pin.badge.id))
    setPinning(true)
  }

  const togglePin = (badgeId: string) => {
    setPinned((prev) => {
      if (prev.includes(badgeId)) return prev.filter((id) => id !== badgeId)
      if (prev.length >= MAX_SHOWCASE) {
        toast.error(t`You can pin up to ${MAX_SHOWCASE} trophies`)
        return prev
      }
      return [...prev, badgeId]
    })
  }

  const savePins = async () => {
    try {
      await showcaseMutation.mutateAsync(pinned)
      toast.success(t`Showcase updated`)
      setPinning(false)
    } catch {
      toast.error(t`Could not update your showcase`)
    }
  }

  const shell = embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 py-8 space-y-6'

  if (loading && !achievements) {
    return (
      <div className={shell}>
        <div className="h-32 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  const detailRead = detail ? readBadge(detail) : null

  return (
    <div className={shell}>
      {/* ---------- Rank header ----------
          Rank and the level bar only. The Points / Streak / Active-days figures
          moved to their own strip below: six numbers, a bar and three buttons
          in one card was the densest thing on the page. */}
      <section className="relative overflow-hidden rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6">
        {/* Only fires when a rank has actually been reached, so the page does
            not celebrate an empty account on first visit. */}
        {(rank?.level ?? 1) > 1 && <FireworksOverlay runKey={rank?.level} durationMs={1400} />}

        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
              <Trans>Level {level}</Trans>
            </p>
            {/* h2 inside the dashboard, whose PageHero already owns the h1 */}
            {embedded ? (
              <h2 className="font-display text-3xl font-bold text-ktip-sand-900">
                {rank?.name ?? t`Newcomer`}
              </h2>
            ) : (
              <h1 className="font-display text-3xl font-bold text-ktip-sand-900">
                {rank?.name ?? t`Newcomer`}
              </h1>
            )}
            <p className="mt-1 text-sm text-ktip-sand-600">
              <Trans>{earnedCount} of {totalAvailable} achievements</Trans>
              {statusCounts.progress > 0 && <Trans> · {statusCounts.progress} in progress</Trans>}
              {unearnedSecrets > 0 && <Trans> · {unearnedSecrets} still secret</Trans>}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={pinning ? savePins : startPinning}>
              <Pin size={14} aria-hidden="true" />
              {pinning ? t`Save showcase (${pinned.length}/${MAX_SHOWCASE})` : t`Edit showcase`}
            </Button>
            {pinning && (
              <Button size="sm" variant="ghost" onClick={() => setPinning(false)}>
                <Trans>Cancel</Trans>
              </Button>
            )}
            <Link to="/leaderboard">
              <Button size="sm" variant="ghost">
                <Trophy size={14} aria-hidden="true" />
                <Trans>Leaderboard</Trans>
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative z-10 mt-5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-ktip-sand-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={rank?.next_required ?? rank?.earned ?? 0}
            aria-valuenow={rank?.earned ?? 0}
            aria-label={t`Progress to next level`}
          >
            <div
              className="h-full rounded-full bg-ktip-tropical-500 transition-[width]"
              style={{ width: `${rankPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ktip-sand-500">
            {rank?.next_required ? (
              <Trans>
                {rank.earned} / {rank.next_required} toward {rank.next_name}
              </Trans>
            ) : (
              t`Highest rank reached`
            )}
          </p>
        </div>
      </section>

      {/* ---------- Stat strip ---------- */}
      <dl className="grid grid-cols-3 gap-3">
        <StatTile label={t`Points`} value={stats?.points ?? 0} />
        <StatTile label={t`Streak`} value={stats?.streak_days ?? 0} icon={<Flame size={12} />} />
        <StatTile label={t`Active days`} value={stats?.total_active_days ?? 0} />
      </dl>

      {/* ---------- Showcase mode banner ----------
          Turning on pinning used to change nothing but the button label, so a
          click on a locked tile did nothing and read as broken. */}
      {pinning && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 px-4 py-3">
          <p className="text-sm text-ktip-ocean-800">
            <strong className="font-semibold"><Trans>Choosing your showcase.</Trans></strong>{' '}
            <Trans>
              Click up to {MAX_SHOWCASE} earned trophies — {pinnedCount} picked so far. Locked
              trophies cannot be pinned.
            </Trans>
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={savePins} loading={showcaseMutation.isPending}>
              <Trans>Save showcase</Trans>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPinning(false)}>
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Collections ---------- */}
      {!!achievements?.collections?.length && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-ktip-sand-900"><Trans>Collections</Trans></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {achievements.collections.map((collection) => {
              const pct =
                collection.total > 0
                  ? Math.round((collection.earned / collection.total) * 100)
                  : 0
              const complete = collection.total > 0 && collection.earned >= collection.total
              return (
                <div
                  key={collection.slug}
                  className={cn(
                    'rounded-2xl border p-4',
                    complete
                      ? 'border-ktip-tropical-300 bg-ktip-tropical-50/60'
                      : 'border-ktip-sand-200 bg-ktip-cream'
                  )}
                >
                  <p className="font-medium text-ktip-sand-900">{collection.name}</p>
                  <p className="mt-0.5 text-xs text-ktip-sand-600">{collection.description}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ktip-sand-200">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        complete ? 'bg-ktip-tropical-600' : 'bg-ktip-ocean-500'
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-ktip-sand-500">
                    {collection.earned} / {collection.total}
                    {complete && <Trans> · complete</Trans>}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Filters ----------
          One bar. There used to be two rows of identical-looking pills, the top
          one single-select and the bottom one multi-select, above a wrapping
          12-tab category row. Status is the question people actually ask, so it
          leads; category is a select because there are eleven of them. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-full border border-ktip-sand-200 p-0.5"
            role="tablist"
            aria-label={t`Achievement status`}
          >
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={status === tab.key}
                onClick={() => setStatus(tab.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  status === tab.key
                    ? 'bg-ktip-ocean-600 text-white'
                    : 'text-ktip-sand-600 hover:text-ktip-ocean-700'
                )}
              >
                {i18n._(tab.label)}
                <span className="ml-1.5 tabular-nums text-xs opacity-75">
                  {statusCounts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          <label className="sr-only" htmlFor="achievement-category">
            <Trans>Category</Trans>
          </label>
          <select
            id="achievement-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-full border border-ktip-sand-200 bg-ktip-cream px-3 py-1.5 text-sm font-medium text-ktip-sand-700"
          >
            <option value="all">{t`All categories (${visible.length})`}</option>
            {categories.map((cat) => {
              const inCat = visible.filter((b) => (b.category || 'community') === cat)
              const earned = inCat.filter((b) => earnedById.has(b.id)).length
              return (
                <option key={cat} value={cat}>
                  {resolveCopy(i18n, CATEGORY_LABELS[cat] ?? cat)} ({earned}/{inCat.length})
                </option>
              )
            })}
          </select>

          <div className="relative min-w-[12rem] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t`Search achievements`}
              aria-label={t`Search achievements`}
              className="w-full rounded-full border border-ktip-sand-200 bg-ktip-cream py-1.5 pl-9 pr-3 text-sm text-ktip-sand-800 placeholder:text-ktip-sand-400"
            />
          </div>
        </div>

        <TagFilterChips
          label={t`Rarity`}
          options={RARITY_ORDER.map((r) => RARITY_LABEL[r])}
          selected={rarities}
          onChange={setRarities}
          collapsedCount={RARITY_ORDER.length}
        />
      </section>

      {/* ---------- Grid ----------
          Four columns, not five: inside the dashboard the 16rem rail already
          took a quarter of the width, so five columns rendered as slivers. */}
      <section>
        <div data-tutorial="achievements-gallery" className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((badge) => {
            const { earnedAt, progress } = readBadge(badge)
            const isPinned = pinned.includes(badge.id)
            const pinnable = pinning && !!earnedAt

            return (
              <button
                key={badge.id}
                type="button"
                aria-pressed={pinning ? isPinned : undefined}
                // While pinning, the tile picks; otherwise it opens the detail
                // popup that carries the description the tile no longer shows.
                onClick={() => (pinnable ? togglePin(badge.id) : setDetail(badge))}
                disabled={pinning && !earnedAt}
                className="text-left rounded-2xl focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <TrophyCard
                  name={badge.name}
                  description={badge.description}
                  icon={badge.icon}
                  rarity={badge.rarity}
                  tier={badge.tier}
                  trophyType={badge.trophy_type}
                  imageUrl={badge.image_url}
                  points={badge.points}
                  assetMap={assetMap}
                  locked={!earnedAt}
                  earnedAt={earnedAt}
                  progress={progress}
                  compact
                  className={cn('h-full', isPinned && 'ring-2 ring-ktip-sun-500')}
                />
              </button>
            )
          })}

          {/* Secrets appear only in the unfiltered view — a rarity filter that
              revealed how many epics are hidden would leak the thing itself. */}
          {category === 'all' &&
            status === 'all' &&
            !search.trim() &&
            rarities.length === 0 &&
            Array.from({ length: Math.min(unearnedSecrets, 5) }, (_, i) => (
              <SecretTrophyCard key={`secret-${i}`} />
            ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-ktip-sand-500">
            <Trans>No achievements match these filters.</Trans>
          </p>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-ktip-sand-400">
        <Users size={12} aria-hidden="true" />
        <Trans>Achievements are awarded automatically from what you do on KTIP.</Trans>
      </p>

      {/* ---------- Detail ---------- */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        size="sm"
      >
        {detail && detailRead && (
          <div className="space-y-4">
            <TrophyCard
              name={detail.name}
              description={detail.description}
              icon={detail.icon}
              rarity={detail.rarity}
              tier={detail.tier}
              trophyType={detail.trophy_type}
              imageUrl={detail.image_url}
              points={detail.points}
              assetMap={assetMap}
              locked={!detailRead.earnedAt}
              earnedAt={detailRead.earnedAt}
              progress={detailRead.progress}
              size="lg"
            />
            <p className="text-center text-xs text-ktip-sand-500">
              {resolveCopy(i18n, CATEGORY_LABELS[detail.category || 'community'] ?? detail.category)}
            </p>
            <Button variant="ghost" size="sm" fullWidth onClick={() => setDetail(null)}>
              <X size={14} aria-hidden="true" />
              <Trans>Close</Trans>
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream px-4 py-3 text-center">
      <dt className="flex items-center justify-center gap-1 text-xs uppercase tracking-wider text-ktip-sand-500">
        {icon}
        {label}
      </dt>
      <dd className="font-display text-2xl font-bold text-ktip-ocean-700 tabular-nums">{value}</dd>
    </div>
  )
}
