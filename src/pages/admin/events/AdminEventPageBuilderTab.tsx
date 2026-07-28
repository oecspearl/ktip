import { useState } from 'react'
import type { EventPageSection, EventSectionType } from '../../../types'
import {
  useEventPageSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useReorderSections,
} from '../../../hooks/useEventPageSections'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { EVENT_SECTION_TYPE_LABELS } from '../../../lib/constants'
import { cn } from '../../../lib/utils'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Save,
  X,
  Info,
  HelpCircle,
  MapPin,
  Heart,
  FileText,
} from 'lucide-react'

interface AdminEventPageBuilderTabProps {
  eventId: string
}

const SECTION_TYPE_OPTIONS: { value: EventSectionType; label: string }[] = [
  { value: 'about', label: 'About' },
  { value: 'faq', label: 'FAQ' },
  { value: 'venue', label: 'Venue' },
  { value: 'sponsors', label: 'Sponsors' },
  { value: 'custom', label: 'Custom Section' },
]

const SECTION_TYPE_ICONS: Record<EventSectionType, typeof Info> = {
  about: Info,
  faq: HelpCircle,
  venue: MapPin,
  sponsors: Heart,
  custom: FileText,
}

const SECTION_TYPE_BADGE_VARIANTS: Record<EventSectionType, string> = {
  about: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  faq: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  venue: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  sponsors: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  custom: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

function getDefaultContent(type: EventSectionType): Record<string, any> {
  switch (type) {
    case 'about':
    case 'custom':
      return { body: '' }
    case 'faq':
      return { items: [{ question: '', answer: '' }] }
    case 'venue':
      return { name: '', address: '', map_url: '', directions: '' }
    case 'sponsors':
      return { items: [{ name: '', logo_url: '', website: '' }] }
    default:
      return {}
  }
}

function getDefaultTitle(type: EventSectionType): string {
  switch (type) {
    case 'about':
      return 'About'
    case 'faq':
      return 'Frequently Asked Questions'
    case 'venue':
      return 'Venue'
    case 'sponsors':
      return 'Sponsors'
    case 'custom':
      return 'Custom Section'
    default:
      return ''
  }
}

// --- Content editors (shared between new and edit) ---

interface ContentEditorProps {
  content: Record<string, any>
  setContent: (c: Record<string, any>) => void
}

function AboutCustomEditor({ content, setContent }: ContentEditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Body Content</label>
      <textarea
        value={content.body || ''}
        onChange={(e) =>
          setContent({ ...content, body: e.currentTarget.value })
        }
        rows={6}
        className={cn(INPUT_CLASS, 'resize-none')}
        placeholder="Write the section content..."
      />
    </div>
  )
}

function FaqEditor({ content, setContent }: ContentEditorProps) {
  const items = (content.items as { question: string; answer: string }[]) || []

  const updateItem = (index: number, field: 'question' | 'answer', value: string) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setContent({ ...content, items: updated })
  }

  const addItem = () => {
    setContent({
      ...content,
      items: [...items, { question: '', answer: '' }],
    })
  }

  const removeItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index)
    setContent({ ...content, items: updated })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-ktip-sand-700">Q&A Pairs</label>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
        >
          <Plus size={14} />
          Add Q&A
        </button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="relative bg-ktip-sand-50 rounded-lg p-4 space-y-2">
          <button
            type="button"
            onClick={() => removeItem(index)}
            className="absolute top-2 right-2 p-1 text-ktip-sand-400 hover:text-red-500 transition-colors"
            title="Remove Q&A"
          >
            <X size={14} />
          </button>
          <div>
            <label className="block text-xs font-medium text-ktip-sand-600 mb-1">
              Question {index + 1}
            </label>
            <input
              type="text"
              value={item.question}
              onChange={(e) => updateItem(index, 'question', e.currentTarget.value)}
              className={INPUT_CLASS}
              placeholder="Enter question..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ktip-sand-600 mb-1">Answer</label>
            <textarea
              value={item.answer}
              onChange={(e) => updateItem(index, 'answer', e.currentTarget.value)}
              rows={2}
              className={cn(INPUT_CLASS, 'resize-none')}
              placeholder="Enter answer..."
            />
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-ktip-sand-400 text-center py-4">
          No Q&A pairs yet. Click "Add Q&A" to get started.
        </p>
      )}
    </div>
  )
}

