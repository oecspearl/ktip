import { createSignal, Show, For, Suspense } from 'solid-js'
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
} from 'lucide-solid'
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

export default function AdminEventUpdatesTab(props: AdminEventUpdatesTabProps) {
  const auth = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = createSignal(false)
  const [editingUpdate, setEditingUpdate] = createSignal<EventUpdate | null>(null)
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null)

  // Form state
  const [title, setTitle] = createSignal('')
  const [content, setContent] = createSignal('')
  const [updateType, setUpdateType] = createSignal('announcement')
  const [isPublished, setIsPublished] = createSignal(true)
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const { updates, refetch } = useEventUpdates(() => props.eventId)
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

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()

    const input = {
      title: title(),
      content: content(),
      update_type: updateType() as any,
      is_published: isPublished(),
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
      if (editingUpdate()) {
        await updateEventUpdate(editingUpdate()!.id, input)
        toast.success('Update edited successfully')
      } else {
        await createUpdate({
          ...input,
          event_id: props.eventId,
          author_id: auth.user()!.id,
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
    const id = deleteTarget()
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
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-ktip-sand-900">Event Updates</h3>
        <Show when={!showForm()}>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            New Update
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
              {editingUpdate() ? 'Edit Update' : 'New Update'}
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
              placeholder="Update title..."
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
              rows={4}
              class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none resize-none"
              placeholder="Write your update..."
            />
            <Show when={errors().content}>
              <p class="text-xs text-red-500 mt-1">{errors().content}</p>
            </Show>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <div class="flex-1">
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Type</label>
              <select
                value={updateType()}
                onChange={(e) => setUpdateType(e.currentTarget.value)}
                class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:border-ktip-ocean-500 focus:outline-none"
              >
                <option value="announcement">Announcement</option>
                <option value="schedule_change">Schedule Change</option>
                <option value="reminder">Reminder</option>
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
              {editingUpdate() ? 'Save Changes' : 'Create Update'}
            </Button>
          </div>
        </form>
      </Show>

      {/* Updates List */}
      <Suspense
        fallback={<div class="text-center text-ktip-sand-500 py-8">Loading updates...</div>}
      >
        <Show
          when={updates()?.length}
          fallback={
            <Show when={!showForm()}>
              <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
                <Megaphone size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                <h3 class="text-lg font-semibold text-ktip-sand-700 mb-1">No updates yet</h3>
                <p class="text-ktip-sand-500 text-sm">
                  Post announcements, schedule changes, or reminders for attendees
                </p>
              </div>
            </Show>
          }
        >
          <div class="space-y-3">
            <For each={updates()}>
              {(update) => (
                <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-4">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-medium text-ktip-sand-900">{update.title}</h4>
                        <Badge size="sm" class={EVENT_UPDATE_TYPE_COLORS[update.update_type] || ''}>
                          {EVENT_UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                        </Badge>
                        <Show when={!update.is_published}>
                          <Badge size="sm" class="bg-yellow-100 text-yellow-700 border-yellow-200">
                            Draft
                          </Badge>
                        </Show>
                      </div>
                      <p class="text-sm text-ktip-sand-600 whitespace-pre-wrap">{update.content}</p>
                      <p class="text-xs text-ktip-sand-400 mt-2">
                        {format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}
                        {update.author?.display_name && ` by ${update.author.display_name}`}
                      </p>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePublished(update)}
                        class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                        title={update.is_published ? 'Unpublish' : 'Publish'}
                      >
                        {update.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(update)}
                        class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(update.id)}
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
        title="Delete Update"
        message="Are you sure you want to delete this update? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting()}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
