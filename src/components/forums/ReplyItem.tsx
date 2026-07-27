import { Show } from 'solid-js'
import { Trash2 } from 'lucide-solid'
import type { ForumReply } from '../../types'
import {
  formatRelativeTime,
  getInitials,
  generateAvatarColor,
} from '../../lib/utils'

interface ReplyItemProps {
  reply: ForumReply
  isAuthor: boolean
  onDelete: () => void
}

export function ReplyItem(props: ReplyItemProps) {
  const authorName = () => props.reply.author?.display_name || 'Unknown User'

  return (
    <div class="py-4 border-b border-ktip-sand-100 last:border-b-0">
      <div class="flex items-start gap-3">
        <div
          class={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(authorName())}`}
        >
          {getInitials(authorName())}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium text-ktip-sand-900 text-sm">
              {authorName()}
            </span>
            <span class="text-xs text-ktip-sand-400">
              {formatRelativeTime(props.reply.created_at)}
            </span>
          </div>
          <p class="text-ktip-sand-700 text-sm whitespace-pre-wrap">
            {props.reply.content}
          </p>
        </div>
        <Show when={props.isAuthor}>
          <button
            onClick={props.onDelete}
            class="p-1 text-ktip-sand-400 hover:text-red-500 transition-colors shrink-0"
            title="Delete reply"
          >
            <Trash2 size={16} />
          </button>
        </Show>
      </div>
    </div>
  )
}
