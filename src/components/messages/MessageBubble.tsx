import type { Message } from '../../types'
import { formatRelativeTime, getInitials, generateAvatarColor } from '../../lib/utils'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const senderName = message.sender?.display_name || 'Unknown'

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar for other users */}
        {!isOwn && (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 mt-1 ${generateAvatarColor(senderName)}`}
          >
            {getInitials(senderName)}
          </div>
        )}

        <div>
          {/* Sender name for other users */}
          {!isOwn && (
            <p className="text-xs text-ktip-sand-500 mb-1 ml-1">{senderName}</p>
          )}

          {/* Message bubble */}
          <div
            className={`px-4 py-2.5 ${
              isOwn
                ? 'bg-ktip-ocean-500 text-white rounded-2xl rounded-br-md'
                : 'bg-ktip-cream border border-ktip-sand-200 text-ktip-sand-900 rounded-2xl rounded-bl-md'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          </div>

          {/* Timestamp */}
          <p
            className={`text-xs text-ktip-sand-400 mt-1 ${
              isOwn ? 'text-right mr-1' : 'ml-1'
            }`}
          >
            {formatRelativeTime(message.created_at)}
          </p>
        </div>
      </div>
    </div>
  )
}
