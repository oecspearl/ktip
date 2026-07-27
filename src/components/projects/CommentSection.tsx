import { createSignal, Show, For } from 'solid-js'
import { MessageCircle, Trash2, Send } from 'lucide-solid'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useProjectComments, useCreateProjectComment } from '../../hooks/useProjects'
import { useAuth } from '../../contexts/AuthContext'
import { formatRelativeTime, getInitials, generateAvatarColor } from '../../lib/utils'

interface CommentSectionProps {
  projectId: string
}

export function CommentSection(props: CommentSectionProps) {
  const auth = useAuth()
  const { comments, refetch } = useProjectComments(() => props.projectId)
  const { createComment, deleteComment, loading } = useCreateProjectComment()

  const [newComment, setNewComment] = createSignal('')
  const [error, setError] = createSignal('')

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const content = newComment().trim()
    if (!content || !auth.user()) return

    setError('')
    try {
      await createComment({
        project_id: props.projectId,
        user_id: auth.user()!.id,
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
      <h2 class="text-2xl font-display font-bold text-ktip-sand-900 mb-4">
        Comments ({comments()?.length || 0})
      </h2>

      {/* Comment List */}
      <Show
        when={comments()?.length}
        fallback={
          <div class="text-center py-8 text-ktip-sand-500">
            <MessageCircle size={48} class="mx-auto mb-3 opacity-50" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        }
      >
        <div class="space-y-0 mb-6">
          <For each={comments()}>
            {(comment) => {
              const authorName = comment.author?.display_name || 'Unknown User'
              const isOwn = comment.user_id === auth.user()?.id
              return (
                <div class="py-4 border-b border-ktip-sand-100 last:border-b-0">
                  <div class="flex items-start gap-3">
                    <div
                      class={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0 ${generateAvatarColor(authorName)}`}
                    >
                      {getInitials(authorName)}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium text-ktip-sand-900 text-sm">
                          {authorName}
                        </span>
                        <span class="text-xs text-ktip-sand-400">
                          {formatRelativeTime(comment.created_at)}
                        </span>
                      </div>
                      <p class="text-ktip-sand-700 text-sm whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                    <Show when={isOwn}>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        class="p-1 text-ktip-sand-400 hover:text-red-500 transition-colors shrink-0"
                        title="Delete comment"
                      >
                        <Trash2 size={16} />
                      </button>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </Show>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} class="mt-4">
        <Textarea
          value={newComment()}
          onInput={(e) => setNewComment(e.currentTarget.value)}
          placeholder="Write a comment..."
          rows={3}
          fullWidth
        />
        <Show when={error()}>
          <p class="text-sm text-red-600 mt-1">{error()}</p>
        </Show>
        <div class="flex justify-end mt-3">
          <Button
            type="submit"
            size="sm"
            loading={loading()}
            disabled={!newComment().trim()}
            icon={<Send size={16} />}
          >
            Post Comment
          </Button>
        </div>
      </form>
    </Card>
  )
}
