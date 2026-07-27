import { useState, type FormEvent } from 'react'
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
} from 'lucide-react'
import { EVENT_ARTICLE_TYPE_LABELS } from '../../../lib/constants'
import { eventArticleSchema } from '../../../lib/validation'
import { format } from 'date-fns'
import type { EventArticle } from '../../../types'

interface AdminEventArticlesTabProps {
  eventId: string
}

export default function AdminEventArticlesTab({ eventId }: AdminEventArticlesTabProps) {
  const auth = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingArticle, setEditingArticle] = useState<EventArticle | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [articleType, setArticleType] = useState('recap')
  const [isPublished, setIsPublished] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { articles, loading: articlesLoading, refetch } = useEventArticles(eventId)
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const input = {
      title,
      content,
      article_type: articleType as any,
      is_published: isPublished,
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
      if (editingArticle) {
        await updateEventArticle(editingArticle.id, input)
        toast.success('Article updated successfully')
      } else {
        await createArticle({
          ...input,
          event_id: eventId,
          author_id: auth.user!.id,
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
    const id = deleteTarget
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ktip-sand-900">Event Articles</h3>
        {!showForm && (
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            New Article
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-ktip-sand-900">
              {editingArticle ? 'Edit Article' : 'New Article'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              placeholder="Article title..."
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.currentTarget.value)}
              rows={8}
              className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none resize-none"
              placeholder="Write your article content..."
            />
            {errors.content && (
              <p className="text-xs text-red-500 mt-1">{errors.content}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Type</label>
              <select
                value={articleType}
                onChange={(e) => setArticleType(e.currentTarget.value)}
                className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:outline-none"
              >
                <option value="recap">Event Recap</option>
                <option value="resources">Resources</option>
                <option value="summary">Summary</option>
                <option value="blog">Blog Post</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.currentTarget.checked)}
                  className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500"
                />
                <span className="text-sm text-ktip-sand-700">Publish immediately</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={resetForm} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              loading={creating || updating}
            >
              {editingArticle ? 'Save Changes' : 'Create Article'}
            </Button>
          </div>
        </form>
      )}

      {/* Articles List */}
      {articlesLoading ? (
        <div className="text-center text-ktip-sand-500 py-8">Loading articles...</div>
      ) : articles?.length ? (
        <div className="space-y-3">
          {articles.map((article) => (
            <div key={article.id} className="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-ktip-sand-900">{article.title}</h4>
                    <Badge size="sm" className="bg-ktip-sand-100 text-ktip-sand-600 border-ktip-sand-200">
                      {EVENT_ARTICLE_TYPE_LABELS[article.article_type] || article.article_type}
                    </Badge>
                    {!article.is_published && (
                      <Badge size="sm" className="bg-yellow-100 text-yellow-700 border-yellow-200">
                        Draft
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-ktip-sand-600 line-clamp-2">{article.content}</p>
                  <p className="text-xs text-ktip-sand-400 mt-2">
                    {format(new Date(article.created_at), 'MMM d, yyyy h:mm a')}
                    {article.author?.display_name && ` by ${article.author.display_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => togglePublished(article)}
                    className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                    title={article.is_published ? 'Unpublish' : 'Publish'}
                  >
                    {article.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(article)}
                    className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                    title="Edit"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(article.id)}
                    className="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
            <FileText size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 mb-1">No articles yet</h3>
            <p className="text-ktip-sand-500 text-sm">
              Write event recaps, share resources, or publish blog posts
            </p>
          </div>
        )
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deletingArticle}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
