import { useState } from 'react'
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
} from 'lucide-react'

interface AdminEventSpeakersTabProps {
  eventId: string
}

export default function AdminEventSpeakersTab(props: AdminEventSpeakersTabProps) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingSpeaker, setEditingSpeaker] = useState<EventSpeaker | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [speakerTitle, setSpeakerTitle] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { speakers, loading: speakersLoading, refetch } = useEventSpeakers(props.eventId)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const fieldErrors: Record<string, string> = {}
    if (!name.trim()) {
      fieldErrors.name = 'Speaker name is required'
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }

    try {
      if (editingSpeaker) {
        await updateSpeaker(editingSpeaker.id, {
          name: name.trim(),
          title: speakerTitle.trim() || null,
          bio: bio.trim() || null,
          photo_url: photoUrl.trim() || null,
          website: website.trim() || null,
        })
        toast.success('Speaker updated successfully')
      } else {
        await createSpeaker({
          event_id: props.eventId,
          name: name.trim(),
          title: speakerTitle.trim() || undefined,
          bio: bio.trim() || undefined,
          photo_url: photoUrl.trim() || undefined,
          website: website.trim() || undefined,
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
    const id = deleteTarget
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-ktip-sand-900">Speakers</h3>
          {!!speakers?.length && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-ktip-ocean-100 text-ktip-ocean-700">
              {speakers.length}
            </span>
          )}
        </div>
        {!showForm && (
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            Add Speaker
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4"
        >
          <fieldset disabled={creating || updating}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-ktip-sand-900">
              {editingSpeaker ? 'Edit Speaker' : 'Add Speaker'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              placeholder="Speaker name..."
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          {/* Title / Organization */}
          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
              Title / Organization
            </label>
            <input
              type="text"
              value={speakerTitle}
              onChange={(e) => setSpeakerTitle(e.currentTarget.value)}
              className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
              placeholder="e.g. CEO at Acme Corp"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.currentTarget.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors resize-none"
              placeholder="Brief speaker biography..."
            />
          </div>

          {/* Photo & Website */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Photo
              </label>
              <ImageUpload
                bucket="event-assets"
                path={`speakers/${editingSpeaker?.id || 'new'}/photo`}
                currentUrl={photoUrl || undefined}
                onUpload={(url) => setPhotoUrl(url)}
                onRemove={() => setPhotoUrl('')}
                placeholder="Upload speaker photo"
              />
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.currentTarget.value)}
                className="w-full mt-2 px-3 py-2 border border-ktip-sand-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                placeholder="...or paste image URL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Website URL
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.currentTarget.value)}
                className="w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors"
                placeholder="https://example.com"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={resetForm} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              icon={<Save size={14} />}
              loading={creating || updating}
            >
              {editingSpeaker ? 'Save Changes' : 'Add Speaker'}
            </Button>
          </div>
          </fieldset>
        </form>
      )}

      {/* Speakers Grid */}
      {speakersLoading ? (
        <div className="text-center text-ktip-sand-500 py-8">Loading speakers...</div>
      ) : speakers?.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {speakers.map((speaker) => (
            <div key={speaker.id} className="group bg-ktip-cream rounded-xl border border-ktip-sand-200 p-4 hover:shadow-card-hover transition-shadow">
              <div className="flex items-start gap-3">
                {/* Photo or Initials */}
                {speaker.photo_url ? (
                  <img
                    src={speaker.photo_url}
                    alt={speaker.name}
                    loading="lazy" decoding="async" width={64} height={64} className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-xl font-bold text-ktip-ocean-700 flex-shrink-0">
                    {getInitials(speaker.name)}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-ktip-sand-900 truncate">{speaker.name}</h4>
                  {speaker.title && (
                    <p className="text-sm text-ktip-sand-500 truncate">{speaker.title}</p>
                  )}
                  {speaker.website && (
                    <a
                      href={speaker.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-ktip-ocean-500 hover:text-ktip-ocean-700 mt-1 transition-colors"
                    >
                      <Globe size={12} />
                      <span>Website</span>
                    </a>
                  )}
                </div>

                {/* Actions (visible on hover) */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(speaker)}
                    className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                    title="Edit speaker"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(speaker.id)}
                    className="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                    title="Delete speaker"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Bio excerpt */}
              {speaker.bio && (
                <p className="text-sm text-ktip-sand-600 mt-3 line-clamp-2">{speaker.bio}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
            <Mic size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 mb-1">No speakers added yet</h3>
            <p className="text-ktip-sand-500 text-sm mb-4">
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
        )
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Speaker"
        message="Are you sure you want to delete this speaker? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
