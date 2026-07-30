import { Link } from 'react-router'
import { Trophy } from 'lucide-react'
import { useAchievementContext } from '../../contexts/AchievementContext'
import { useAllBadges } from '../../hooks/useBadges'

/**
 * The three achievements the member is closest to unlocking.
 *
 * The gallery is the only place achievements appear at all, which meant the
 * dashboard never told anyone what to do next — you had to open a tab and read
 * a 75-tile grid to find the two bars that were nearly full. This is that
 * answer, on the page people already land on.
 *
 * Renders nothing when there is no partial progress: an empty encouragement
 * card on a brand-new account is noise.
 */
export function NextUpStrip() {
  const { achievements } = useAchievementContext()
  const { badges: allBadges } = useAllBadges()

  const bySlug = new Map((allBadges || []).map((b) => [b.slug, b]))

  const next = (achievements?.progress || [])
    .filter((p) => p.target > 0 && p.current > 0 && p.current < p.target)
    .map((p) => ({ ...p, badge: bySlug.get(p.slug), pct: p.current / p.target }))
    // Hidden achievements stay hidden — a progress bar labelled with the name
    // of a secret gives the secret away.
    .filter((p) => p.badge && !p.badge.is_hidden)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)

  if (next.length === 0) return null

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-ktip-ocean-600" />
          <h2 className="font-display text-xl font-bold text-ktip-sand-900">Closest to unlocking</h2>
        </div>
        <Link
          to="/dashboard/achievements"
          className="text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {next.map((item) => (
          <div
            key={item.slug}
            className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream px-4 py-3"
          >
            <p className="truncate font-medium text-ktip-sand-900">{item.badge!.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-ktip-sand-600">
              {item.badge!.description}
            </p>
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ktip-sand-200"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={item.target}
              aria-valuenow={item.current}
              aria-label={`${item.badge!.name} progress`}
            >
              <div
                className="h-full rounded-full bg-ktip-ocean-500"
                style={{ width: `${Math.round(item.pct * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs tabular-nums text-ktip-sand-500">
              {item.current} / {item.target}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
