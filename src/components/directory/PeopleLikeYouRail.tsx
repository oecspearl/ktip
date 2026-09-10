import { UsersRound } from 'lucide-react'
import { useMemberSuggestions } from '../../hooks/useMemberSuggestions'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useConnectionStatuses } from '../../hooks/useConnections'
import { useAuth } from '../../contexts/AuthContext'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { VerifiedBadge } from '../ui/VerifiedBadge'
import { MatchReasonChip } from '../ui/MatchReasonChip'
import { ConnectButton } from './ConnectButton'
import { ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import type { RoleSlug } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface PeopleLikeYouRailProps {
  /** Narrow the pool to one role — 'mentor' for mentor matching. */
  role?: RoleSlug
  title?: string
  limit?: number
  className?: string
}

/**
 * "Members like you" (156): the people who share your interests, skills,
 * country or industry and are not yet your connections. Renders nothing
 * signed out or when nobody matches — an empty rail would only look broken.
 */
export function PeopleLikeYouRail({ role, title, limit = 6, className }: PeopleLikeYouRailProps) {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const { suggestions, loading } = useMemberSuggestions({ limit, role })
  const { openMember } = useMemberPanel()
  const ids = suggestions.map((s) => s.id)
  const { statuses } = useConnectionStatuses(auth.user?.id, ids)

  if (!auth.user) return null
  if (loading) {
    return (
      <div className={className}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-ktip-sand-200 bg-ktip-sand-50 animate-pulse-soft" />
          ))}
        </div>
      </div>
    )
  }
  if (!suggestions.length) return null

  return (
    <section className={className} aria-label={title ?? t`Members like you`}>
      <div className="flex items-center gap-2 mb-4">
        <UsersRound size={18} className="text-ktip-ocean-600" />
        <h2 className="font-display font-bold text-xl text-ktip-sand-900">
          {title ?? (role === 'mentor' ? t`Mentors for you` : t`Members like you`)}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestions.map((member) => {
          const name = member.display_name || t`Member`
          const roles = (member.roles || [])
            .slice(0, 2)
            .map((r) => resolveCopy(i18n, ROLE_LABELS[r] || r))
            .join(', ')
          return (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-3 hover:border-ktip-ocean-300 transition-colors"
            >
              <button
                type="button"
                onClick={() => openMember(member.username || member.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <DiamondAvatar src={member.avatar_url} name={name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ktip-sand-900">{name}</span>
                    <VerifiedBadge verified={member.is_verified} size={14} />
                  </span>
                  <span className="block truncate text-xs text-ktip-sand-500">
                    {[roles, member.organization || member.country].filter(Boolean).join(' · ')}
                  </span>
                  <MatchReasonChip reasons={member.reasons} className="mt-1" />
                </span>
              </button>
              <ConnectButton otherUserId={member.id} size="sm" status={statuses?.[member.id]} />
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ktip-sand-400">
        <Trans>Suggested from shared interests, skills, country and industry. Nobody sees this list but you.</Trans>
      </p>
    </section>
  )
}
