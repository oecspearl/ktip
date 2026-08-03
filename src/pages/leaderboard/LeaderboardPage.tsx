import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, EyeOff, Trophy } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { useLeaderboard, useMyRank } from '../../hooks/useLeaderboard'
import { useTrackFlag } from '../../hooks/useAchievements'
import { ROLE_LABELS } from '../../lib/constants'
import { cn } from '../../lib/utils'
import type { LeaderboardScope, LeaderboardWindow } from '../../types'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { resolveCopy } from '../../i18n/copy'

/**
 * Public board. Everything about who appears is decided in SQL by
 * get_leaderboard(): students are excluded for safeguarding, members who set
 * leaderboard_visibility to 'private' are excluded, and so are suspended
 * accounts. None of that is re-implemented here — a client-side filter would
 * only be a second, weaker copy of the rule.
 */

const WINDOWS: { value: LeaderboardWindow; label: MessageDescriptor }[] = [
  { value: 'all', label: msg`All time` },
  { value: 'month', label: msg`This month` },
]

export default function LeaderboardPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Leaderboard`)
  const auth = useAuth()
  const trackFlag = useTrackFlag()

  const [window_, setWindow] = useState<LeaderboardWindow>('all')
  const [scope, setScope] = useState<LeaderboardScope>('global')

  useEffect(() => {
    trackFlag('leaderboard_views')
  }, [trackFlag])

  // Country and role boards are scoped to the viewer's own, which is the only
  // version that means anything to them — an arbitrary-country picker would be
  // browsing, not competing.
  const myCountry = auth.profile?.country || null
  const myRole = auth.profile?.active_role || auth.profile?.roles?.[0] || null

  const value = scope === 'country' ? myCountry : scope === 'role' ? myRole : null

  const filters = useMemo(
    () => ({ scope, value, window: window_, limit: 50 }),
    [scope, value, window_]
  )

  const { entries, loading } = useLeaderboard(filters)
  const { myRank } = useMyRank(filters, !!auth.user?.id)

  const roleLabel = myRole ? resolveCopy(i18n, ROLE_LABELS[myRole] || myRole) : null

  const scopeOptions: { value: LeaderboardScope; label: string; disabled?: boolean }[] = [
    { value: 'global', label: t`Everyone` },
    { value: 'country', label: myCountry ? t`My country (${myCountry})` : t`My country`, disabled: !myCountry },
    {
      value: 'role',
      label: roleLabel ? t`My role (${roleLabel})` : t`My role`,
      disabled: !myRole,
    },
  ]

  const top = entries || []
  const inTop = top.some((e) => e.user_id === auth.user?.id)

  const activeWindowLabel = i18n._(WINDOWS.find((w) => w.value === window_)?.label ?? WINDOWS[0].label)
  const activeScopeLabel = scopeOptions.find((o) => o.value === scope)?.label ?? ''

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-ktip-sand-900"><Trans>Leaderboard</Trans></h1>
        <p className="mt-1 text-sm text-ktip-sand-600">
          <Trans>Points come from achievements earned across projects, grants, events and the community.</Trans>{' '}
          <Link to="/achievements" className="text-ktip-ocean-600 hover:underline">
            <Trans>See how they are earned</Trans>
          </Link>
          .
        </p>
      </header>

      {/* ---------- Controls ---------- */}
      {/* data-spy-skip: a filter bar is not a destination — the rail keeps
          Rankings and Your rank. The marker stays for the tour. */}
      <div
        id="filters"
        data-spy="Filters"
        data-spy-skip
        className="scroll-mt-24 flex flex-wrap items-center gap-4"
      >
        <div className="flex gap-1.5" role="tablist" aria-label={t`Time period`}>
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              role="tab"
              aria-selected={window_ === w.value}
              onClick={() => setWindow(w.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                window_ === w.value
                  ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
              )}
            >
              {i18n._(w.label)}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-ktip-sand-600">
          <span className="shrink-0"><Trans>Board</Trans></span>
          <select
            value={scope}
            onChange={(e) => setScope(e.currentTarget.value as LeaderboardScope)}
            aria-label={t`Leaderboard scope`}
            className="rounded-lg border border-ktip-sand-300 bg-ktip-cream px-3 py-2 text-sm transition-colors focus:border-ktip-ocean-500 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ---------- Board ---------- */}
      {loading ? (
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      ) : top.length === 0 ? (
        <p className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream py-16 text-center text-sm text-ktip-sand-500">
          <Trans>No one has scored on this board yet.</Trans>
        </p>
      ) : (
        // Wide content scrolls inside its own container so the page body never
        // scrolls sideways on a phone.
        <div
          id="rankings"
          data-spy="Rankings"
          className="scroll-mt-24 overflow-x-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream"
        >
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">
              {t`Top members by achievement points, ${activeWindowLabel}, ${activeScopeLabel}`}
            </caption>
            <thead>
              <tr className="border-b border-ktip-sand-200 text-left text-xs uppercase tracking-wider text-ktip-sand-500">
                <th scope="col" className="px-4 py-3 w-16"><Trans>Rank</Trans></th>
                <th scope="col" className="px-4 py-3"><Trans>Member</Trans></th>
                <th scope="col" className="px-4 py-3"><Trans>Level</Trans></th>
                <th scope="col" className="px-4 py-3 text-right"><Trans>Badges</Trans></th>
                <th scope="col" className="px-4 py-3 text-right"><Trans>Points</Trans></th>
              </tr>
            </thead>
            <tbody>
              {top.map((entry) => {
                const isMe = entry.user_id === auth.user?.id
                return (
                  <tr
                    key={entry.user_id}
                    className={cn(
                      'border-b border-ktip-sand-100 last:border-0',
                      isMe && 'bg-ktip-ocean-50/60'
                    )}
                  >
                    <td className="px-4 py-3 font-display font-bold tabular-nums text-ktip-sand-700">
                      {/* Medal styling for the top three, with the number kept
                          so rank is never conveyed by colour alone. */}
                      <span
                        className={cn(
                          'inline-flex h-7 w-7 items-center justify-center rounded-full',
                          entry.rank === 1 && 'bg-ktip-sun-200 text-ktip-sun-800',
                          entry.rank === 2 && 'bg-ktip-sand-200 text-ktip-sand-700',
                          entry.rank === 3 && 'bg-ktip-sand-300 text-ktip-sand-800'
                        )}
                      >
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/user/${entry.user_id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <DiamondAvatar
                          src={entry.avatar_url}
                          name={entry.display_name || t`Member`}
                          size={28}
                        />
                        <span className="font-medium text-ktip-sand-900">
                          {entry.display_name || t`Member`}
                        </span>
                        {entry.is_verified && (
                          <BadgeCheck
                            size={14}
                            className="shrink-0 text-ktip-tropical-700"
                            aria-label={t`Verified member`}
                          />
                        )}
                        {isMe && (
                          <span className="text-xs text-ktip-ocean-600"><Trans>(you)</Trans></span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ktip-sand-600">
                      {entry.rank_name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ktip-sand-600">
                      {entry.badge_count}
                    </td>
                    <td className="px-4 py-3 text-right font-display font-bold tabular-nums text-ktip-ocean-700">
                      {entry.points}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Own standing ---------- */}
      {myRank && !inTop && (
        <div
          id="your-rank"
          data-spy="Your rank"
          className="scroll-mt-24 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <Trophy size={16} className="text-ktip-ocean-600" aria-hidden="true" />
            <span className="font-medium text-ktip-sand-900">
              <Trans>You are #{myRank.rank} of {myRank.board_size}</Trans>
            </span>
            <span className="text-ktip-sand-600">
              · <Plural value={myRank.points} one="# point" other="# points" /> ·{' '}
              <Plural value={myRank.badge_count} one="# badge" other="# badges" />
            </span>
          </div>
          {!myRank.listed && (
            <span className="flex items-center gap-1.5 text-xs text-ktip-sand-600">
              <EyeOff size={12} aria-hidden="true" />
              <Trans>
                Hidden from others —{' '}
                <Link to="/settings?tab=profile" className="text-ktip-ocean-600 hover:underline">
                  change
                </Link>
              </Trans>
            </span>
          )}
        </div>
      )}

      {auth.user && myRank?.listed && (
        <p className="text-center text-xs text-ktip-sand-400">
          <Trans>Prefer not to appear?</Trans>{' '}
          <Link to="/settings?tab=profile" className="text-ktip-ocean-600 hover:underline">
            <Trans>Hide yourself from the leaderboard</Trans>
          </Link>
          .
        </p>
      )}
    </div>
  )
}
