import { useState } from 'react'
import { Link } from 'react-router'
import { Settings, Check, X, UserCheck, UserX } from 'lucide-react'
import { ManageTeamModal } from './ManageTeamModal'
import { useProjectMembers, useProjectMemberMutations } from '../../hooks/useProjectMembers'
import {
  useProjectJoinRequests,
  useProjectJoinRequestMutations,
  useProjectTeam,
} from '../../hooks/useProjectJoinRequests'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
// The public roster comes from a SECURITY DEFINER function with fixed columns
// and no username, so those rows still link by uuid and the profile page
// rewrites the URL on arrival. Join requests embed the whole profile.
import { memberPath } from '../../lib/slug'

interface TeamWidgetProps {
  projectId: string
  projectTitle: string
  isOwner: boolean
}

export function TeamWidget({ projectId, projectTitle, isOwner }: TeamWidgetProps) {
  const auth = useAuth()
  const toast = useToast()
  const { members } = useProjectMembers(projectId)
  const { respondToInvite, loading } = useProjectMemberMutations()
  const { openMember } = useMemberPanel()
  const [modalOpen, setModalOpen] = useState(false)

  // The public roster (SECURITY DEFINER, migration 079). Reading
  // project_members directly returns nothing for a visitor, which is why this
  // widget used to hide itself rather than show an empty team.
  const { team } = useProjectTeam(projectId)
  const { requests } = useProjectJoinRequests(projectId, isOwner)
  const { decideRequest, deciding } = useProjectJoinRequestMutations()

  const myPendingInvite = (members || []).find(
    (m) => m.user_id === auth.user?.id && m.status === 'pending'
  )
  const roster = team || []
  const pendingRequests = requests || []

  const handleRespond = async (accept: boolean) => {
    if (!myPendingInvite) return
    try {
      await respondToInvite({ membershipId: myPendingInvite.id, accept })
      toast.success(accept ? 'You joined the team!' : 'Invitation declined')
    } catch (err: any) {
      toast.error(err.message || 'Failed to respond')
    }
  }

  const handleDecide = async (requestId: string, requesterId: string, approve: boolean) => {
    try {
      await decideRequest({
        requestId,
        approve,
        requesterId,
        projectId,
        projectTitle,
      })
      toast.success(approve ? 'Added to the team' : 'Request declined')
    } catch (err: any) {
      toast.error(err.message || 'Failed to decide the request')
    }
  }

  // Always rendered now. A visitor looking at a one-person project should see
  // "1 team member", not a widget that silently removes itself.
  return (
    <div className="mb-10">
      <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
        Team
      </h3>
      <p className="text-ktip-ocean-600 text-xs italic mb-4">
        {roster.length} {roster.length === 1 ? 'collaborator' : 'collaborators'}
      </p>

      {myPendingInvite && (
        <div className="mb-4 p-3 bg-ktip-sun-50 border border-ktip-sun-200 rounded-lg">
          <p className="text-sm text-ktip-sun-800 mb-2">
            You've been invited to join this project as {myPendingInvite.role}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(true)}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 btn-brand text-xs font-bold rounded-lg disabled:opacity-50"
            >
              <Check size={14} />
              Accept
            </button>
            <button
              onClick={() => handleRespond(false)}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-ktip-sand-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-ktip-sand-200 transition-colors disabled:opacity-50"
            >
              <X size={14} />
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Owner-only: people asking to join (migration 079) */}
      {isOwner && pendingRequests.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg border border-ktip-ocean-200 bg-ktip-ocean-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ktip-ocean-700">
            {pendingRequests.length} request{pendingRequests.length === 1 ? '' : 's'} to collaborate
          </p>
          {pendingRequests.map((req) => (
            <div key={req.id} className="text-sm">
              <Link
                to={memberPath(req.requester ?? { id: req.requester_id })}
                className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600"
              >
                {req.requester?.display_name || 'A member'}
              </Link>
              {req.message && (
                <p className="mt-0.5 text-xs text-ktip-sand-600 italic">"{req.message}"</p>
              )}
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => handleDecide(req.id, req.requester_id, true)}
                  disabled={deciding}
                  className="flex items-center gap-1 px-2.5 py-1 btn-brand text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  <UserCheck size={13} />
                  Accept
                </button>
                <button
                  onClick={() => handleDecide(req.id, req.requester_id, false)}
                  disabled={deciding}
                  className="flex items-center gap-1 px-2.5 py-1 bg-ktip-sand-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-ktip-sand-200 transition-colors disabled:opacity-50"
                >
                  <UserX size={13} />
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {roster.length > 0 ? (
        <div className="space-y-3 mb-4">
          {roster.map((member) => (
            <div key={member.user_id} className="flex items-center gap-3">
              {/* The avatar opens the quick-look drawer; the name is a real
                  link, so a team member's profile can be shared or opened in a
                  new tab the same way the owner's can. */}
              <button
                type="button"
                onClick={() => openMember(member.user_id)}
                aria-label={`Preview ${member.display_name || 'member'}`}
                className="w-10 h-10 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-sm font-medium text-ktip-ocean-700 shrink-0 overflow-hidden"
              >
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  member.display_name?.charAt(0).toUpperCase() || 'U'
                )}
              </button>
              <div className="min-w-0">
                <Link
                  to={`/user/${member.user_id}`}
                  className="block text-sm font-medium text-ktip-sand-900 truncate hover:text-ktip-ocean-600 transition-colors"
                >
                  {member.display_name || 'Unknown User'}
                </Link>
                <p className="text-xs text-gray-500 capitalize">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-4">No collaborators yet.</p>
      )}

      {isOwner && (
        <>
          <button
            onClick={() => setModalOpen(true)}
            className="w-full px-4 py-2.5 border border-ktip-ocean-600 text-ktip-ocean-600 text-sm font-bold rounded-lg hover:bg-ktip-ocean-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <Settings size={16} />
            Manage Team
          </button>
          <ManageTeamModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            projectId={projectId}
            projectTitle={projectTitle}
          />
        </>
      )}
    </div>
  )
}
