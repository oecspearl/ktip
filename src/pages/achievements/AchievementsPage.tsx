import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Flame, Pin, Trophy, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
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

const CATEGORY_LABELS: Record<string, string> = {
  projects: 'Projects',
  grants: 'Grants',
  events: 'Events',
  community: 'Community',
  network: 'Network',
  collaboration: 'Collaboration',
  knowledge: 'Knowledge',
  profile: 'Profile',
  dedication: 'Dedication',
  meta: 'Milestones',
  hidden: 'Secrets',
}

const MAX_SHOWCASE = 5

export default function AchievementsPage() {
  usePageTitle('Achievements')
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
  const [pinning, setPinning] = useState(false)
  const [pinned, setPinned] = useState<string[]>([])

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

  const filtered = useMemo(() => {
    return visible.filter((b) => {
      if (category !== 'all' && (b.category || 'community') !== category) return false
      if (rarities.length && !rarities.includes(RARITY_LABEL[rarityOf(b.rarity)])) return false
      return true
    })
  }, [visible, category, rarities])

  const stats = achievements?.stats
  const rank = stats?.rank

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
        toast.error(`You can pin up to ${MAX_SHOWCASE} trophies`)
        return prev
      }
      return [...prev, badgeId]
    })
  }

  const savePins = async () => {
    try {
      await showcaseMutation.mutateAsync(pinned)
      toast.success('Showcase updated')
      setPinning(false)
    } catch {
      toast.error('Could not update your showcase')
    }
  }

  if (loading && !achievements) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <div className="h-32 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* ---------- Rank header ---------- */}
      <section className="relative overflow-hidden rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6">
        {/* Only fires when a rank has actually been reached, so the page does
            not celebrate an empty account on first visit. */}
        {(rank?.level ?? 1) > 1 && <FireworksOverlay runKey={rank?.level} durationMs={1400} />}

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
              Level {rank?.level ?? 1}
            </p>
            <h1 className="font-display text-3xl font-bold text-ktip-sand-900">
              {rank?.name ?? 'Newcomer'}
            </h1>
            <p className="mt-1 text-sm text-ktip-sand-600">
              {stats?.earned ?? 0} of {stats?.total_available ?? 0} achievements
              {unearnedSecrets > 0 && ` · ${unearnedSecrets} still secret`}
            </p>
          </div>

          <dl className="flex gap-6">
            <div className="text-center">
              <dt className="text-xs uppercase tracking-wider text-ktip-sand-500">Points</dt>
              <dd className="font-display text-2xl font-bold text-ktip-ocean-700 tabular-nums">
                {stats?.points ?? 0}
              </dd>
            </div>
            <div className="text-center">
              <dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-ktip-sand-500">
                <Flame size={12} aria-hidden="true" />
                Streak
              </dt>
              <dd className="font-display text-2xl font-bold text-ktip-ocean-700 tabular-nums">
                {stats?.streak_days ?? 0}
              </dd>
            </div>
            <div className="text-center">
              <dt className="text-xs uppercase tracking-wider text-ktip-sand-500">Active days</dt>
              <dd className="font-display text-2xl font-bold text-ktip-ocean-700 tabular-nums">
                {stats?.total_active_days ?? 0}
              </dd>
            </div>
          </dl>
        </div>

        <div className="relative z-10 mt-5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-ktip-sand-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={rank?.next_required ?? rank?.earned ?? 0}
            aria-valuenow={rank?.earned ?? 0}
            aria-label="Progress to next level"
          >
            <div
              className="h-full rounded-full bg-ktip-tropical-500 transition-[width]"
              style={{ width: `${rankPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ktip-sand-500">
            {rank?.next_required
              ? `${rank.earned} / ${rank.next_required} toward ${rank.next_name}`
              : 'Highest rank reached'}
          </p>
        </div>

        <div className="relative z-10 mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={pinning ? savePins : startPinning}>
            <Pin size={14} aria-hidden="true" />
            {pinning ? `Save showcase (${pinned.length}/${MAX_SHOWCASE})` : 'Edit showcase'}
          </Button>
          {pinning && (
            <Button size="sm" variant="ghost" onClick={() => setPinning(false)}>
              Cancel
            </Button>
          )}
          <Link to="/leaderboard">
            <Button size="sm" variant="ghost">
              <Trophy size={14} aria-hidden="true" />
              Leaderboard
            </Button>
          </Link>
        </div>
      </section>

      {/* ---------- Collections ---------- */}
      {!!achievements?.collections?.length && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-ktip-sand-900">Collections</h2>
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
                    {complete && ' · complete'}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Filters ---------- */}
      <section>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Achievement categories">
          <CategoryTab
            label="All"
            active={category === 'all'}
            count={visible.length}
            earned={visible.filter((b) => earnedById.has(b.id)).length}
            onClick={() => setCategory('all')}
          />
          {categories.map((cat) => {
            const inCat = visible.filter((b) => (b.category || 'community') === cat)
            return (
              <CategoryTab
                key={cat}
                label={CATEGORY_LABELS[cat] || cat}
                active={category === cat}
                count={inCat.length}
                earned={inCat.filter((b) => earnedById.has(b.id)).length}
                onClick={() => setCategory(cat)}
              />
            )
          })}
        </div>

        <TagFilterChips
          label="Rarity"
          options={RARITY_ORDER.map((r) => RARITY_LABEL[r])}
          selected={rarities}
          onChange={setRarities}
          collapsedCount={RARITY_ORDER.length}
        />
      </section>

      {/* ---------- Grid ---------- */}
      <section>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((badge) => {
            const earnedAt = earnedById.get(badge.id)
            const isPinned = pinned.includes(badge.id)

            const card = (
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
                progress={progressBySlug.get(badge.slug) || null}
                className={cn('h-full', isPinned && 'ring-2 ring-ktip-sun-500')}
              />
            )

            // Pinning is only offered on earned trophies; the card is inert
            // otherwise, so the whole tile becomes a button only when it can act.
            if (pinning && earnedAt) {
              return (
                <button
                  key={badge.id}
                  type="button"
                  aria-pressed={isPinned}
                  onClick={() => togglePin(badge.id)}
                  className="text-left rounded-2xl focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500"
                >
                  {card}
                </button>
              )
            }

            return <div key={badge.id}>{card}</div>
          })}

          {/* Secrets appear only in the unfiltered view — a rarity filter that
              revealed how many epics are hidden would leak the thing itself. */}
          {category === 'all' &&
            rarities.length === 0 &&
            Array.from({ length: Math.min(unearnedSecrets, 5) }, (_, i) => (
              <SecretTrophyCard key={`secret-${i}`} />
            ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-ktip-sand-500">
            No achievements match these filters.
          </p>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-ktip-sand-400">
        <Users size={12} aria-hidden="true" />
        Achievements are awarded automatically from what you do on KTIP.
      </p>
    </div>
  )
}

function CategoryTab({
  label,
  active,
  count,
  earned,
  onClick,
}: {
  label: string
  active: boolean
  count: number
  earned: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
          : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700'
      )}
    >
      {label}
      <span className="ml-1.5 tabular-nums text-xs text-ktip-sand-500">
        {earned}/{count}
      </span>
    </button>
  )
}
