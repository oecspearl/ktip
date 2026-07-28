import { useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Modal } from '../../ui/Modal'
import { useAuth } from '../../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../../hooks/useMessages'
import { supabase } from '../../../lib/supabase'
import { sendNotification } from '../../../lib/notify'
import { debounce, getInitials, generateAvatarColor } from '../../../lib/utils'
import { Search, X, Send, Check } from 'lucide-react'
import type { Profile } from '../../../types'

interface ShareDocumentModalProps {
  open: boolean
  onClose: () => void
  editor: Editor | null
  documentId?: string
  documentTitle?: string
}

export function ShareDocumentModal({ open, onClose, editor, documentId, documentTitle }: ShareDocumentModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile[]>([])
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
    setResults((prev) => prev.filter((r) => r.id !== user.id))
    setQuery('')
    setShowDropdown(false)
  }

  const removeUser = (userId: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== userId))
  }

  const handleShare = async () => {
    const currentUserId = auth.user?.id
    const ed = editor
    if (!currentUserId || selected.length === 0 || !ed) return

    setSending(true)
    setError(null)

    try {
      // Get preview text (first 500 chars)
      const fullText = ed.state.doc.textContent
      const preview = fullText.length > 500 ? fullText.slice(0, 500) + '...' : fullText
      const docId = documentId
      const editorLink = docId
        ? `${window.location.origin}/collaborate/document/${docId}`
        : `${window.location.origin}/collaborate/documents`
      const titleText = documentTitle || 'a document'

      const message = `📄 ${displayName()} shared "${titleText}" with you:\n\n---\n${preview}\n---\n\nOpen the document:\n${editorLink}`

      for (const user of selected) {
        // Grant access via document_shares table
        if (docId) {
          await (supabase.from('document_shares') as any)
            .upsert(
              {
                document_id: docId,
                shared_with: user.id,
                shared_by: currentUserId,
              },
              { onConflict: 'document_id,shared_with' }
            )
            .then(() => {}, () => {})
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
          type: 'document_share',
          title: 'Document Shared',
          body: `${displayName()} shared "${titleText}" with you`,
          link: docId ? `/collaborate/document/${docId}` : '/collaborate/documents',
        })
      }

      setSuccess(true)
      setSelected([])
      setTimeout(() => {
        setSuccess(false)
        onClose()
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'Failed to share document.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Document" size="md">
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
            className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
          {searchLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-ktip-ocean-300 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="border border-ktip-sand-200 rounded-lg bg-ktip-cream shadow-medium max-h-40 overflow-y-auto">
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
          <div className="flex flex-wrap gap-2">
            {selected.map((user) => {
              const color = generateAvatarColor(user.display_name || user.id)
              return (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: color }}
                >
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    {getInitials(user.display_name || 'U')}
                  </span>
                  {user.display_name || 'User'}
                  <button
                    type="button"
                    onClick={() => removeUser(user.id)}
                    className="ml-0.5 hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X size={12} />
                  </button>
                </span>
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
          <div className="flex items-center gap-2 text-sm text-ktip-tropical-700">
            <Check size={16} />
            <span>Document shared successfully!</span>
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
          Selected users will receive a direct message with a preview of your document.
        </p>
      </div>
    </Modal>
  )
}
