import { useState, type FormEvent } from 'react'
import { useEventUpdates, useCreateEventUpdate, useUpdateEventUpdate, useDeleteEventUpdate } from '../../../hooks/useEventUpdates'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import {
  Plus,
  Edit,
  Trash2,
  Megaphone,
  Eye,
  EyeOff,
  X,
} from 'lucide-react'
import {
  EVENT_UPDATE_TYPE_LABELS,
  EVENT_UPDATE_TYPE_COLORS,
} from '../../../lib/constants'
import { eventUpdateSchema } from '../../../lib/validation'
import { format } from 'date-fns'
import type { EventUpdate } from '../../../types'

interface AdminEventUpdatesTabProps {
  eventId: string
}

export default function AdminEventUpdatesTab({ eventId }: AdminEventUpdatesTabProps) {
  const auth = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingUpdate, setEditingUpdate] = useState<EventUpdate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [updateType, setUpdateType] = useState('announcement')
  const [isPublished, setIsPublished] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { updates, loading: updatesLoading, refetch } = useEventUpdates(eventId)
  const { createUpdate, loading: creating } = useCreateEventUpdate()
  const { updateEventUpdate, loading: updating } = useUpdateEventUpdate()
  const { deleteEventUpdate, loading: deleting } = useDeleteEventUpdate()

  const resetForm = () => {
    setTitle('')
    setContent('')
    setUpdateType('announcement')
    setIsPublished(true)
    setErrors({})
    setShowForm(false)
    setEditingUpdate(null)
  }

  const startEdit = (update: EventUpdate) => {
    setEditingUpdate(update)
    setTitle(update.title)
    setContent(update.content)
    setUpdateType(update.update_type)
    setIsPublished(update.is_published)
    setShowForm(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const input = {
      title,
      content,
      update_type: updateType as any,
      is_published: isPublished,
    }

    const result = eventUpdateSchema.safeParse(input)
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
      if (editingUpdate) {
        await updateEventUpdate(editingUpdate.id, input)
        toast.success('Update edited successfully')
      } else {
        await createUpdate({
          ...input,
          event_id: eventId,
          author_id: auth.user!.id,
        })
        toast.success('Update created successfully')
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save update')
    }
  }

  const handleDelete = async () => {
    const id = deleteTarget
    if (!id) return

    try {
      await deleteEventUpdate(id)
      toast.success('Update deleted')
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete update')
    }
  }

  const togglePublished = async (update: EventUpdate) => {
    try {
      await updateEventUpdate(update.id, { is_published: !update.is_published })
      toast.success(update.is_published ? 'Update unpublished' : 'Update published')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle publish status')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ktip-sand-900">Event Updates</h3>
        {!showForm && (
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            New Update
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-ktip-sand-900">
              {editingUpdate ? 'Edit Update' : 'New Update'}
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
              placeholder="Update title..."
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
              rows={4}
              className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none resize-none"
              placeholder="Write your update..."
            />
            {errors.content && (
              <p className="text-xs text-red-500 mt-1">{errors.content}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Type</label>
              <select
                value={updateType}
                onChange={(e) => setUpdateType(e.currentTarget.value)}
                className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:outline-none"
              >
                <option value="announcement">Announcement</option>
                <option value="schedule_change">Schedule Change</option>
                <option value="reminder">Reminder</option>
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
              {editingUpdate ? 'Save Changes' : 'Create Update'}
            </Button>
          </div>
        </form>
      )}

      {/* Updates List */}
      {updatesLoading ? (
        <div className="text-center text-ktip-sand-500 py-8">Loading updates...</div>
      ) : updates?.length ? (
        <div className="space-y-3">
          {updates.map((update) => (
            <div key={update.id} className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-ktip-sand-900">{update.title}</h4>
                    <Badge size="sm" className={EVENT_UPDATE_TYPE_COLORS[update.update_type] || ''}>
                      {EVENT_UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                    </Badge>
                    {!update.is_published && (
                      <Badge size="sm" className="bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200">
                        Draft
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-ktip-sand-600 whitespace-pre-wrap">{update.content}</p>
                  <p className="text-xs text-ktip-sand-400 mt-2">
                    {format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}
                    {update.author?.display_name && ` by ${update.author.display_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => togglePublished(update)}
                    className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                    title={update.is_published ? 'Unpublish' : 'Publish'}
                  >
                    {update.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(update)}
                    className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                    title="Edit"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(update.id)}
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
          <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
            <Megaphone size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 mb-1">No updates yet</h3>
            <p className="text-ktip-sand-500 text-sm">
              Post announcements, schedule changes, or reminders for attendees
            </p>
          </div>
        )
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Update"
        message="Are you sure you want to delete this update? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
