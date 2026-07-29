import { Trash2 } from 'lucide-react'
import { ReportButton } from '../moderation/ReportButton'
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

export function ReplyItem({ reply, isAuthor, onDelete }: ReplyItemProps) {
  const authorName = reply.author?.display_name || 'Unknown User'

  return (
    <div className="py-4 border-b border-ktip-sand-100 last:border-b-0">
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(authorName)}`}
        >
          {getInitials(authorName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-ktip-sand-900 text-sm">
              {authorName}
            </span>
            <span className="text-xs text-ktip-sand-400">
              {formatRelativeTime(reply.created_at)}
            </span>
          </div>
          <p className="text-ktip-sand-700 text-sm whitespace-pre-wrap">
            {reply.content}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ReportButton
            targetType="forum_reply"
            targetId={reply.id}
            targetAuthorId={reply.author_id}
            contentSnapshot={reply.content}
            targetLabel="this reply"
          />
          {isAuthor && (
            <button
              onClick={onDelete}
              className="p-1 text-ktip-sand-400 hover:text-red-500 transition-colors shrink-0"
              title="Delete reply"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
