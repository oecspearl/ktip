import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { MapPin, MessageSquare } from 'lucide-react'
import type { Profile } from '../../types'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/constants'
import { truncate } from '../../lib/utils'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useAuth } from '../../contexts/AuthContext'
import { canDmAcrossAges } from '../../lib/minor-safety'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

interface MemberCardProps {
  member: Profile
}

export function MemberCard({ member }: MemberCardProps) {
    const { t, i18n } = useLingui()
  const { openMember } = useMemberPanel()
  const { openPanel } = useMessagingPanel()
  const auth = useAuth()
  // Signed-out visitors browse the list; messaging needs a session, and a
  // private member needs an accepted connection on top of that (083).
  // dm:initiate is denied to students by has_permission() itself, so without
  // this the card offers a button that always fails. Private members are
  // unreachable until they accept a connection, for the same reason.
  // 091 adds the last clause: a 1:1 DM that crosses the adult/minor line is
  // refused by the server, so the button would only ever fail.
  const canMessage =
    !!auth.user &&
    member.profile_visibility !== 'private' &&
    auth.can('dm:initiate') &&
    canDmAcrossAges(auth.profile, member)
  return (
    <Card hover className="h-full flex flex-col">
      {/* Avatar & Name */}
      <div className="flex items-center gap-4 mb-4">
        <DiamondAvatar
          src={member.avatar_url}
          name={member.display_name || 'Member'}
          size={56}
        />
        <div className="min-w-0">
          <h3 className="text-lg font-display font-bold text-ktip-sand-900 truncate">
            {member.display_name || t`Anonymous`}
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
              {resolveCopy(i18n, ROLE_LABELS[role] || role)}
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
          <Trans>View Profile</Trans>
        </button>
        {canMessage && (
          <button
            type="button"
            onClick={() => openPanel({ userId: member.id })}
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-700 py-1.5 px-3 rounded-lg hover:bg-ktip-sand-50 transition-colors"
          >
            <MessageSquare size={14} />
            <Trans>Message</Trans>
          </button>
        )}
      </div>
    </Card>
  )
}