function VenueEditor({ content, setContent }: ContentEditorProps) {
  const updateField = (field: string, value: string) => {
    setContent({ ...content, [field]: value })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Venue Name</label>
        <input
          type="text"
          value={content.name || ''}
          onChange={(e) => updateField('name', e.currentTarget.value)}
          className={INPUT_CLASS}
          placeholder="e.g., National Cultural Centre"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Address</label>
        <input
          type="text"
          value={content.address || ''}
          onChange={(e) => updateField('address', e.currentTarget.value)}
          className={INPUT_CLASS}
          placeholder="Full street address..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Map URL</label>
        <input
          type="url"
          value={content.map_url || ''}
          onChange={(e) => updateField('map_url', e.currentTarget.value)}
          className={INPUT_CLASS}
          placeholder="https://maps.google.com/..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Directions</label>
        <textarea
          value={content.directions || ''}
          onChange={(e) => updateField('directions', e.currentTarget.value)}
          rows={3}
          className={cn(INPUT_CLASS, 'resize-none')}
          placeholder="How to get to the venue..."
        />
      </div>
    </div>
  )
}

function SponsorsEditor({ content, setContent }: ContentEditorProps) {
  const items =
    (content.items as { name: string; logo_url: string; website: string }[]) || []

  const updateItem = (index: number, field: 'name' | 'logo_url' | 'website', value: string) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setContent({ ...content, items: updated })
  }

  const addItem = () => {
    setContent({
      ...content,
      items: [...items, { name: '', logo_url: '', website: '' }],
    })
  }

  const removeItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index)
    setContent({ ...content, items: updated })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-ktip-sand-700">Sponsors</label>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
        >
          <Plus size={14} />
          Add Sponsor
        </button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="relative bg-ktip-sand-50 rounded-lg p-4 space-y-2">
          <button
            type="button"
            onClick={() => removeItem(index)}
            className="absolute top-2 right-2 p-1 text-ktip-sand-400 hover:text-red-500 transition-colors"
            title="Remove sponsor"
          >
            <X size={14} />
          </button>
          <div>
            <label className="block text-xs font-medium text-ktip-sand-600 mb-1">
              Sponsor Name
            </label>
            <input
              type="text"
              value={item.name}
              onChange={(e) => updateItem(index, 'name', e.currentTarget.value)}
              className={INPUT_CLASS}
              placeholder="Sponsor name..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ktip-sand-600 mb-1">Logo URL</label>
            <input
              type="url"
              value={item.logo_url}
              onChange={(e) => updateItem(index, 'logo_url', e.currentTarget.value)}
              className={INPUT_CLASS}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ktip-sand-600 mb-1">Website</label>
            <input
              type="url"
              value={item.website}
              onChange={(e) => updateItem(index, 'website', e.currentTarget.value)}
              className={INPUT_CLASS}
              placeholder="https://sponsor-website.com"
            />
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-ktip-sand-400 text-center py-4">
          No sponsors yet. Click "Add Sponsor" to get started.
        </p>
      )}
    </div>
  )
}

function renderContentEditor(
  type: EventSectionType,
  content: Record<string, any>,
  setContent: (c: Record<string, any>) => void
) {
  switch (type) {
    case 'about':
    case 'custom':
      return <AboutCustomEditor content={content} setContent={setContent} />
    case 'faq':
      return <FaqEditor content={content} setContent={setContent} />
    case 'venue':
      return <VenueEditor content={content} setContent={setContent} />
    case 'sponsors':
      return <SponsorsEditor content={content} setContent={setContent} />
    default:
      return null
  }
}

