import { createSignal, Show, For, Suspense } from 'solid-js'
import type { EventScheduleItem } from '../../../types'
import {
  useEventSchedule,
  useCreateScheduleItem,
  useUpdateScheduleItem,
  useDeleteScheduleItem,
} from '../../../hooks/useEventSchedule'
import { useEventSpeakers } from '../../../hooks/useEventSpeakers'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS } from '../../../lib/constants'
import { format } from 'date-fns'
import { Plus, Trash2, Edit, Save, X, Clock, MapPin, User } from 'lucide-solid'

interface AdminEventScheduleTabProps {
  eventId: string
}

/** Convert an ISO date string to `YYYY-MM-DDTHH:mm` for datetime-local inputs */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminEventScheduleTab(props: AdminEventScheduleTabProps) {
  const toast = useToast()
  const [showForm, setShowForm] = createSignal(false)
  const [editingItem, setEditingItem] = createSignal<EventScheduleItem | null>(null)
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null)

  // Form state
  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [startTime, setStartTime] = createSignal('')
  const [endTime, setEndTime] = createSignal('')
  const [location, setLocation] = createSignal('')
  const [speakerId, setSpeakerId] = createSignal('')
  const [scheduleType, setScheduleType] = createSignal('session')
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const { schedule, refetch } = useEventSchedule(() => props.eventId)
  const { speakers } = useEventSpeakers(() => props.eventId)
  const { createItem, loading: creating } = useCreateScheduleItem()
  const { updateItem, loading: updating } = useUpdateScheduleItem()
  const { deleteItem, loading: deleting } = useDeleteScheduleItem()

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setStartTime('')
    setEndTime('')
    setLocation('')
    setSpeakerId('')
    setScheduleType('session')
    setErrors({})
    setShowForm(false)
    setEditingItem(null)
  }

  const startEdit = (item: EventScheduleItem) => {
    setEditingItem(item)
    setTitle(item.title)
    setDescription(item.description || '')
    setStartTime(toDatetimeLocal(item.start_time))
    setEndTime(toDatetimeLocal(item.end_time))
    setLocation(item.location || '')
    setSpeakerId(item.speaker_id || '')
    setScheduleType(item.schedule_type)
    setShowForm(true)
  }

  const validate = (): boolean => {
    const fieldErrors: Record<string, string> = {}
    if (!title().trim()) fieldErrors.title = 'Title is required'
    if (!startTime()) fieldErrors.start_time = 'Start time is required'
    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload: any = {
      title: title().trim(),
      start_time: new Date(startTime()).toISOString(),
      schedule_type: scheduleType(),
    }
    if (description().trim()) payload.description = description().trim()
    if (endTime()) payload.end_time = new Date(endTime()).toISOString()
    if (location().trim()) payload.location = location().trim()
    if (speakerId()) payload.speaker_id = speakerId()

    try {
      if (editingItem()) {
        await updateItem(editingItem()!.id, payload)
        toast.success('Schedule item updated')
      } else {
        await createItem({
          ...payload,
          event_id: props.eventId,
        })
        toast.success('Schedule item created')
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save schedule item')
    }
  }

  const handleDelete = async () => {
    const id = deleteTarget()
    if (!id) return

    try {
      await deleteItem(id)
      toast.success('Schedule item deleted')
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete schedule item')
    }
  }

  const formatTime = (iso: string) => {
    try {
      return format(new Date(iso), 'h:mm a')
    } catch {
      return iso
    }
  }

  const formatDate = (iso: string) => {
    try {
      return format(new Date(iso), 'EEE, MMM d')
    } catch {
      return ''
    }
  }

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-ktip-sand-900">Event Schedule</h3>
        <Show when={!showForm()}>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            Add Schedule Item
          </Button>
        </Show>
      </div>

      {/* Form */}
      <Show when={showForm()}>
        <form
          onSubmit={handleSubmit}
          class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4"
        >
          <fieldset disabled={creating() || updating()}>
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-ktip-sand-900">
              {editingItem() ? 'Edit Schedule Item' : 'New Schedule Item'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              class="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Title */}
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
              Title <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              placeholder="e.g. Opening Keynote, Lunch Break..."
            />
            <Show when={errors().title}>
              <p class="text-xs text-red-500 mt-1">{errors().title}</p>
            </Show>
          </div>

          {/* Description */}
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Description</label>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              rows={3}
              class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors resize-none"
              placeholder="Optional description or details..."
            />
          </div>

          {/* Time row */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
                Start Time <span class="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startTime()}
                onInput={(e) => setStartTime(e.currentTarget.value)}
                class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              />
              <Show when={errors().start_time}>
                <p class="text-xs text-red-500 mt-1">{errors().start_time}</p>
              </Show>
            </div>
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">End Time</label>
              <input
                type="datetime-local"
                value={endTime()}
                onInput={(e) => setEndTime(e.currentTarget.value)}
                class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              />
            </div>
          </div>

          {/* Location + Speaker + Type row */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Location / Room</label>
              <input
                type="text"
                value={location()}
                onInput={(e) => setLocation(e.currentTarget.value)}
                class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                placeholder="e.g. Main Hall, Room A..."
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Speaker</label>
              <select
                value={speakerId()}
                onChange={(e) => setSpeakerId(e.currentTarget.value)}
                class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              >
                <option value="">No speaker</option>
                <For each={speakers() || []}>
                  {(speaker) => (
                    <option value={speaker.id}>{speaker.name}</option>
                  )}
                </For>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Type</label>
              <select
                value={scheduleType()}
                onChange={(e) => setScheduleType(e.currentTarget.value)}
                class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              >
                <option value="session">Session</option>
                <option value="break">Break</option>
                <option value="keynote">Keynote</option>
                <option value="workshop">Workshop</option>
                <option value="networking">Networking</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={resetForm} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              loading={creating() || updating()}
              icon={<Save size={14} />}
            >
              {editingItem() ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
          </fieldset>
        </form>
      </Show>

      {/* Schedule Timeline */}
      <Suspense
        fallback={<div class="text-center text-ktip-sand-500 py-8">Loading schedule...</div>}
      >
        <Show
          when={schedule()?.length}
          fallback={
            <Show when={!showForm()}>
              <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
                <Clock size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                <h3 class="text-lg font-semibold text-ktip-sand-700 mb-1">No schedule items yet</h3>
                <p class="text-ktip-sand-500 text-sm mb-4">
                  Add your first session to build the agenda.
                </p>
                <Button
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setShowForm(true)}
                >
                  Add First Item
                </Button>
              </div>
            </Show>
          }
        >
          <div class="relative">
            {/* Timeline line */}
            <div class="absolute left-[7.5rem] top-0 bottom-0 w-px bg-ktip-sand-200 hidden sm:block" />

            <div class="space-y-3">
              <For each={schedule()}>
                {(item) => {
                  const isBreak = () => item.schedule_type === 'break'

                  return (
                    <div
                      class={`relative flex flex-col sm:flex-row gap-3 sm:gap-6 ${
                        isBreak()
                          ? 'bg-ktip-sand-50 rounded-xl border border-ktip-sand-200 p-4'
                          : 'bg-white rounded-xl border border-ktip-sand-200 shadow-card p-4'
                      }`}
                    >
                      {/* Time column */}
                      <div class="sm:w-[6.5rem] flex-shrink-0 flex flex-col items-start sm:items-end sm:text-right">
                        <span class="text-sm font-semibold text-ktip-sand-900">
                          {formatTime(item.start_time)}
                        </span>
                        <Show when={item.end_time}>
                          <span class="text-xs text-ktip-sand-500">
                            {formatTime(item.end_time!)}
                          </span>
                        </Show>
                        <span class="text-xs text-ktip-sand-400 mt-0.5">
                          {formatDate(item.start_time)}
                        </span>
                      </div>

                      {/* Timeline dot */}
                      <div class="hidden sm:flex items-start pt-1.5">
                        <div
                          class={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                            isBreak()
                              ? 'bg-ktip-sand-300 border-ktip-sand-400'
                              : 'bg-ktip-ocean-500 border-ktip-ocean-600'
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                              <h4
                                class={`font-medium ${
                                  isBreak() ? 'text-ktip-sand-600' : 'text-ktip-sand-900'
                                }`}
                              >
                                {item.title}
                              </h4>
                              <Badge
                                size="sm"
                                class={SCHEDULE_TYPE_COLORS[item.schedule_type] || ''}
                              >
                                {SCHEDULE_TYPE_LABELS[item.schedule_type] || item.schedule_type}
                              </Badge>
                            </div>

                            <Show when={item.description}>
                              <p class="text-sm text-ktip-sand-600 mb-2 whitespace-pre-wrap">
                                {item.description}
                              </p>
                            </Show>

                            <div class="flex flex-wrap items-center gap-3 text-xs text-ktip-sand-500">
                              <Show when={item.speaker}>
                                <span class="inline-flex items-center gap-1">
                                  <User size={12} />
                                  {item.speaker!.name}
                                </span>
                              </Show>
                              <Show when={item.location}>
                                <span class="inline-flex items-center gap-1">
                                  <MapPin size={12} />
                                  {item.location}
                                </span>
                              </Show>
                            </div>
                          </div>

                          {/* Actions */}
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item.id)}
                              class="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        </Show>
      </Suspense>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget()}
        title="Delete Schedule Item"
        message="Are you sure you want to delete this schedule item? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting()}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
