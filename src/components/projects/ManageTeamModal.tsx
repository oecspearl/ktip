import { useState } from 'react'
import { Search, Trash2, UserPlus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useSearchUsers } from '../../hooks/useMessages'
import { useProjectMembers, useProjectMemberMutations } from '../../hooks/useProjectMembers'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Profile, ProjectMemberRole } from '../../types'

interface ManageTeamModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectTitle: string
}

export function ManageTeamModal({ open, onClose, projectId, projectTitle }: ManageTeamModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { members } = useProjectMembers(projectId)
  const { inviteMember, updateMemberRole, removeMember, loading } = useProjectMemberMutations()
  const { searchUsers, loading: searching } = useSearchUsers()

  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [inviteRole, setInviteRole] = useState<ProjectMemberRole>('viewer')

  const handleSearch = async () => {
    if (!auth.user || !searchQuery.trim()) return
    try {
      const users = await searchUsers(searchQuery.trim(), auth.user.id)
      const memberIds = new Set((members || []).map((m) => m.user_id))
      setResults(users.filter((u) => !memberIds.has(u.id)))
    } catch {
      toast.error('Search failed')
    }
  }

  const handleInvite = async (userId: string) => {
    if (!auth.user) return
    try {
      await inviteMember({
        projectId,
        projectTitle,
        userId,
        role: inviteRole,
        invitedBy: auth.user.id,
      })
      setResults((prev) => prev.filter((u) => u.id !== userId))
      toast.success('Invitation sent')
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invitation')
    }
  }

  const handleRoleChange = async (membershipId: string, role: ProjectMemberRole) => {
    try {
      await updateMemberRole({ membershipId, role })
      toast.success('Role updated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role')
    }
  }

  const handleRemove = async (membershipId: string) => {
    try {
      await removeMember(membershipId)
      toast.success('Member removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Team" size="lg">
      {/* Invite */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-ktip-sand-900 mb-2">Invite members</label>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search users by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-3 py-2 border border-ktip-sand-300 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as ProjectMemberRole)}
            className="px-3 py-2 border border-ktip-sand-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 btn-brand text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            Search
          </button>
        </div>

        {results.length > 0 && (
          <div className="border border-ktip-sand-200 rounded-lg divide-y divide-ktip-sand-100 max-h-48 overflow-y-auto">
            {results.map((user) => (
              <div key={user.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-sm font-medium text-ktip-ocean-700 shrink-0">
                    {user.display_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium text-ktip-sand-900 truncate">
                    {user.display_name || 'Unknown User'}
                  </span>
                </div>
                <button
                  onClick={() => handleInvite(user.id)}
                  disabled={loading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  Invite
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current team */}
      <div>
        <label className="block text-sm font-semibold text-ktip-sand-900 mb-2">Team</label>
        {members && members.length > 0 ? (
          <div className="border border-ktip-sand-200 rounded-lg divide-y divide-ktip-sand-100">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between px-3 py-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-sm font-medium text-ktip-ocean-700 shrink-0">
                    {member.user?.display_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ktip-sand-900 truncate">
                      {member.user?.display_name || 'Unknown User'}
                    </p>
                    {member.status === 'pending' && (
                      <p className="text-xs text-ktip-sun-600">Invitation pending</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as ProjectMemberRole)}
                    disabled={loading}
                    className="px-2 py-1 border border-ktip-sand-300 rounded text-xs focus:outline-none"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={loading}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    aria-label="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4 text-center">
            No team members yet. Invite someone above.
          </p>
        )}
      </div>
    </Modal>
  )
}
