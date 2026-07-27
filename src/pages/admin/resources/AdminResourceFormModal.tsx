import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { useCreateResource, useUpdateResource } from '../../../hooks/useResources'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  Save,
  Plus,
  X,
  Leaf,
} from 'lucide-react'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_CATEGORY_LABELS,
} from '../../../lib/constants'
import type { Resource } from '../../../types'

interface AdminResourceFormModalProps {
  open: boolean
  onClose: () => void
  resource: Resource | null
  onSaved: () => void
}

export function AdminResourceFormModal({ open, onClose, resource, onSaved }: AdminResourceFormModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { createResource, loading: createLoading } = useCreateResource()
  const { updateResource, loading: updateLoading } = useUpdateResource()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [resourceType, setResourceType] = useState('article')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [isPublished, setIsPublished] = useState(false)

  const isEditing = !!resource

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setContent('')
    setResourceType('article')
    setCategory('')
    setTags([])
    setTagInput('')
    setDownloadUrl('')
    setThumbnailUrl('')
    setIsClimateAction(false)
    setIsPublished(false)
  }

  useEffect(() => {
    if (open && resource) {
      setTitle(resource.title)
      setDescription(resource.description || '')
      setContent(resource.content || '')
      setResourceType(resource.resource_type)
      setCategory(resource.category || '')
      setTags(resource.tags || [])
      setDownloadUrl(resource.download_url || '')
      setThumbnailUrl(resource.thumbnail_url || '')
      setIsClimateAction(resource.is_climate_action)
      setIsPublished(resource.is_published)
    } else if (open) {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const data: Record<string, any> = {
      title: title.trim(),
      description: description.trim() || null,
      content: content.trim() || null,
      resource_type: resourceType,
      category: category || null,
      tags,
      download_url: downloadUrl.trim() || null,
      thumbnail_url: thumbnailUrl.trim() || null,
      is_climate_action: isClimateAction,
      is_published: isPublished,
    }

    try {
      if (isEditing) {
        await updateResource(resource!.id, data)
        toast.success('Resource updated')
      } else {
        data.author_id = auth.user?.id || null
        await createResource(data as any)
        toast.success('Resource created')
      }
      onSaved()
    } catch {
      toast.error(isEditing ? 'Failed to update resource' : 'Failed to create resource')
    }
  }

  const addTag = () => {
    const val = tagInput.trim()
    if (val && !tags.includes(val)) {
      setTags([...tags, val])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Resource' : 'Add Resource'}
      description={isEditing ? 'Update this resource' : 'Create a new knowledge base resource'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
          fullWidth
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={2}
          placeholder="Brief summary of this resource..."
          fullWidth
        />

        <Textarea
          label="Content"
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          rows={6}
          placeholder="Full resource content..."
          fullWidth
        />

        <div className="grid grid-cols-2 gap-4">
          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ktip-sand-700">Type</label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.currentTarget.value)}
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white text-sm"
            >
              {Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ktip-sand-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.currentTarget.value)}
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white text-sm"
            >
              <option value="">No category</option>
              {Object.entries(RESOURCE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ktip-sand-700">Tags</label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Add a tag..."
              className="flex-1 border border-ktip-sand-200 rounded-xl px-4 py-2.5 bg-ktip-sand-50/50 focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white text-sm"
            />
            <Button type="button" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addTag}>
              Add
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Download URL"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.currentTarget.value)}
            placeholder="https://..."
            fullWidth
          />
          <Input
            label="Thumbnail URL"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.currentTarget.value)}
            placeholder="https://..."
            fullWidth
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6 py-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.currentTarget.checked)}
              className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
            />
            <span className="text-sm text-ktip-sand-700 font-medium">Published</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isClimateAction}
              onChange={(e) => setIsClimateAction(e.currentTarget.checked)}
              className="w-4 h-4 rounded border-ktip-sand-300 text-emerald-600 focus:ring-emerald-500"
            />
            <Leaf size={14} className="text-emerald-600" />
            <span className="text-sm text-ktip-sand-700 font-medium">Climate Action</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={createLoading || updateLoading}
            icon={<Save size={16} />}
          >
            {isEditing ? 'Update' : 'Create'} Resource
          </Button>
        </div>
      </form>
    </Modal>
  )
}
