import { useState } from 'react'
import { Search, Trash2, UserPlus, LogOut } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useSearchUsers, useGroupConversationMutations } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { getInitials, generateAvatarColor } from '../../lib/utils'
import type { Conversation, Profile } from '../../types'

interface GroupSettingsModalProps {
  open: boolean
  onClose: () => void
  conversation: Conversation
  onLeft?: () => void
}

export function GroupSettingsModal({ open, onClose, conversation, onLeft }: GroupSettingsModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { renameGroup, addMember, removeMember, loading } = useGroupConversationMutations()
  const { searchUsers, loading: searching } = useSearchUsers()

  const participants = conversation.participants || []
  const myParticipant = participants.find((p) => p.user_id === auth.user?.id)
  const isAdmin = myParticipant?.role === 'admin' || conversation.created_by === auth.user?.id

  const [name, setName] = useState(conversation.name || '')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])

  const handleRename = async () => {
    if (!name.trim()) return
    try {
      await renameGroup(conversation.id, name)
      toast.success('Group renamed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename group')
    }
  }

  const handleSearch = async () => {
    if (!auth.user || !searchQuery.trim()) return
    try {
      const users = await searchUsers(searchQuery.trim(), auth.user.id)
      const memberIds = new Set(participants.map((p) => p.user_id))
      setResults(users.filter((u) => !memberIds.has(u.id)))
    } catch {
      toast.error('Search failed')
    }
  }

  const handleAdd = async (userId: string) => {
    try {
      await addMember(conversation.id, userId)
      setResults((prev) => prev.filter((u) => u.id !== userId))
      toast.success('Member added')
    } catch (err: any) {
      toast.error(err.message || 'Failed to add member')
    }
  }

  const handleRemove = async (participantId: string) => {
    try {
      await removeMember(participantId)
      toast.success('Member removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member')
    }
  }

  const handleLeave = async () => {
    if (!myParticipant) return
    try {
      await removeMember(myParticipant.id)
      toast.success('You left the group')
      onClose()
      onLeft?.()
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave group')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Group Settings" size="lg">
      {/* Rename (admin) */}
      {isAdmin && (
        <div className="mb-6">
          <label className="block text-sm font-semibold text-ktip-sand-900 mb-2">Group name</label>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <Button onClick={handleRename} disabled={loading || !name.trim()} size="sm">
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Add members (admin) */}
      {isAdmin && (
        <div className="mb-6">
          <label className="block text-sm font-semibold text-ktip-sand-900 mb-2">Add members</label>
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search users by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-semibold rounded-lg hover:bg-ktip-ocean-700 transition-colors disabled:opacity-50"
            >
              Search
            </button>
          </div>
          {results.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {results.map((user) => (
                <div key={user.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium text-ktip-sand-900 truncate">
                    {user.display_name || 'Unknown User'}
                  </span>
                  <button
                    onClick={() => handleAdd(user.id)}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <UserPlus size={14} />
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member list */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-ktip-sand-900 mb-2">
          Members ({participants.length})
        </label>
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {participants.map((participant) => {
            const pname = participant.user?.display_name || 'Unknown User'
            return (
              <div key={participant.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 ${generateAvatarColor(pname)}`}
                  >
                    {getInitials(pname)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ktip-sand-900 truncate">{pname}</p>
                    <p className="text-xs text-gray-500 capitalize">{participant.role}</p>
                  </div>
                </div>
                {isAdmin && participant.user_id !== auth.user?.id && (
                  <button
                    onClick={() => handleRemove(participant.id)}
                    disabled={loading}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    aria-label={`Remove ${pname}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Leave */}
      <button
        onClick={handleLeave}
        disabled={loading}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
      >
        <LogOut size={16} />
        Leave group
      </button>
    </Modal>
  )
}
