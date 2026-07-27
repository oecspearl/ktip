import { createSignal, Show, For, Suspense } from 'solid-js'
import { useEventArticles, useCreateEventArticle, useUpdateEventArticle, useDeleteEventArticle } from '../../../hooks/useEventArticles'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Eye,
  EyeOff,
  X,
} from 'lucide-solid'
import { EVENT_ARTICLE_TYPE_LABELS } from '../../../lib/constants'
import { eventArticleSchema } from '../../../lib/validation'
import { format } from 'date-fns'
import type { EventArticle } from '../../../types'

interface AdminEventArticlesTabProps {
  eventId: string
}

export default function AdminEventArticlesTab(props: AdminEventArticlesTabProps) {
  const auth = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = createSignal(false)
  const [editingArticle, setEditingArticle] = createSignal<EventArticle | null>(null)
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null)

  // Form state
  const [title, setTitle] = createSignal('')
  const [content, setContent] = createSignal('')
  const [articleType, setArticleType] = createSignal('recap')
  const [isPublished, setIsPublished] = createSignal(false)
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const { articles, refetch } = useEventArticles(() => props.eventId)
  const { createArticle, loading: creating } = useCreateEventArticle()
  const { updateEventArticle, loading: updating } = useUpdateEventArticle()
  const { deleteEventArticle, loading: deletingArticle } = useDeleteEventArticle()

  const resetForm = () => {
    setTitle('')
    setContent('')
    setArticleType('recap')
    setIsPublished(false)
    setErrors({})
    setShowForm(false)
    setEditingArticle(null)
  }

  const startEdit = (article: EventArticle) => {
    setEditingArticle(article)
    setTitle(article.title)
    setContent(article.content)
    setArticleType(article.article_type)
    setIsPublished(article.is_published)
    setShowForm(true)
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()

    const input = {
      title: title(),
      content: content(),
      article_type: articleType() as any,
      is_published: isPublished(),
    }

    const result = eventArticleSchema.safeParse(input)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((issue: any) => {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    try {
      if (editingArticle()) {
        await updateEventArticle(editingArticle()!.id, input)
        toast.success('Article updated successfully')
      } else {
        await createArticle({
          ...input,
          event_id: props.eventId,
          author_id: auth.user()!.id,
        })
        toast.success('Article created successfully')
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save article')
    }
  }

  const handleDelete = async () => {
    const id = deleteTarget()
    if (!id) return

    try {
      await deleteEventArticle(id)
      toast.success('Article deleted')
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete article')
    }
  }

  const togglePublished = async (article: EventArticle) => {
    try {
      await updateEventArticle(article.id, { is_published: !article.is_published })
      toast.success(article.is_published ? 'Article unpublished' : 'Article published')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle publish status')
    }
  }

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-ktip-sand-900">Event Articles</h3>
        <Show when={!showForm()}>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            New Article
          </Button>
        </Show>
      </div>

      {/* Form */}
      <Show when={showForm()}>
        <form
          onSubmit={handleSubmit}
          class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4"
        >
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-ktip-sand-900">
              {editingArticle() ? 'Edit Article' : 'New Article'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              class="p-1 text-ktip-sand-400 hover:text-ktip-sand-600"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Title</label>
            <input
              type="text"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              placeholder="Article title..."
            />
            <Show when={errors().title}>
              <p class="text-xs text-red-500 mt-1">{errors().title}</p>
            </Show>
          </div>

          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Content</label>
            <textarea
              value={content()}
              onInput={(e) => setContent(e.currentTarget.value)}
              rows={8}
              class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none resize-none"
              placeholder="Write your article content..."
            />
            <Show when={errors().content}>
              <p class="text-xs text-red-500 mt-1">{errors().content}</p>
            </Show>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <div class="flex-1">
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Type</label>
              <select
                value={articleType()}
                onChange={(e) => setArticleType(e.currentTarget.value)}
                class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:outline-none"
              >
                <option value="recap">Event Recap</option>
                <option value="resources">Resources</option>
                <option value="summary">Summary</option>
                <option value="blog">Blog Post</option>
              </select>
            </div>

            <div class="flex items-end">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublished()}
                  onChange={(e) => setIsPublished(e.currentTarget.checked)}
                  class="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500"
                />
                <span class="text-sm text-ktip-sand-700">Publish immediately</span>
              </label>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={resetForm} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              loading={creating() || updating()}
            >
              {editingArticle() ? 'Save Changes' : 'Create Article'}
            </Button>
          </div>
        </form>
      </Show>

      {/* Articles List */}
      <Suspense
        fallback={<div class="text-center text-ktip-sand-500 py-8">Loading articles...</div>}
      >
        <Show
          when={articles()?.length}
          fallback={
            <Show when={!showForm()}>
              <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
                <FileText size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                <h3 class="text-lg font-semibold text-ktip-sand-700 mb-1">No articles yet</h3>
                <p class="text-ktip-sand-500 text-sm">
                  Write event recaps, share resources, or publish blog posts
                </p>
              </div>
            </Show>
          }
        >
          <div class="space-y-3">
            <For each={articles()}>
              {(article) => (
                <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-4">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-medium text-ktip-sand-900">{article.title}</h4>
                        <Badge size="sm" class="bg-ktip-sand-100 text-ktip-sand-600 border-ktip-sand-200">
                          {EVENT_ARTICLE_TYPE_LABELS[article.article_type] || article.article_type}
                        </Badge>
                        <Show when={!article.is_published}>
                          <Badge size="sm" class="bg-yellow-100 text-yellow-700 border-yellow-200">
                            Draft
                          </Badge>
                        </Show>
                      </div>
                      <p class="text-sm text-ktip-sand-600 line-clamp-2">{article.content}</p>
                      <p class="text-xs text-ktip-sand-400 mt-2">
                        {format(new Date(article.created_at), 'MMM d, yyyy h:mm a')}
                        {article.author?.display_name && ` by ${article.author.display_name}`}
                      </p>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePublished(article)}
                        class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                        title={article.is_published ? 'Unpublish' : 'Publish'}
                      >
                        {article.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(article)}
                        class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(article.id)}
                        class="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Suspense>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget()}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deletingArticle()}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
