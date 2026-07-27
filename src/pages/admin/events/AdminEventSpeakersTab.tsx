import { createSignal, Show, For, Suspense } from 'solid-js'
import type { EventSpeaker } from '../../../types'
import {
  useEventSpeakers,
  useCreateSpeaker,
  useUpdateSpeaker,
  useDeleteSpeaker,
} from '../../../hooks/useEventSpeakers'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../../components/ui/Button'
import { ImageUpload } from '../../../components/ui/ImageUpload'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import {
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  Globe,
  Mic,
} from 'lucide-solid'

interface AdminEventSpeakersTabProps {
  eventId: string
}

export default function AdminEventSpeakersTab(props: AdminEventSpeakersTabProps) {
  const toast = useToast()
  const [showForm, setShowForm] = createSignal(false)
  const [editingSpeaker, setEditingSpeaker] = createSignal<EventSpeaker | null>(null)
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null)

  // Form state
  const [name, setName] = createSignal('')
  const [speakerTitle, setSpeakerTitle] = createSignal('')
  const [bio, setBio] = createSignal('')
  const [photoUrl, setPhotoUrl] = createSignal('')
  const [website, setWebsite] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const { speakers, refetch } = useEventSpeakers(() => props.eventId)
  const { createSpeaker, loading: creating } = useCreateSpeaker()
  const { updateSpeaker, loading: updating } = useUpdateSpeaker()
  const { deleteSpeaker, loading: deleting } = useDeleteSpeaker()

  const resetForm = () => {
    setName('')
    setSpeakerTitle('')
    setBio('')
    setPhotoUrl('')
    setWebsite('')
    setErrors({})
    setShowForm(false)
    setEditingSpeaker(null)
  }

  const startEdit = (speaker: EventSpeaker) => {
    setEditingSpeaker(speaker)
    setName(speaker.name)
    setSpeakerTitle(speaker.title || '')
    setBio(speaker.bio || '')
    setPhotoUrl(speaker.photo_url || '')
    setWebsite(speaker.website || '')
    setShowForm(true)
  }

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()

    const fieldErrors: Record<string, string> = {}
    if (!name().trim()) {
      fieldErrors.name = 'Speaker name is required'
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }

    try {
      if (editingSpeaker()) {
        await updateSpeaker(editingSpeaker()!.id, {
          name: name().trim(),
          title: speakerTitle().trim() || null,
          bio: bio().trim() || null,
          photo_url: photoUrl().trim() || null,
          website: website().trim() || null,
        })
        toast.success('Speaker updated successfully')
      } else {
        await createSpeaker({
          event_id: props.eventId,
          name: name().trim(),
          title: speakerTitle().trim() || undefined,
          bio: bio().trim() || undefined,
          photo_url: photoUrl().trim() || undefined,
          website: website().trim() || undefined,
        })
        toast.success('Speaker added successfully')
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save speaker')
    }
  }

  const handleDelete = async () => {
    const id = deleteTarget()
    if (!id) return

    try {
      await deleteSpeaker(id)
      toast.success('Speaker deleted')
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete speaker')
    }
  }

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-semibold text-ktip-sand-900">Speakers</h3>
          <Show when={speakers()?.length}>
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-ocean-100 text-ktip-ocean-700">
              {speakers()!.length}
            </span>
          </Show>
        </div>
        <Show when={!showForm()}>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            Add Speaker
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
              {editingSpeaker() ? 'Edit Speaker' : 'Add Speaker'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              class="p-1 text-ktip-sand-400 hover:text-ktip-sand-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Name */}
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
              Name <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              placeholder="Speaker name..."
            />
            <Show when={errors().name}>
              <p class="text-xs text-red-500 mt-1">{errors().name}</p>
            </Show>
          </div>

          {/* Title / Organization */}
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
              Title / Organization
            </label>
            <input
              type="text"
              value={speakerTitle()}
              onInput={(e) => setSpeakerTitle(e.currentTarget.value)}
              class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              placeholder="e.g. CEO at Acme Corp"
            />
          </div>

          {/* Bio */}
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
              Bio
            </label>
            <textarea
              value={bio()}
              onInput={(e) => setBio(e.currentTarget.value)}
              rows={3}
              class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors resize-none"
              placeholder="Brief speaker biography..."
            />
          </div>

          {/* Photo & Website */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
                Photo
              </label>
              <ImageUpload
                bucket="event-assets"
                path={`speakers/${editingSpeaker()?.id || 'new'}/photo`}
                currentUrl={photoUrl() || undefined}
                onUpload={(url) => setPhotoUrl(url)}
                onRemove={() => setPhotoUrl('')}
                placeholder="Upload speaker photo"
              />
              <input
                type="url"
                value={photoUrl()}
                onInput={(e) => setPhotoUrl(e.currentTarget.value)}
                class="w-full mt-2 px-3 py-2 border border-ktip-sand-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                placeholder="...or paste image URL"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
                Website URL
              </label>
              <input
                type="url"
                value={website()}
                onInput={(e) => setWebsite(e.currentTarget.value)}
                class="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                placeholder="https://example.com"
              />
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
              icon={<Save size={14} />}
              loading={creating() || updating()}
            >
              {editingSpeaker() ? 'Save Changes' : 'Add Speaker'}
            </Button>
          </div>
          </fieldset>
        </form>
      </Show>

      {/* Speakers Grid */}
      <Suspense
        fallback={<div class="text-center text-ktip-sand-500 py-8">Loading speakers...</div>}
      >
        <Show
          when={speakers()?.length}
          fallback={
            <Show when={!showForm()}>
              <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
                <Mic size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                <h3 class="text-lg font-semibold text-ktip-sand-700 mb-1">No speakers added yet</h3>
                <p class="text-ktip-sand-500 text-sm mb-4">
                  Add speakers to showcase your event's presenters.
                </p>
                <Button
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setShowForm(true)}
                >
                  Add First Speaker
                </Button>
              </div>
            </Show>
          }
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={speakers()}>
              {(speaker) => (
                <div class="group bg-white rounded-xl border border-ktip-sand-200 p-4 hover:shadow-card-hover transition-shadow">
                  <div class="flex items-start gap-3">
                    {/* Photo or Initials */}
                    <Show
                      when={speaker.photo_url}
                      fallback={
                        <div class="w-16 h-16 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-xl font-bold text-ktip-ocean-700 flex-shrink-0">
                          {getInitials(speaker.name)}
                        </div>
                      }
                    >
                      <img
                        src={speaker.photo_url!}
                        alt={speaker.name}
                        class="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      />
                    </Show>

                    {/* Info */}
                    <div class="flex-1 min-w-0">
                      <h4 class="font-semibold text-ktip-sand-900 truncate">{speaker.name}</h4>
                      <Show when={speaker.title}>
                        <p class="text-sm text-ktip-sand-500 truncate">{speaker.title}</p>
                      </Show>
                      <Show when={speaker.website}>
                        <a
                          href={speaker.website!}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 text-xs text-ktip-ocean-500 hover:text-ktip-ocean-700 mt-1 transition-colors"
                        >
                          <Globe size={12} />
                          <span>Website</span>
                        </a>
                      </Show>
                    </div>

                    {/* Actions (visible on hover) */}
                    <div class="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEdit(speaker)}
                        class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                        title="Edit speaker"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(speaker.id)}
                        class="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                        title="Delete speaker"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Bio excerpt */}
                  <Show when={speaker.bio}>
                    <p class="text-sm text-ktip-sand-600 mt-3 line-clamp-2">{speaker.bio}</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Suspense>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget()}
        title="Delete Speaker"
        message="Are you sure you want to delete this speaker? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting()}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
