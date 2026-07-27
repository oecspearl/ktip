import { createSignal, Show, For } from 'solid-js'
import { Modal } from '../ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useSearchUsers, useCreateConversation, useSendMessage } from '../../hooks/useMessages'
import { supabase } from '../../lib/supabase'
import { debounce, getInitials, generateAvatarColor } from '../../lib/utils'
import { Search, X, Send, Check, Eye, Pencil } from 'lucide-solid'
import type { Profile } from '../../types'

type Permission = 'view' | 'edit'

interface ShareWhiteboardModalProps {
  open: boolean
  onClose: () => void
  whiteboardId?: () => string | undefined
  whiteboardTitle?: () => string
}

export function ShareWhiteboardModal(props: ShareWhiteboardModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation } = useCreateConversation()
  const { sendMessage } = useSendMessage()

  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<Profile[]>([])
  const [selected, setSelected] = createSignal<Profile[]>([])
  const [permissions, setPermissions] = createSignal<Record<string, Permission>>({})
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
    const currentUserId = auth.user()?.id
    const wbId = props.whiteboardId?.()
    if (!currentUserId || selected().length === 0) return

    setSending(true)
    setError(null)

    try {
      const whiteboardLink = wbId
        ? `${window.location.origin}/collaborate/whiteboard/${wbId}`
        : `${window.location.origin}/collaborate/whiteboards`
      const titleText = props.whiteboardTitle?.() || 'a whiteboard'

      for (const user of selected()) {
        const perm = permissions()[user.id] || 'view'
        const permLabel = perm === 'edit' ? 'edit' : 'view'
        const message = `${displayName()} shared the whiteboard "${titleText}" with you (${permLabel} access).\n\nOpen the whiteboard:\n${whiteboardLink}`
        // Grant access via whiteboard_shares table
        if (wbId) {
          const perm = permissions()[user.id] || 'view'
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

        // Send in-app notification
        await (supabase.from('notifications') as any).insert({
          user_id: user.id,
          type: 'whiteboard_share',
          title: 'Whiteboard Shared',
          body: `${displayName()} shared "${titleText}" with you`,
          link: wbId ? `/collaborate/whiteboard/${wbId}` : '/collaborate/whiteboards',
        }).then(() => {}, () => {})
      }

      setSuccess(true)
      setSelected([])
      setTimeout(() => {
        setSuccess(false)
        props.onClose()
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'Failed to share whiteboard.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Share Whiteboard" size="md">
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
          <div class="space-y-2">
            <For each={selected()}>
              {(user) => {
                const color = generateAvatarColor(user.display_name || user.id)
                const perm = () => permissions()[user.id] || 'view'
                return (
                  <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-ktip-sand-50 border border-ktip-sand-200">
                    <div
                      class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ "background-color": color }}
                    >
                      {getInitials(user.display_name || 'U')}
                    </div>
                    <span class="text-sm text-ktip-sand-800 flex-1 truncate">
                      {user.display_name || 'User'}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePermission(user.id)}
                      class={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        perm() === 'edit'
                          ? 'bg-ktip-ocean-100 text-ktip-ocean-700 hover:bg-ktip-ocean-200'
                          : 'bg-ktip-sand-100 text-ktip-sand-600 hover:bg-ktip-sand-200'
                      }`}
                      title={perm() === 'edit' ? 'Can edit — click to change to view only' : 'View only — click to allow editing'}
                    >
                      <Show when={perm() === 'edit'} fallback={<><Eye size={12} /> View</>}>
                        <Pencil size={12} /> Edit
                      </Show>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUser(user.id)}
                      class="text-ktip-sand-400 hover:text-red-500 transition-colors p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
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
            <span>Whiteboard shared successfully!</span>
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
          Selected users will receive a message with a link to this whiteboard.
        </p>
      </div>
    </Modal>
  )
}
