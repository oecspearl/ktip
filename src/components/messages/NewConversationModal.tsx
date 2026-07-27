import { useState, useRef, useCallback, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { useSearchUsers, useCreateConversation } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import type { Profile } from '../../types'
import { getInitials, generateAvatarColor } from '../../lib/utils'
import { ROLE_LABELS } from '../../lib/constants'

interface NewConversationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (conversationId: string) => void
}

export function NewConversationModal({ open, onClose, onCreated }: NewConversationModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation, loading: createLoading } = useCreateConversation()

  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [error, setError] = useState('')

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleSelectUser = async (userId: string) => {
    if (!auth.user) return
    setError('')

    try {
      const conversationId = await createConversation(auth.user.id, userId)
      onCreated(conversationId)
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Conversation"
      description="Search for a user to start messaging"
      size="lg"
    >
      <div className="space-y-4">
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
              return (
                <button
                  key={user.id}
                  className="w-full text-left p-3 rounded-xl hover:bg-ktip-sand-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                  onClick={() => handleSelectUser(user.id)}
                  disabled={createLoading}
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
                </button>
              )
            })}
          </div>
        )}

        {searchQuery.trim() && !searchLoading && !results.length && (
          <p className="text-sm text-ktip-sand-500 text-center py-4">No users found</p>
        )}
      </div>
    </Modal>
  )
}