export default function AdminEventPageBuilderTab(props: AdminEventPageBuilderTabProps) {
  const toast = useToast()

  const { sections, loading: sectionsLoading, refetch } = useEventPageSections(props.eventId)
  const { createSection, loading: creating } = useCreateSection()
  const { updateSection, loading: updating } = useUpdateSection()
  const { deleteSection, loading: deleting } = useDeleteSection()
  const { reorderSections, loading: reordering } = useReorderSections()

  // Track which section is being edited (by id), or null
  const [editingSection, setEditingSection] = useState<string | null>(null)
  // Track add mode: null = not adding, or the chosen section type
  const [addMode, setAddMode] = useState<EventSectionType | null>(null)
  // Show the type selection dropdown
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  // Delete confirmation target
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Editing form state (for existing sections)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState<Record<string, any>>({})

  // New section form state
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState<Record<string, any>>({})

  // --- Add Section Flow ---

  const handleSelectType = (type: EventSectionType) => {
    setShowTypeSelector(false)
    setAddMode(type)
    setNewTitle(getDefaultTitle(type))
    setNewContent(getDefaultContent(type))
  }

  const cancelAdd = () => {
    setAddMode(null)
    setShowTypeSelector(false)
    setNewTitle('')
    setNewContent({})
  }

  const handleCreateSection = async () => {
    const type = addMode
    if (!type) return

    const title = newTitle.trim()
    if (!title) {
      toast.error('Section title is required')
      return
    }

    try {
      const currentSections = sections || []
      await createSection({
        event_id: props.eventId,
        section_type: type,
        title,
        content: newContent,
        sort_order: currentSections.length,
      })
      toast.success('Section created successfully')
      cancelAdd()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create section')
    }
  }

  // --- Edit Section Flow ---

  const startEdit = (section: EventPageSection) => {
    setEditingSection(section.id)
    setEditTitle(section.title)
    setEditContent(JSON.parse(JSON.stringify(section.content || getDefaultContent(section.section_type))))
  }

  const cancelEdit = () => {
    setEditingSection(null)
    setEditTitle('')
    setEditContent({})
  }

  const handleSaveSection = async (sectionId: string) => {
    const title = editTitle.trim()
    if (!title) {
      toast.error('Section title is required')
      return
    }

    try {
      await updateSection(sectionId, {
        title,
        content: editContent,
      })
      toast.success('Section saved successfully')
      cancelEdit()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save section')
    }
  }

  // --- Visibility Toggle ---

  const toggleVisibility = async (section: EventPageSection) => {
    try {
      await updateSection(section.id, { is_visible: !section.is_visible })
      toast.success(section.is_visible ? 'Section hidden' : 'Section visible')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle visibility')
    }
  }

  // --- Reorder ---

  const handleMoveUp = async (index: number) => {
    const currentSections = sections
    if (!currentSections || index <= 0) return

    const ids = currentSections.map((s) => s.id)
    const temp = ids[index]
    ids[index] = ids[index - 1]
    ids[index - 1] = temp

    try {
      await reorderSections(ids)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reorder sections')
    }
  }

  const handleMoveDown = async (index: number) => {
    const currentSections = sections
    if (!currentSections || index >= currentSections.length - 1) return

    const ids = currentSections.map((s) => s.id)
    const temp = ids[index]
    ids[index] = ids[index + 1]
    ids[index + 1] = temp

    try {
      await reorderSections(ids)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reorder sections')
    }
  }

  // --- Delete ---

  const handleDelete = async () => {
    const id = deleteTarget
    if (!id) return

    try {
      await deleteSection(id)
      toast.success('Section deleted')
      setDeleteTarget(null)
      if (editingSection === id) {
        cancelEdit()
      }
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete section')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ktip-sand-900 font-display">Page Sections</h3>
        {!addMode && !showTypeSelector && (
          <div className="relative">
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowTypeSelector(true)}
            >
              Add Section
            </Button>
          </div>
        )}
      </div>

      {/* Type Selector Dropdown */}
      {showTypeSelector && (
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-ktip-sand-900">Choose Section Type</h4>
            <button
              type="button"
              onClick={() => setShowTypeSelector(false)}
              className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SECTION_TYPE_OPTIONS.map((option) => {
              const Icon = SECTION_TYPE_ICONS[option.value]
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelectType(option.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-ktip-sand-200 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50 transition-all text-center group"
                >
                  <div className="w-10 h-10 rounded-lg bg-ktip-sand-100 group-hover:bg-ktip-ocean-100 flex items-center justify-center transition-colors">
                    <Icon size={20} className="text-ktip-sand-500 group-hover:text-ktip-ocean-600 transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-ktip-sand-700 group-hover:text-ktip-ocean-700 transition-colors">
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* New Section Editor */}
      {addMode && (
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-ktip-sand-900">
                New {EVENT_SECTION_TYPE_LABELS[addMode] || addMode} Section
              </h4>
              <Badge size="sm" className={SECTION_TYPE_BADGE_VARIANTS[addMode]}>
                {EVENT_SECTION_TYPE_LABELS[addMode] || addMode}
              </Badge>
            </div>
            <button
              type="button"
              onClick={cancelAdd}
              className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">Section Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.currentTarget.value)}
              className={INPUT_CLASS}
              placeholder="Section title..."
            />
          </div>

          {renderContentEditor(addMode, newContent, setNewContent)}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={cancelAdd} type="button">
              Cancel
            </Button>
            <Button
              size="sm"
              icon={<Save size={14} />}
              onClick={handleCreateSection}
              loading={creating}
            >
              Create Section
            </Button>
          </div>
        </div>
      )}

      {/* Sections List */}
      {sectionsLoading ? (
        <div className="text-center text-ktip-sand-500 py-8">Loading sections...</div>
      ) : sections?.length ? (
        <div className="space-y-3">
          {sections.map((section, index) => {
            const Icon = SECTION_TYPE_ICONS[section.section_type] || FileText
            const isEditing = editingSection === section.id

            return (
              <div
                key={section.id}
                className={cn(
                  'bg-ktip-cream rounded-xl border shadow-card transition-all',
                  isEditing
                    ? 'border-ktip-ocean-300 ring-2 ring-ktip-ocean-500/10'
                    : 'border-ktip-sand-200'
                )}
              >
                {/* Section Header Row */}
                <div className="flex items-center gap-3 p-4">
                  {/* Icon */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      section.is_visible ? 'bg-ktip-ocean-100' : 'bg-ktip-sand-100'
                    )}
                  >
                    <Icon
                      size={16}
                      className={section.is_visible ? 'text-ktip-ocean-600' : 'text-ktip-sand-400'}
                    />
                  </div>

                  {/* Title + Badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4
                        className={cn(
                          'font-medium truncate',
                          section.is_visible ? 'text-ktip-sand-900' : 'text-ktip-sand-400'
                        )}
                      >
                        {section.title}
                      </h4>
                      <Badge size="sm" className={SECTION_TYPE_BADGE_VARIANTS[section.section_type]}>
                        {EVENT_SECTION_TYPE_LABELS[section.section_type] || section.section_type}
                      </Badge>
                      {!section.is_visible && (
                        <Badge size="sm" className="bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200">
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-ktip-sand-400 mt-0.5">
                      Order: {section.sort_order}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {/* Visibility Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleVisibility(section)}
                      className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                      title={section.is_visible ? 'Hide section' : 'Show section'}
                    >
                      {section.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>

                    {/* Move Up */}
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || reordering}
                      className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp size={16} />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === (sections?.length || 0) - 1 || reordering}
                      className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown size={16} />
                    </button>

                    {/* Edit Toggle */}
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEdit(section)}
                        className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                        title="Edit"
                      >
                        <FileText size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="p-1.5 text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                        title="Close editor"
                      >
                        <X size={16} />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(section.id)}
                      className="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Collapsible Editor */}
                {isEditing && (
                  <div className="border-t border-ktip-sand-200 p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                        Section Title
                      </label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.currentTarget.value)}
                        className={INPUT_CLASS}
                        placeholder="Section title..."
                      />
                    </div>

                    {renderContentEditor(section.section_type, editContent, setEditContent)}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={cancelEdit} type="button">
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        icon={<Save size={14} />}
                        onClick={() => handleSaveSection(section.id)}
                        loading={updating}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        !addMode && !showTypeSelector && (
          <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
            <FileText size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 mb-1 font-display">
              No page sections yet
            </h3>
            <p className="text-ktip-sand-500 text-sm mb-4">
              Add sections like About, FAQ, Venue, or Sponsors to build your event page
            </p>
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowTypeSelector(true)}
            >
              Add First Section
            </Button>
          </div>
        )
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Section"
        message="Are you sure you want to delete this page section? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
