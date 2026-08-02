import type { Message } from '../../types'
import { formatRelativeTime } from '../../lib/utils'
import { ReportButton } from '../moderation/ReportButton'
import { DiamondAvatar } from '../ui/DiamondAvatar'

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
          <DiamondAvatar
            src={message.sender?.avatar_url}
            name={senderName}
            size={32}
            className="mt-1"
          />
        )}

        <div className="group">
          {/* Sender name for other users */}
          {!isOwn && (
            <div className="flex items-center gap-1 mb-1 ml-1">
              <p className="text-xs text-ktip-sand-500">{senderName}</p>
              <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <ReportButton
                  targetType="message"
                  targetId={message.id}
                  targetAuthorId={message.sender_id}
                  contentSnapshot={message.content}
                  targetLabel="this message"
                  className="!p-0.5"
                />
              </span>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={`px-4 py-2.5 ${
              isOwn
                ? 'bg-ktip-ocean-500 dark:bg-ktip-ocean-200 text-white rounded-2xl rounded-br-md'
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
