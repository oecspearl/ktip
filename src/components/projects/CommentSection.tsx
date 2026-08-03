import { useState, type FormEvent } from 'react'
import { MessageCircle, Trash2, Send } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useProjectComments, useCreateProjectComment } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { formatRelativeTime } from '../../lib/utils'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'

interface CommentSectionProps {
  projectId: string
}

export function CommentSection({ projectId }: CommentSectionProps) {
    const { t } = useLingui()
  const auth = useAuth()
  const { comments, refetch } = useProjectComments(projectId)
  const { createComment, deleteComment, loading } = useCreateProjectComment()

  const commentCount = comments?.length || 0

  const [newComment, setNewComment] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const content = newComment.trim()
    if (!content || !auth.user) return

    setError('')
    try {
      await createComment({
        project_id: projectId,
        user_id: auth.user.id,
        content,
      })
      setNewComment('')
      refetch()
    } catch (err: any) {
      setError(err.message || 'Failed to post comment')
    }
  }

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId)
      refetch()
    } catch (err: any) {
      console.error('Failed to delete comment:', err)
    }
  }

  return (
    <Card>
      <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-4">
        <Trans>Comments ({commentCount})</Trans>
      </h2>

      {/* Comment List */}
      {comments?.length ? (
        <div className="space-y-0 mb-6">
          {comments.map((comment) => {
            const authorName = comment.author?.display_name || 'Unknown User'
            const isOwn = comment.user_id === auth.user?.id
            return (
              <div key={comment.id} className="py-4 border-b border-ktip-sand-100 last:border-b-0">
                <div className="flex items-start gap-3">
                  <DiamondAvatar src={comment.author?.avatar_url} name={authorName} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-ktip-sand-900 text-sm">
                        {authorName}
                      </span>
                      <span className="text-xs text-ktip-sand-400">
                        {formatRelativeTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-ktip-sand-700 text-sm whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                  {isOwn && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1 text-ktip-sand-400 hover:text-red-500 transition-colors shrink-0"
                      title={t`Delete comment`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-ktip-sand-500">
          <MessageCircle size={48} className="mx-auto mb-3 opacity-50" />
          <p><Trans>No comments yet. Be the first to comment!</Trans></p>
        </div>
      )}

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="mt-4">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t`Write a comment...`}
          rows={3}
          fullWidth
        />
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        <div className="flex justify-end mt-3">
          <Button
            type="submit"
            size="sm"
            loading={loading}
            disabled={!newComment.trim()}
            icon={<Send size={16} />}
          >
            <Trans>Post Comment</Trans>
          </Button>
        </div>
      </form>
    </Card>
  )
}
