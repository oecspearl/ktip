import { createSignal, Show, For } from 'solid-js'
import type { Editor } from '@tiptap/core'
import { Modal } from '../../ui/Modal'
import { useAuth } from '../../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../../hooks/useMessages'
import { supabase } from '../../../lib/supabase'
import { debounce, getInitials, generateAvatarColor } from '../../../lib/utils'
import { Search, X, Send, Check } from 'lucide-solid'
import type { Profile } from '../../../types'

interface ShareDocumentModalProps {
  open: boolean
  onClose: () => void
  editor: () => Editor | undefined
  documentId?: () => string | undefined
  documentTitle?: () => string
}

export function ShareDocumentModal(props: ShareDocumentModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()

  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<Profile[]>([])
  const [selected, setSelected] = createSignal<Profile[]>([])
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [sending, setSending] = createSignal(false)
  const [success, setSuccess] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const displayName = () => {
    const profile = auth.profile()
    if (profile?.display_name) return profile.display_name
    const email = auth.user()?.email
    if (email) return email.split('@')[0]
    return 'Someone'
  }

  const debouncedSearch = debounce(async (q: string) => {
    const userId = auth.user()?.id
    if (!q.trim() || !userId) {
      setResults([])
      setShowDropdown(false)
      return
    }
    try {
      const res = await searchUsers(q, userId)
      const selectedIds = new Set(selected().map((u) => u.id))
      setResults(res.filter((r) => !selectedIds.has(r.id)))
      setShowDropdown(true)
    } catch {
      setResults([])
    }
  }, 300)

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
    const currentUserId = auth.user()?.id
    const ed = props.editor()
    if (!currentUserId || selected().length === 0 || !ed) return

    setSending(true)
    setError(null)

    try {
      // Get preview text (first 500 chars)
      const fullText = ed.state.doc.textContent
      const preview = fullText.length > 500 ? fullText.slice(0, 500) + '...' : fullText
      const docId = props.documentId?.()
      const editorLink = docId
        ? `${window.location.origin}/collaborate/document/${docId}`
        : `${window.location.origin}/collaborate/documents`
      const titleText = props.documentTitle?.() || 'a document'

      const message = `📄 ${displayName()} shared "${titleText}" with you:\n\n---\n${preview}\n---\n\nOpen the document:\n${editorLink}`

      for (const user of selected()) {
        // Grant access via document_shares table
        if (docId) {
          await (supabase.from('document_shares') as any).upsert({
            document_id: docId,
            shared_with: user.id,
            shared_by: currentUserId,
          }, { onConflict: 'document_id,shared_with' }).then(() => {}, () => {})
        }

        const conversationId = await createConversation(currentUserId, user.id)
        await sendMessage({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: message,
        })

        // Send in-app notification
        await (supabase.from('notifications') as any).insert({
          user_id: user.id,
          type: 'document_share',
          title: 'Document Shared',
          body: `${displayName()} shared "${titleText}" with you`,
          link: docId ? `/collaborate/document/${docId}` : '/collaborate/documents',
        }).then(() => {}, () => {})
      }

      setSuccess(true)
      setSelected([])
      setTimeout(() => {
        setSuccess(false)
        props.onClose()
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'Failed to share document.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Share Document" size="md">
      <div class="space-y-4">
        {/* Search */}
        <div class="relative">
          <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
          <input
            type="text"
            placeholder="Search users to share with..."
            value={query()}
            onInput={(e) => handleInput(e.currentTarget.value)}
            onFocus={() => { if (results().length > 0) setShowDropdown(true) }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            class="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 bg-ktip-sand-50/50 focus:bg-white rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
          <Show when={searchLoading()}>
            <div class="absolute right-3 top-1/2 -translate-y-1/2">
              <div class="w-4 h-4 border-2 border-ktip-ocean-300 border-t-transparent rounded-full animate-spin" />
            </div>
          </Show>
        </div>

        {/* Dropdown */}
        <Show when={showDropdown() && results().length > 0}>
          <div class="border border-ktip-sand-200 rounded-lg bg-white shadow-medium max-h-40 overflow-y-auto">
            <For each={results()}>
              {(user) => {
                const color = generateAvatarColor(user.display_name || user.id)
                const initials = getInitials(user.display_name || 'U')
                return (
                  <button
                    type="button"
                    onClick={() => selectUser(user)}
                    class="w-full flex items-center gap-3 px-3 py-2 hover:bg-ktip-sand-50 transition-colors text-left"
                  >
                    <div
                      class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ "background-color": color }}
                    >
                      {initials}
                    </div>
                    <span class="text-sm text-ktip-sand-800 truncate flex-1">
                      {user.display_name || 'Unnamed User'}
                    </span>
                  </button>
                )
              }}
            </For>
          </div>
        </Show>

        {/* Selected users */}
        <Show when={selected().length > 0}>
          <div class="flex flex-wrap gap-2">
            <For each={selected()}>
              {(user) => {
                const color = generateAvatarColor(user.display_name || user.id)
                return (
                  <span
                    class="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-medium text-white"
                    style={{ "background-color": color }}
                  >
                    <span class="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                      {getInitials(user.display_name || 'U')}
                    </span>
                    {user.display_name || 'User'}
                    <button
                      type="button"
                      onClick={() => removeUser(user.id)}
                      class="ml-0.5 hover:bg-white/20 rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              }}
            </For>
          </div>
        </Show>

        {/* Share button */}
        <Show when={selected().length > 0}>
          <button
            type="button"
            onClick={handleShare}
            disabled={sending()}
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            <Show when={sending()} fallback={<Send size={16} />}>
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </Show>
            {sending() ? 'Sharing...' : `Share with ${selected().length} user${selected().length > 1 ? 's' : ''}`}
          </button>
        </Show>

        {/* Success */}
        <Show when={success()}>
          <div class="flex items-center gap-2 text-sm text-green-600">
            <Check size={16} />
            <span>Document shared successfully!</span>
          </div>
        </Show>

        {/* Error */}
        <Show when={error()}>
          <div class="flex items-center gap-2 text-sm text-red-600">
            <X size={16} />
            <span>{error()}</span>
          </div>
        </Show>

        <p class="text-xs text-ktip-sand-400">
          Selected users will receive a direct message with a preview of your document.
        </p>
      </div>
    </Modal>
  )
}
