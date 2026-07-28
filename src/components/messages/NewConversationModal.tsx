import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, X, Users } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import {
  useSearchUsers,
  useCreateConversation,
  useCreateGroupConversation,
} from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import type { Profile } from '../../types'
import { getInitials, generateAvatarColor } from '../../lib/utils'
import { ROLE_LABELS } from '../../lib/constants'

interface NewConversationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (conversationId: string) => void
  /** 'dm' = single-select direct message, 'group' = forced group, 'auto' = group when 2+ selected */
  mode?: 'auto' | 'dm' | 'group'
}

export function NewConversationModal({ open, onClose, onCreated, mode = 'auto' }: NewConversationModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation, loading: createLoading } = useCreateConversation()
  const { createGroupConversation, loading: groupLoading } = useCreateGroupConversation()

  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile[]>([])
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const creating = createLoading || groupLoading
  const isGroup = mode === 'group' || (mode === 'auto' && selected.length > 1)

  // Clear any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  const doSearch = useCallback(
    (query: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(async () => {
        if (!query.trim() || !auth.user) {
          setResults([])
          return
        }
        try {
          const users = await searchUsers(query.trim(), auth.user.id)
          setResults(users)
        } catch {
          setResults([])
        }
      }, 300)
    },
    [auth.user, searchUsers]
  )

  const handleInput = (value: string) => {
    setSearchQuery(value)
    doSearch(value)
  }

  const toggleUser = (user: Profile) => {
    setError('')
    setSelected((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev.filter((u) => u.id !== user.id)
      // DM mode is single-select: picking someone replaces the selection
      if (mode === 'dm') return [user]
      return [...prev, user]
    })
  }

  const handleCreate = async () => {
    if (!auth.user || selected.length === 0) return
    if (mode === 'group' && selected.length < 2) {
      setError('Pick at least two people for a group')
      return
    }
    setError('')

    try {
      let conversationId: string
      if (isGroup) {
        if (!groupName.trim()) {
          setError('Give your group a name')
          return
        }
        conversationId = await createGroupConversation(
          auth.user.id,
          selected.map((u) => u.id),
          groupName
        )
      } else {
        conversationId = await createConversation(auth.user.id, selected[0].id)
      }
      setSelected([])
      setGroupName('')
      setSearchQuery('')
      setResults([])
      onCreated(conversationId)
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'group' ? 'New Group' : mode === 'dm' ? 'New Message' : 'New Conversation'}
      description={
        mode === 'group'
          ? 'Pick at least two people and name your group'
          : mode === 'dm'
            ? 'Pick a person to message'
            : 'Pick one person for a direct message, or several to start a group'
      }
      size="lg"
    >
      <div className="space-y-4">
        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200 rounded-full text-sm"
              >
                {user.display_name || 'Unknown User'}
                <button
                  onClick={() => toggleUser(user)}
                  aria-label={`Remove ${user.display_name || 'user'}`}
                  className="hover:text-ktip-ocean-900"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Group name (2+ selected) */}
        {isGroup && (
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name..."
            icon={<Users size={18} />}
            fullWidth
          />
        )}

        <Input
          value={searchQuery}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search by name..."
          icon={<Search size={18} />}
          fullWidth
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {searchLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ktip-ocean-500 mx-auto" />
          </div>
        )}

        {results.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {results.map((user) => {
              const name = user.display_name || 'Unknown User'
              const isSelected = selected.some((u) => u.id === user.id)
              return (
                <button
                  key={user.id}
                  className={`w-full text-left p-3 rounded-xl transition-colors flex items-center gap-3 disabled:opacity-50 ${
                    isSelected ? 'bg-ktip-ocean-50 border border-ktip-ocean-200' : 'hover:bg-ktip-sand-50'
                  }`}
                  onClick={() => toggleUser(user)}
                  disabled={creating}
                  aria-pressed={isSelected}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(name)}`}
                  >
                    {getInitials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ktip-sand-900 text-sm truncate">{name}</p>
                    {user.roles?.length ? (
                      <p className="text-xs text-ktip-sand-500">
                        {user.roles.map((r) => ROLE_LABELS[r] || r).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  {isSelected && <span className="text-xs font-bold text-ktip-ocean-600">Selected</span>}
                </button>
              )
            })}
          </div>
        )}

        {searchQuery.trim() && !searchLoading && !results.length && (
          <p className="text-sm text-ktip-sand-500 text-center py-4">No users found</p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleCreate}
            disabled={
              (mode === 'group' ? selected.length < 2 : selected.length === 0) ||
              creating ||
              (isGroup && !groupName.trim())
            }
            loading={creating}
          >
            {isGroup ? `Create Group (${selected.length + 1})` : 'Start Conversation'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
