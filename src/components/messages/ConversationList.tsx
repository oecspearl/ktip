import { Show, For } from 'solid-js'
import { Plus, MessageSquare } from 'lucide-solid'
import { Button } from '../ui/Button'
import type { Conversation } from '../../types'
import { formatRelativeTime, getInitials, generateAvatarColor } from '../../lib/utils'

interface ConversationListProps {
  conversations: Conversation[] | undefined
  activeConversationId: string | null
  onSelect: (id: string) => void
  currentUserId: string
  onNewConversation: () => void
}

export function ConversationList(props: ConversationListProps) {
  const getOtherParticipant = (conversation: Conversation) => {
    const other = conversation.participants?.find(
      (p) => p.user_id !== props.currentUserId
    )
    return other?.user
  }

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="p-4 border-b border-ktip-sand-200">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-display font-bold text-ktip-sand-900">Messages</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onNewConversation}
            icon={<Plus size={18} />}
          >
            New
          </Button>
        </div>
      </div>

      {/* Conversation list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={props.conversations?.length}
          fallback={
            <div class="text-center py-12 px-4 text-ktip-sand-500">
              <MessageSquare size={40} class="mx-auto mb-3 opacity-50" />
              <p class="text-sm">No conversations yet.</p>
              <p class="text-xs mt-1">Start a new conversation!</p>
            </div>
          }
        >
          <For each={props.conversations}>
            {(conversation) => {
              const other = () => getOtherParticipant(conversation)
              const otherName = () => other()?.display_name || 'Unknown User'
              const isActive = () => props.activeConversationId === conversation.id

              return (
                <button
                  class={`w-full text-left p-4 border-b border-ktip-sand-100 hover:bg-ktip-sand-50 transition-colors ${
                    isActive() ? 'bg-ktip-ocean-50 border-l-2 border-l-ktip-ocean-500' : ''
                  }`}
                  onClick={() => props.onSelect(conversation.id)}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(otherName())}`}
                    >
                      {getInitials(otherName())}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between">
                        <span class="font-medium text-ktip-sand-900 text-sm truncate">
                          {otherName()}
                        </span>
                        <span class="text-xs text-ktip-sand-400 shrink-0 ml-2">
                          {formatRelativeTime(conversation.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}
