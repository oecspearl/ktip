import { Link } from 'react-router'
import { Calendar, Edit, Handshake } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AchievementBadge } from '../../../components/ui/AchievementBadge'
import { useAuth } from '../../../contexts/AuthContext'
import { useUserBadges } from '../../../hooks/useBadges'
import { usePageTitle } from '../../../hooks/usePageTitle'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
} from '../../../lib/constants'
import { formatDate } from '../../../lib/utils'

/**
 * Read-only view of what other members see in the member drawer. Editing lives
 * in /settings?tab=profile — that form already covers strictly more fields.
 */
export default function ProfileTab() {
  usePageTitle('My Profile')
  const auth = useAuth()
  const profile = auth.profile
  const { badges } = useUserBadges(auth.user?.id)

  if (!profile) {
    return <div className="bg-ktip-cream rounded-2xl border border-gray-200 h-64 animate-pulse-soft" />
  }

  return (
    <div className="bg-ktip-cream border border-gray-200 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display font-bold text-xl text-ktip-sand-900">Your profile</h2>
          <p className="text-sm text-ktip-sand-600">This is how other members see you.</p>
        </div>
        <Link to="/settings?tab=profile" className="shrink-0">
          <Button variant="outline" size="sm" icon={<Edit size={16} />}>
            Edit
          </Button>
        </Link>
      </div>

      {profile.roles?.length ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {profile.roles.map((role) => (
            <Badge key={role} className={ROLE_COLORS[role]}>
              {ROLE_LABELS[role] || role}
            </Badge>
          ))}
        </div>
      ) : null}

      {badges?.length ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {badges.map((userBadge) => (
            <AchievementBadge key={userBadge.id} userBadge={userBadge} />
          ))}
        </div>
      ) : null}

      {profile.bio ? (
        <p className="text-ktip-sand-700 whitespace-pre-wrap mb-3">{profile.bio}</p>
      ) : (
        <p className="text-sm text-ktip-sand-400 italic mb-3">
          No bio yet — add one so members know what you work on.
        </p>
      )}

      {profile.skills?.length ? (
        <div className="mb-3">
          <p className="text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">Skills</p>
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
          <p className="text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">Interests</p>
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
          <p className="text-xs font-medium text-ktip-sand-500 uppercase tracking-wide mb-1.5">Open To</p>
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

      <p className="flex items-center gap-1.5 text-sm text-ktip-sand-400">
        <Calendar size={14} />
        Joined {formatDate(profile.created_at)}
      </p>
    </div>
  )
}
