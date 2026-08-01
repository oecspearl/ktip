import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { User, MapPin, MessageSquare } from 'lucide-react'
import type { Profile } from '../../types'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
import { truncate } from '../../lib/utils'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useAuth } from '../../contexts/AuthContext'

interface MemberCardProps {
  member: Profile
}

export function MemberCard({ member }: MemberCardProps) {
  const { openMember } = useMemberPanel()
  const { openPanel } = useMessagingPanel()
  const auth = useAuth()
  // Signed-out visitors browse the list; messaging needs a session, and a
  // private member needs an accepted connection on top of that (083).
  const canMessage = !!auth.user && member.profile_visibility !== 'private'
  return (
    <Card hover className="h-full flex flex-col">
      {/* Avatar & Name */}
      <div className="flex items-center gap-4 mb-4">
        {member.avatar_url ? (
          <img
            src={member.avatar_url!}
            alt={member.display_name || 'Member'}
            loading="lazy" decoding="async" width={56} height={56} className="w-14 h-14 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-xl font-bold text-ktip-ocean-700 shrink-0">
            {member.display_name?.charAt(0).toUpperCase() || <User size={24} />}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-display font-bold text-ktip-sand-900 truncate">
            {member.display_name || 'Anonymous'}
          </h3>
          {member.country && (
            <div className="flex items-center gap-1 text-sm text-ktip-sand-500">
              <MapPin size={14} />
              <span>{member.country}</span>
            </div>
          )}
        </div>
      </div>

      {/* Roles */}
      {member.roles?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {member.roles.slice(0, 3).map((role) => (
            <Badge key={role} className={ROLE_COLORS[role]} size="sm">
              {ROLE_LABELS[role] || role}
            </Badge>
          ))}
        </div>
      )}

      {/* Bio */}
      {member.bio && (
        <p className="text-sm text-ktip-sand-600 mb-3 line-clamp-2 flex-1">
          {truncate(member.bio!, 120)}
        </p>
      )}

      {/* Skills */}
      {member.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {member.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="text-xs px-2 py-0.5 bg-ktip-sand-100 text-ktip-sand-600 rounded-full">
              {skill}
            </span>
          ))}
          {member.skills.length > 3 && (
            <span className="text-xs text-ktip-sand-400">
              +{member.skills.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-3 border-t border-ktip-sand-100 flex gap-2">
        <button
          type="button"
          onClick={() => openMember(member.username || member.id)}
          className="flex-1 text-center text-sm font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 py-1.5 rounded-lg hover:bg-ktip-ocean-50 transition-colors"
        >
          View Profile
        </button>
        {canMessage && (
          <button
            type="button"
            onClick={() => openPanel({ userId: member.id })}
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-700 py-1.5 px-3 rounded-lg hover:bg-ktip-sand-50 transition-colors"
          >
            <MessageSquare size={14} />
            Message
          </button>
        )}
      </div>
    </Card>
  )
}
