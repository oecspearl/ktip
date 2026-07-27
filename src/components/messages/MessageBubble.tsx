import { Show } from 'solid-js'
import type { Message } from '../../types'
import { formatRelativeTime, getInitials, generateAvatarColor } from '../../lib/utils'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

export function MessageBubble(props: MessageBubbleProps) {
  const senderName = () => props.message.sender?.display_name || 'Unknown'

  return (
    <div class={`flex ${props.isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div class={`flex gap-2 max-w-[75%] ${props.isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar for other users */}
        <Show when={!props.isOwn}>
          <div
            class={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 mt-1 ${generateAvatarColor(senderName())}`}
          >
            {getInitials(senderName())}
          </div>
        </Show>

        <div>
          {/* Sender name for other users */}
          <Show when={!props.isOwn}>
            <p class="text-xs text-ktip-sand-500 mb-1 ml-1">{senderName()}</p>
          </Show>

          {/* Message bubble */}
          <div
            class={`px-4 py-2.5 ${
              props.isOwn
                ? 'bg-ktip-ocean-500 text-white rounded-2xl rounded-br-md'
                : 'bg-white border border-ktip-sand-200 text-ktip-sand-900 rounded-2xl rounded-bl-md'
            }`}
          >
            <p class="text-sm whitespace-pre-wrap break-words">{props.message.content}</p>
          </div>

          {/* Timestamp */}
          <p
            class={`text-xs text-ktip-sand-400 mt-1 ${
              props.isOwn ? 'text-right mr-1' : 'ml-1'
            }`}
          >
            {formatRelativeTime(props.message.created_at)}
          </p>
        </div>
      </div>
    </div>
  )
}
