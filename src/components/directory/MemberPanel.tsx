import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import {
  Briefcase,
  Calendar,
  CheckCircle,
  Flag,
  FolderKanban,
  Handshake,
  MapPin,
  MessageSquare,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AchievementBadge } from '../ui/AchievementBadge'
import { ConnectButton } from './ConnectButton'
import { useProfile, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
} from '../../lib/constants'
import { formatDate, getInitials, generateAvatarColor, cn } from '../../lib/utils'

/**
 * Read-only member preview, opened from anywhere a member's name appears.
 * Replaces the old /profile/:id page — see MemberPanelContext. Non-modal like
 * MessagingPanel: no backdrop, closes via X, Escape, or an outside click.
 * z-40 keeps it under Modal (z-50) and the FAB (z-[9999]).
 */
export function MemberPanel() {
  const { memberId, isOpen, closeMember } = useMemberPanel()
  const { openPanel } = useMessagingPanel()
  const auth = useAuth()
  const panelRef = useRef<HTMLElement>(null)

  const { profile, loading } = useProfile(memberId ?? undefined)
  const { projects } = useUserProjects(memberId ?? undefined)
  const { events } = useUserEvents(memberId ?? undefined)
  const { badges } = useUserBadges(memberId ?? undefined)
  // null when this viewer isn't allowed to see the count (owner's setting)
  const { count: connectionCount } = useConnectionCount(memberId ?? undefined)

  // Escape closes the drawer — unless an open Modal (role="dialog") owns the key.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      closeMember()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeMember])

  // Clicking outside closes. Ignores modals and the FAB, same as MessagingPanel.
  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (panelRef.current?.contains(target)) return
      if (target.closest('[role="dialog"]')) return
      if (target.closest('[data-fab]')) return
      closeMember()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen, closeMember])

  if (!isOpen) return null

  const isSelf = memberId === auth.user?.id
  const displayName = profile?.display_name || 'Unknown User'

  return (
    <section
      ref={panelRef}
      role="complementary"
      aria-label="Member preview"
      className={cn(
        'fixed z-40 inset-x-2 top-20 bottom-24',
        'lg:inset-auto lg:right-6 lg:top-24 lg:bottom-24 lg:w-[min(420px,calc(100vw-3rem))]',
        'bg-ktip-cream rounded-2xl shadow-hard border border-ktip-sand-200',
        'overflow-hidden flex flex-col animate-scale-in origin-top-right'
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-ktip-sand-200 shrink-0">
        <h2 className="font-display font-bold text-ktip-sand-900 text-sm">Member</h2>
        <button
          onClick={closeMember}
          aria-label="Close member preview"
          className="p-1.5 rounded-lg hover:bg-ktip-sand-100 text-ktip-sand-500 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading || !profile ? (
          <div className="space-y-3">
            <div className="h-20 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
            <div className="h-32 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
          </div>
        ) : (
          <>
            {/* Identity */}
            <div className="flex items-start gap-4 mb-4">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              ) : (
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0 ${generateAvatarColor(displayName)}`}
                >
                  {getInitials(displayName)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-display font-bold text-ktip-sand-900 truncate">
                    {displayName}
                  </h3>
                  {profile.is_verified && (
                    <span className="text-ktip-ocean-500 shrink-0" title="Verified">
                      <CheckCircle size={18} />
                    </span>
                  )}
                </div>

                {profile.country && (
                  <p className="flex items-center gap-1.5 text-sm text-ktip-sand-600 mt-0.5">
                    <MapPin size={14} />
                    {profile.country}
                  </p>
                )}

                {(profile.organization || profile.industry) && (
                  <p className="flex items-center gap-1.5 text-sm text-ktip-sand-600 mt-0.5">
                    <Briefcase size={14} />
                    {[profile.organization, profile.industry].filter(Boolean).join(' · ')}
                  </p>
                )}

                {connectionCount !== null && (
                  <p className="flex items-center gap-1.5 text-sm text-ktip-sand-600 mt-0.5">
                    <Users size={14} />
                    <span className="font-semibold text-ktip-sand-900">{connectionCount}</span>
                    {connectionCount === 1 ? 'connection' : 'connections'}
                  </p>
                )}
              </div>
            </div>

            {/* Actions — hidden when you somehow land on yourself */}
            {!isSelf && (
              <div className="flex flex-wrap gap-2 mb-4">
                <ConnectButton otherUserId={profile.id} />
                <Button
                  variant="outline"
                  size="sm"
                  icon={<MessageSquare size={16} />}
                  onClick={() => openPanel({ userId: profile.id })}
                >
                  Message
                </Button>
                <Link to={`/grievances/report/${profile.id}`} onClick={closeMember}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Flag size={16} />}
                    className="text-ktip-sand-500 hover:bg-red-50 hover:text-red-600"
                  >
                    Report
                  </Button>
                </Link>
              </div>
            )}

            {/* Roles */}
            {profile.roles?.length ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {profile.roles.map((role) => (
                  <Badge key={role} className={ROLE_COLORS[role]}>
                    {ROLE_LABELS[role] || role}
                  </Badge>
                ))}
              </div>
            ) : null}

            {/* Achievements */}
            {badges?.length ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {badges.map((userBadge) => (
                  <AchievementBadge key={userBadge.id} userBadge={userBadge} />
                ))}
              </div>
            ) : null}

            {profile.bio && (
              <p className="text-sm text-ktip-sand-700 whitespace-pre-wrap mb-3">{profile.bio}</p>
            )}

            {profile.skills?.length ? (
              <div className="mb-3">
                <p className="text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {profile.interests?.length ? (
              <div className="mb-3">
                <p className="text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">
                  Interests
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.interests.map((interest) => (
                    <span
                      key={interest}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-tropical-50 text-ktip-tropical-700 border border-ktip-tropical-200"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {profile.open_to?.length ? (
              <div className="mb-3">
                <p className="text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">
                  Open To
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.open_to.map((value) => (
                    <span
                      key={value}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        value === COLLAB_EXCLUSIVE_VALUE
                          ? 'bg-ktip-sand-50 text-ktip-sand-500 border-ktip-sand-200'
                          : 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200'
                      }`}
                    >
                      <Handshake size={12} />
                      {COLLABORATION_LABELS[value] || value}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Public projects — compact rows; the drawer is too narrow for cards */}
            {projects?.length ? (
              <div className="mb-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">
                  <FolderKanban size={13} />
                  Projects
                </p>
                <div className="space-y-1">
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      onClick={closeMember}
                      className="block px-3 py-2 rounded-lg text-sm text-ktip-sand-700 hover:bg-ktip-sand-50 hover:text-ktip-ocean-700 transition-colors truncate"
                    >
                      {project.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {events?.length ? (
              <div className="mb-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">
                  <Calendar size={13} />
                  Events
                </p>
                <div className="space-y-1">
                  {events.map((event) => (
                    <Link
                      key={event.id}
                      to={`/events/${event.id}`}
                      onClick={closeMember}
                      className="block px-3 py-2 rounded-lg text-sm text-ktip-sand-700 hover:bg-ktip-sand-50 hover:text-ktip-ocean-700 transition-colors truncate"
                    >
                      {event.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="flex items-center gap-1.5 text-xs text-ktip-sand-400 pt-2 border-t border-ktip-sand-100">
              <Calendar size={13} />
              Joined {formatDate(profile.created_at)}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
