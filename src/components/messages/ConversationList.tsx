import { Plus, MessageSquare, Users } from 'lucide-react'
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

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  currentUserId,
  onNewConversation,
}: ConversationListProps) {
  const getOtherParticipant = (conversation: Conversation) => {
    const other = conversation.participants?.find(
      (p) => p.user_id !== currentUserId
    )
    return other?.user
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-ktip-sand-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">Messages</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewConversation}
            icon={<Plus size={18} />}
          >
            New
          </Button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations?.length ? (
          conversations.map((conversation) => {
            const other = getOtherParticipant(conversation)
            const displayName = conversation.is_group
              ? conversation.name || 'Group'
              : other?.display_name || 'Unknown User'
            const isActive = activeConversationId === conversation.id

            return (
              <button
                key={conversation.id}
                className={`w-full text-left p-4 border-b border-ktip-sand-100 hover:bg-ktip-sand-50 transition-colors ${
                  isActive ? 'bg-ktip-ocean-50 border-l-2 border-l-ktip-ocean-500' : ''
                }`}
                onClick={() => onSelect(conversation.id)}
              >
                <div className="flex items-center gap-3">
                  {conversation.is_group ? (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-ktip-ocean-600 text-white shrink-0">
                      <Users size={18} />
                    </div>
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(displayName)}`}
                    >
                      {getInitials(displayName)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ktip-sand-900 text-sm truncate">
                        {displayName}
                      </span>
                      <span className="text-xs text-ktip-sand-400 shrink-0 ml-2">
                        {formatRelativeTime(conversation.updated_at)}
                      </span>
                    </div>
                    {conversation.is_group && (
                      <p className="text-xs text-ktip-sand-400">
                        {conversation.participants?.length || 0} members
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        ) : (
          <div className="text-center py-12 px-4 text-ktip-sand-500">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No conversations yet.</p>
            <p className="text-xs mt-1">Start a new conversation!</p>
          </div>
        )}
      </div>
    </div>
  )
}
