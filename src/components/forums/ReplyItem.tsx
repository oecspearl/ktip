import { Trash2 } from 'lucide-react'
import { ReportButton } from '../moderation/ReportButton'
import type { ForumReply } from '../../types'
import { formatRelativeTime } from '../../lib/utils'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { useLingui } from '@lingui/react/macro'

interface ReplyItemProps {
  reply: ForumReply
  isAuthor: boolean
  onDelete: () => void
}

export function ReplyItem({ reply, isAuthor, onDelete }: ReplyItemProps) {
    const { t } = useLingui()
  const authorName = reply.author?.display_name || 'Unknown User'

  return (
    <div className="py-4 border-b border-ktip-sand-100 last:border-b-0">
      <div className="flex items-start gap-3">
        <DiamondAvatar src={reply.author?.avatar_url} name={authorName} size={36} />
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
              title={t`Delete reply`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
