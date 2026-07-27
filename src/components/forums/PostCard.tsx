import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import type { ForumPost } from '../../types'
import { MessageCircle, Pin } from 'lucide-solid'
import {
  formatRelativeTime,
  truncate,
  getInitials,
  generateAvatarColor,
} from '../../lib/utils'

interface PostCardProps {
  post: ForumPost
  boardSlug: string
}

export function PostCard(props: PostCardProps) {
  const authorName = () => props.post.author?.display_name || 'Unknown User'

  return (
    <A href={`/forums/${props.boardSlug}/${props.post.id}`}>
      <Card hover>
        <div class="flex items-start gap-3">
          {/* Author avatar */}
          <div
            class={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(authorName())}`}
          >
            {getInitials(authorName())}
          </div>

          <div class="flex-1 min-w-0">
            {/* Title row */}
            <div class="flex items-center gap-2 mb-1">
              <Show when={props.post.is_pinned}>
                <Pin size={14} class="text-ktip-ocean-500 shrink-0" />
              </Show>
              <h3 class="font-display font-bold text-ktip-sand-900 truncate">
                {props.post.title}
              </h3>
              <Show when={props.post.is_pinned}>
                <Badge variant="warning" size="sm">Pinned</Badge>
              </Show>
            </div>

            {/* Content preview */}
            <p class="text-sm text-ktip-sand-600 mb-3 line-clamp-2">
              {truncate(props.post.content, 200)}
            </p>

            {/* Footer */}
            <div class="flex items-center justify-between text-xs text-ktip-sand-400">
              <span>
                by <span class="font-medium text-ktip-sand-600">{authorName()}</span>
              </span>
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1">
                  <MessageCircle size={14} />
                  Replies
                </span>
                <span>{formatRelativeTime(props.post.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </A>
  )
}
