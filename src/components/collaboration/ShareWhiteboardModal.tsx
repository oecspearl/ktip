import { useMemo, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../hooks/useMessages'
import { supabase } from '../../lib/supabase'
import { sendNotification } from '../../lib/notify'
import { debounce, getInitials, generateAvatarColor } from '../../lib/utils'
import { Search, X, Send, Check, Eye, Pencil } from 'lucide-react'
import type { Profile } from '../../types'

type Permission = 'view' | 'edit'

interface ShareWhiteboardModalProps {
  open: boolean
  onClose: () => void
  whiteboardId?: string
  whiteboardTitle?: string
}

export function ShareWhiteboardModal({ open, onClose, whiteboardId, whiteboardTitle }: ShareWhiteboardModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile[]>([])
  const [permissions, setPermissions] = useState<Record<string, Permission>>({})
  const [showDropdown, setShowDropdown] = useState(false)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayName = () => {
    const profile = auth.profile
    if (profile?.display_name) return profile.display_name
    const email = auth.user?.email
    if (email) return email.split('@')[0]
    return 'Someone'
  }

  // Refs keep the debounced callback (created once) reading fresh values.
  const authRef = useRef(auth)
  authRef.current = auth
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const searchUsersRef = useRef(searchUsers)
  searchUsersRef.current = searchUsers

  const debouncedSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        const userId = authRef.current.user?.id
        if (!q.trim() || !userId) {
          setResults([])
          setShowDropdown(false)
          return
        }
        try {
          const res = await searchUsersRef.current(q, userId)
          const selectedIds = new Set(selectedRef.current.map((u) => u.id))
          setResults(res.filter((r) => !selectedIds.has(r.id)))
          setShowDropdown(true)
        } catch {
          setResults([])
        }
      }, 300),
    []
  )

  const handleInput = (value: string) => {
    setQuery(value)
    debouncedSearch(value)
  }

  const selectUser = (user: Profile) => {
    setSelected((prev) => [...prev, user])
    setPermissions((prev) => ({ ...prev, [user.id]: 'view' }))
    setResults((prev) => prev.filter((r) => r.id !== user.id))
    setQuery('')
    setShowDropdown(false)
  }

  const removeUser = (userId: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== userId))
    setPermissions((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }

  const togglePermission = (userId: string) => {
    setPermissions((prev) => ({
      ...prev,
      [userId]: prev[userId] === 'edit' ? 'view' : 'edit',
    }))
  }

  const handleShare = async () => {
    const currentUserId = auth.user?.id
    const wbId = whiteboardId
    if (!currentUserId || selected.length === 0) return

    setSending(true)
    setError(null)

    try {
      const whiteboardLink = wbId
        ? `${window.location.origin}/collaborate/whiteboard/${wbId}`
        : `${window.location.origin}/collaborate/whiteboards`
      const titleText = whiteboardTitle || 'a whiteboard'

      for (const user of selected) {
        const perm = permissions[user.id] || 'view'
        const permLabel = perm === 'edit' ? 'edit' : 'view'
        const message = `${displayName()} shared the whiteboard "${titleText}" with you (${permLabel} access).\n\nOpen the whiteboard:\n${whiteboardLink}`
        // Grant access via whiteboard_shares table
        if (wbId) {
          const { error: shareError } = await (supabase.from('whiteboard_shares') as any).insert({
            whiteboard_id: wbId,
            shared_with: user.id,
            shared_by: currentUserId,
            permission: perm,
          })
          if (shareError) {
            // Ignore duplicate (already shared), log anything else
            if (shareError.code !== '23505') {
              console.error('Share insert error:', shareError)
            }
          }
        }

        const conversationId = await createConversation(currentUserId, user.id)
        await sendMessage({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: message,
        })

        // Send in-app notification (RPC enforces recipient preferences)
        sendNotification({
          userId: user.id,
          type: 'whiteboard_share',
          title: 'Whiteboard Shared',
          body: `${displayName()} shared "${titleText}" with you`,
          link: wbId ? `/collaborate/whiteboard/${wbId}` : '/collaborate/whiteboards',
        })
      }

      setSuccess(true)
      setSelected([])
      setTimeout(() => {
        setSuccess(false)
        onClose()
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'Failed to share whiteboard.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Whiteboard" size="md">
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
          <input
            type="text"
            placeholder="Search users to share with..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
          {searchLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-ktip-ocean-300 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="border border-ktip-sand-200 rounded-lg bg-white shadow-medium max-h-40 overflow-y-auto">
            {results.map((user) => {
              const color = generateAvatarColor(user.display_name || user.id)
              const initials = getInitials(user.display_name || 'U')
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ktip-sand-50 transition-colors text-left"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {initials}
                  </div>
                  <span className="text-sm text-ktip-sand-800 truncate flex-1">
                    {user.display_name || 'Unnamed User'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Selected users */}
        {selected.length > 0 && (
          <div className="space-y-2">
            {selected.map((user) => {
              const color = generateAvatarColor(user.display_name || user.id)
              const perm = permissions[user.id] || 'view'
              return (
                <div key={user.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ktip-sand-50 border border-ktip-sand-200">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {getInitials(user.display_name || 'U')}
                  </div>
                  <span className="text-sm text-ktip-sand-800 flex-1 truncate">
                    {user.display_name || 'User'}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePermission(user.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      perm === 'edit'
                        ? 'bg-ktip-ocean-100 text-ktip-ocean-700 hover:bg-ktip-ocean-200'
                        : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
                    }`}
                    title={perm === 'edit' ? 'Can edit — click to change to view only' : 'View only — click to allow editing'}
                  >
                    {perm === 'edit' ? (
                      <>
                        <Pencil size={12} /> Edit
                      </>
                    ) : (
                      <>
                        <Eye size={12} /> View
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeUser(user.id)}
                    className="text-ktip-sand-400 hover:text-red-500 transition-colors p-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Share button */}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={handleShare}
            disabled={sending}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {sending ? 'Sharing...' : `Share with ${selected.length} user${selected.length > 1 ? 's' : ''}`}
          </button>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check size={16} />
            <span>Whiteboard shared successfully!</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <X size={16} />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-ktip-sand-400">
          Selected users will receive a message with a link to this whiteboard.
        </p>
      </div>
    </Modal>
  )
}
