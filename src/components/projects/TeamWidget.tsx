import { useState } from 'react'
import { Settings, Check, X } from 'lucide-react'
import { ManageTeamModal } from './ManageTeamModal'
import { useProjectMembers, useProjectMemberMutations } from '../../hooks/useProjectMembers'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'

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

  const accepted = (members || []).filter((m) => m.status === 'accepted')
  const myPendingInvite = (members || []).find(
    (m) => m.user_id === auth.user?.id && m.status === 'pending'
  )

  const handleRespond = async (accept: boolean) => {
    if (!myPendingInvite) return
    try {
      await respondToInvite({ membershipId: myPendingInvite.id, accept })
      toast.success(accept ? 'You joined the team!' : 'Invitation declined')
    } catch (err: any) {
      toast.error(err.message || 'Failed to respond')
    }
  }

  if (!isOwner && accepted.length === 0 && !myPendingInvite) return null

  return (
    <div className="mb-10">
      <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
        Team
      </h3>
      <p className="text-ktip-ocean-600 text-xs italic mb-4">Project collaborators</p>

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
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <X size={14} />
              Decline
            </button>
          </div>
        </div>
      )}

      {accepted.length > 0 ? (
        <div className="space-y-3 mb-4">
          {accepted.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => openMember(member.user_id)}
              className="flex items-center gap-3 group w-full text-left"
            >
              <div className="w-10 h-10 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-sm font-medium text-ktip-ocean-700 shrink-0">
                {member.user?.display_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ktip-sand-900 truncate group-hover:text-ktip-ocean-600 transition-colors">
                  {member.user?.display_name || 'Unknown User'}
                </p>
                <p className="text-xs text-gray-500 capitalize">{member.role}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        isOwner && <p className="text-sm text-gray-500 mb-4">No team members yet.</p>
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
