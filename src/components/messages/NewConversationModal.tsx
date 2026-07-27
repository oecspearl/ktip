import { createSignal, Show, For } from 'solid-js'
import { Search } from 'lucide-solid'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { useSearchUsers, useCreateConversation } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import type { Profile } from '../../types'
import { getInitials, generateAvatarColor, debounce } from '../../lib/utils'
import { ROLE_LABELS } from '../../lib/constants'

interface NewConversationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (conversationId: string) => void
}

export function NewConversationModal(props: NewConversationModalProps) {
  const auth = useAuth()
  const { searchUsers, loading: searchLoading } = useSearchUsers()
  const { createConversation, loading: createLoading } = useCreateConversation()

  const [searchQuery, setSearchQuery] = createSignal('')
  const [results, setResults] = createSignal<Profile[]>([])
  const [error, setError] = createSignal('')

  const doSearch = debounce(async (query: string) => {
    if (!query.trim() || !auth.user()) {
      setResults([])
      return
    }
    try {
      const users = await searchUsers(query.trim(), auth.user()!.id)
      setResults(users)
    } catch {
      setResults([])
    }
  }, 300)

  const handleInput = (value: string) => {
    setSearchQuery(value)
    doSearch(value)
  }

  const handleSelectUser = async (userId: string) => {
    if (!auth.user()) return
    setError('')

    try {
      const conversationId = await createConversation(auth.user()!.id, userId)
      props.onCreated(conversationId)
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation')
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="New Conversation"
      description="Search for a user to start messaging"
      size="lg"
    >
      <div class="space-y-4">
        <Input
          value={searchQuery()}
          onInput={(e) => handleInput(e.currentTarget.value)}
          placeholder="Search by name..."
          icon={<Search size={18} />}
          fullWidth
        />

        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>

        <Show when={searchLoading()}>
          <div class="text-center py-4">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-ktip-ocean-500 mx-auto" />
          </div>
        </Show>

        <Show when={results().length}>
          <div class="max-h-64 overflow-y-auto space-y-1">
            <For each={results()}>
              {(user) => {
                const name = user.display_name || 'Unknown User'
                return (
                  <button
                    class="w-full text-left p-3 rounded-xl hover:bg-ktip-sand-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                    onClick={() => handleSelectUser(user.id)}
                    disabled={createLoading()}
                  >
                    <div
                      class={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(name)}`}
                    >
                      {getInitials(name)}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-ktip-sand-900 text-sm truncate">{name}</p>
                      <Show when={user.roles?.length}>
                        <p class="text-xs text-ktip-sand-500">
                          {user.roles.map((r) => ROLE_LABELS[r] || r).join(', ')}
                        </p>
                      </Show>
                    </div>
                  </button>
                )
              }}
            </For>
          </div>
        </Show>

        <Show when={searchQuery().trim() && !searchLoading() && !results().length}>
          <p class="text-sm text-ktip-sand-500 text-center py-4">No users found</p>
        </Show>
      </div>
    </Modal>
  )
}
