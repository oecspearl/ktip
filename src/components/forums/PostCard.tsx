import { Link } from 'react-router'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import type { ForumPost } from '../../types'
import { forumPostPath } from '../../lib/slug'
import { MessageCircle, Pin } from 'lucide-react'
import { formatRelativeTime, truncate } from '../../lib/utils'
import { DiamondAvatar } from '../ui/DiamondAvatar'

interface PostCardProps {
  post: ForumPost
  boardSlug: string
}

export function PostCard({ post, boardSlug }: PostCardProps) {
  const authorName = post.author?.display_name || 'Unknown User'

  return (
    <Link to={forumPostPath(boardSlug, post)}>
      <Card hover>
        <div className="flex items-start gap-3">
          {/* Author avatar */}
          <DiamondAvatar src={post.author?.avatar_url} name={authorName} size={40} />

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-1">
              {post.is_pinned && (
                <Pin size={14} className="text-ktip-ocean-500 shrink-0" />
              )}
              <h3 className="font-display font-bold text-ktip-sand-900 truncate">
                {post.title}
              </h3>
              {post.is_pinned && (
                <Badge variant="warning" size="sm">Pinned</Badge>
              )}
            </div>

            {/* Content preview */}
            <p className="text-sm text-ktip-sand-600 mb-3 line-clamp-2">
              {truncate(post.content, 200)}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-ktip-sand-400">
              <span>
                by <span className="font-medium text-ktip-sand-600">{authorName}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <MessageCircle size={14} />
                  Replies
                </span>
                <span>{formatRelativeTime(post.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
