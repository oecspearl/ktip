import { createSignal, Show, For, Suspense } from 'solid-js'
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
} from 'lucide-solid'

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
  faq: 'bg-purple-100 text-purple-700 border-purple-200',
  venue: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
  sponsors: 'bg-pink-100 text-pink-700 border-pink-200',
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

export default function AdminEventPageBuilderTab(props: AdminEventPageBuilderTabProps) {
  const toast = useToast()

  const { sections, refetch } = useEventPageSections(() => props.eventId)
  const { createSection, loading: creating } = useCreateSection()
  const { updateSection, loading: updating } = useUpdateSection()
  const { deleteSection, loading: deleting } = useDeleteSection()
  const { reorderSections, loading: reordering } = useReorderSections()

  // Track which section is being edited (by id), or null
  const [editingSection, setEditingSection] = createSignal<string | null>(null)
  // Track add mode: null = not adding, or the chosen section type
  const [addMode, setAddMode] = createSignal<EventSectionType | null>(null)
  // Show the type selection dropdown
  const [showTypeSelector, setShowTypeSelector] = createSignal(false)
  // Delete confirmation target
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null)

  // Editing form state (for existing sections)
  const [editTitle, setEditTitle] = createSignal('')
  const [editContent, setEditContent] = createSignal<Record<string, any>>({})

  // New section form state
  const [newTitle, setNewTitle] = createSignal('')
  const [newContent, setNewContent] = createSignal<Record<string, any>>({})

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
    const type = addMode()
    if (!type) return

    const title = newTitle().trim()
    if (!title) {
      toast.error('Section title is required')
      return
    }

    try {
      const currentSections = sections() || []
      await createSection({
        event_id: props.eventId,
        section_type: type,
        title,
        content: newContent(),
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
    const title = editTitle().trim()
    if (!title) {
      toast.error('Section title is required')
      return
    }

    try {
      await updateSection(sectionId, {
        title,
        content: editContent(),
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
    const currentSections = sections()
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
    const currentSections = sections()
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
    const id = deleteTarget()
    if (!id) return

    try {
      await deleteSection(id)
      toast.success('Section deleted')
      setDeleteTarget(null)
      if (editingSection() === id) {
        cancelEdit()
      }
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete section')
    }
  }

  // --- Content editors (shared between new and edit) ---

  function AboutCustomEditor(editorProps: {
    content: () => Record<string, any>
    setContent: (c: Record<string, any>) => void
  }) {
    return (
      <div>
        <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Body Content</label>
        <textarea
          value={editorProps.content().body || ''}
          onInput={(e) =>
            editorProps.setContent({ ...editorProps.content(), body: e.currentTarget.value })
          }
          rows={6}
          class={cn(INPUT_CLASS, 'resize-none')}
          placeholder="Write the section content..."
        />
      </div>
    )
  }

  function FaqEditor(editorProps: {
    content: () => Record<string, any>
    setContent: (c: Record<string, any>) => void
  }) {
    const items = () => (editorProps.content().items as { question: string; answer: string }[]) || []

    const updateItem = (index: number, field: 'question' | 'answer', value: string) => {
      const updated = [...items()]
      updated[index] = { ...updated[index], [field]: value }
      editorProps.setContent({ ...editorProps.content(), items: updated })
    }

    const addItem = () => {
      editorProps.setContent({
        ...editorProps.content(),
        items: [...items(), { question: '', answer: '' }],
      })
    }

    const removeItem = (index: number) => {
      const updated = items().filter((_, i) => i !== index)
      editorProps.setContent({ ...editorProps.content(), items: updated })
    }

    return (
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium text-ktip-sand-700">Q&A Pairs</label>
          <button
            type="button"
            onClick={addItem}
            class="inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
          >
            <Plus size={14} />
            Add Q&A
          </button>
        </div>
        <For each={items()}>
          {(item, index) => (
            <div class="relative bg-ktip-sand-50 rounded-lg p-4 space-y-2">
              <button
                type="button"
                onClick={() => removeItem(index())}
                class="absolute top-2 right-2 p-1 text-ktip-sand-400 hover:text-red-500 transition-colors"
                title="Remove Q&A"
              >
                <X size={14} />
              </button>
              <div>
                <label class="block text-xs font-medium text-ktip-sand-600 mb-1">
                  Question {index() + 1}
                </label>
                <input
                  type="text"
                  value={item.question}
                  onInput={(e) => updateItem(index(), 'question', e.currentTarget.value)}
                  class={INPUT_CLASS}
                  placeholder="Enter question..."
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-ktip-sand-600 mb-1">Answer</label>
                <textarea
                  value={item.answer}
                  onInput={(e) => updateItem(index(), 'answer', e.currentTarget.value)}
                  rows={2}
                  class={cn(INPUT_CLASS, 'resize-none')}
                  placeholder="Enter answer..."
                />
              </div>
            </div>
          )}
        </For>
        <Show when={items().length === 0}>
          <p class="text-sm text-ktip-sand-400 text-center py-4">
            No Q&A pairs yet. Click "Add Q&A" to get started.
          </p>
        </Show>
      </div>
    )
  }

  function VenueEditor(editorProps: {
    content: () => Record<string, any>
    setContent: (c: Record<string, any>) => void
  }) {
    const updateField = (field: string, value: string) => {
      editorProps.setContent({ ...editorProps.content(), [field]: value })
    }

    return (
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Venue Name</label>
          <input
            type="text"
            value={editorProps.content().name || ''}
            onInput={(e) => updateField('name', e.currentTarget.value)}
            class={INPUT_CLASS}
            placeholder="e.g., National Cultural Centre"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Address</label>
          <input
            type="text"
            value={editorProps.content().address || ''}
            onInput={(e) => updateField('address', e.currentTarget.value)}
            class={INPUT_CLASS}
            placeholder="Full street address..."
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Map URL</label>
          <input
            type="url"
            value={editorProps.content().map_url || ''}
            onInput={(e) => updateField('map_url', e.currentTarget.value)}
            class={INPUT_CLASS}
            placeholder="https://maps.google.com/..."
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Directions</label>
          <textarea
            value={editorProps.content().directions || ''}
            onInput={(e) => updateField('directions', e.currentTarget.value)}
            rows={3}
            class={cn(INPUT_CLASS, 'resize-none')}
            placeholder="How to get to the venue..."
          />
        </div>
      </div>
    )
  }

  function SponsorsEditor(editorProps: {
    content: () => Record<string, any>
    setContent: (c: Record<string, any>) => void
  }) {
    const items = () =>
      (editorProps.content().items as { name: string; logo_url: string; website: string }[]) || []

    const updateItem = (index: number, field: 'name' | 'logo_url' | 'website', value: string) => {
      const updated = [...items()]
      updated[index] = { ...updated[index], [field]: value }
      editorProps.setContent({ ...editorProps.content(), items: updated })
    }

    const addItem = () => {
      editorProps.setContent({
        ...editorProps.content(),
        items: [...items(), { name: '', logo_url: '', website: '' }],
      })
    }

    const removeItem = (index: number) => {
      const updated = items().filter((_, i) => i !== index)
      editorProps.setContent({ ...editorProps.content(), items: updated })
    }

    return (
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium text-ktip-sand-700">Sponsors</label>
          <button
            type="button"
            onClick={addItem}
            class="inline-flex items-center gap-1 text-xs font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
          >
            <Plus size={14} />
            Add Sponsor
          </button>
        </div>
        <For each={items()}>
          {(item, index) => (
            <div class="relative bg-ktip-sand-50 rounded-lg p-4 space-y-2">
              <button
                type="button"
                onClick={() => removeItem(index())}
                class="absolute top-2 right-2 p-1 text-ktip-sand-400 hover:text-red-500 transition-colors"
                title="Remove sponsor"
              >
                <X size={14} />
              </button>
              <div>
                <label class="block text-xs font-medium text-ktip-sand-600 mb-1">
                  Sponsor Name
                </label>
                <input
                  type="text"
                  value={item.name}
                  onInput={(e) => updateItem(index(), 'name', e.currentTarget.value)}
                  class={INPUT_CLASS}
                  placeholder="Sponsor name..."
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-ktip-sand-600 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={item.logo_url}
                  onInput={(e) => updateItem(index(), 'logo_url', e.currentTarget.value)}
                  class={INPUT_CLASS}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-ktip-sand-600 mb-1">Website</label>
                <input
                  type="url"
                  value={item.website}
                  onInput={(e) => updateItem(index(), 'website', e.currentTarget.value)}
                  class={INPUT_CLASS}
                  placeholder="https://sponsor-website.com"
                />
              </div>
            </div>
          )}
        </For>
        <Show when={items().length === 0}>
          <p class="text-sm text-ktip-sand-400 text-center py-4">
            No sponsors yet. Click "Add Sponsor" to get started.
          </p>
        </Show>
      </div>
    )
  }

  function renderContentEditor(
    type: EventSectionType,
    content: () => Record<string, any>,
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

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-ktip-sand-900 font-display">Page Sections</h3>
        <Show when={!addMode() && !showTypeSelector()}>
          <div class="relative">
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowTypeSelector(true)}
            >
              Add Section
            </Button>
          </div>
        </Show>
      </div>

      {/* Type Selector Dropdown */}
      <Show when={showTypeSelector()}>
        <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-medium text-ktip-sand-900">Choose Section Type</h4>
            <button
              type="button"
              onClick={() => setShowTypeSelector(false)}
              class="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <For each={SECTION_TYPE_OPTIONS}>
              {(option) => {
                const Icon = SECTION_TYPE_ICONS[option.value]
                return (
                  <button
                    type="button"
                    onClick={() => handleSelectType(option.value)}
                    class="flex flex-col items-center gap-2 p-4 rounded-xl border border-ktip-sand-200 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50 transition-all text-center group"
                  >
                    <div class="w-10 h-10 rounded-lg bg-ktip-sand-100 group-hover:bg-ktip-ocean-100 flex items-center justify-center transition-colors">
                      <Icon size={20} class="text-ktip-sand-500 group-hover:text-ktip-ocean-600 transition-colors" />
                    </div>
                    <span class="text-sm font-medium text-ktip-sand-700 group-hover:text-ktip-ocean-700 transition-colors">
                      {option.label}
                    </span>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* New Section Editor */}
      <Show when={addMode()}>
        {(type) => (
          <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <h4 class="font-medium text-ktip-sand-900">
                  New {EVENT_SECTION_TYPE_LABELS[type()] || type()} Section
                </h4>
                <Badge size="sm" class={SECTION_TYPE_BADGE_VARIANTS[type()]}>
                  {EVENT_SECTION_TYPE_LABELS[type()] || type()}
                </Badge>
              </div>
              <button
                type="button"
                onClick={cancelAdd}
                class="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1">Section Title</label>
              <input
                type="text"
                value={newTitle()}
                onInput={(e) => setNewTitle(e.currentTarget.value)}
                class={INPUT_CLASS}
                placeholder="Section title..."
              />
            </div>

            {renderContentEditor(type(), newContent, setNewContent)}

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={cancelAdd} type="button">
                Cancel
              </Button>
              <Button
                size="sm"
                icon={<Save size={14} />}
                onClick={handleCreateSection}
                loading={creating()}
              >
                Create Section
              </Button>
            </div>
          </div>
        )}
      </Show>

      {/* Sections List */}
      <Suspense
        fallback={
          <div class="text-center text-ktip-sand-500 py-8">Loading sections...</div>
        }
      >
        <Show
          when={sections()?.length}
          fallback={
            <Show when={!addMode() && !showTypeSelector()}>
              <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-12 text-center">
                <FileText size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                <h3 class="text-lg font-semibold text-ktip-sand-700 mb-1 font-display">
                  No page sections yet
                </h3>
                <p class="text-ktip-sand-500 text-sm mb-4">
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
            </Show>
          }
        >
          <div class="space-y-3">
            <For each={sections()}>
              {(section, index) => {
                const Icon = SECTION_TYPE_ICONS[section.section_type] || FileText
                const isEditing = () => editingSection() === section.id

                return (
                  <div
                    class={cn(
                      'bg-white rounded-xl border shadow-card transition-all',
                      isEditing()
                        ? 'border-ktip-ocean-300 ring-2 ring-ktip-ocean-500/10'
                        : 'border-ktip-sand-200'
                    )}
                  >
                    {/* Section Header Row */}
                    <div class="flex items-center gap-3 p-4">
                      {/* Icon */}
                      <div
                        class={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          section.is_visible ? 'bg-ktip-ocean-100' : 'bg-ktip-sand-100'
                        )}
                      >
                        <Icon
                          size={16}
                          class={section.is_visible ? 'text-ktip-ocean-600' : 'text-ktip-sand-400'}
                        />
                      </div>

                      {/* Title + Badge */}
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <h4
                            class={cn(
                              'font-medium truncate',
                              section.is_visible ? 'text-ktip-sand-900' : 'text-ktip-sand-400'
                            )}
                          >
                            {section.title}
                          </h4>
                          <Badge size="sm" class={SECTION_TYPE_BADGE_VARIANTS[section.section_type]}>
                            {EVENT_SECTION_TYPE_LABELS[section.section_type] || section.section_type}
                          </Badge>
                          <Show when={!section.is_visible}>
                            <Badge size="sm" class="bg-yellow-100 text-yellow-700 border-yellow-200">
                              Hidden
                            </Badge>
                          </Show>
                        </div>
                        <p class="text-xs text-ktip-sand-400 mt-0.5">
                          Order: {section.sort_order}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div class="flex items-center gap-0.5 flex-shrink-0">
                        {/* Visibility Toggle */}
                        <button
                          type="button"
                          onClick={() => toggleVisibility(section)}
                          class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                          title={section.is_visible ? 'Hide section' : 'Show section'}
                        >
                          {section.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>

                        {/* Move Up */}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index())}
                          disabled={index() === 0 || reordering()}
                          class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ChevronUp size={16} />
                        </button>

                        {/* Move Down */}
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index())}
                          disabled={index() === (sections()?.length || 0) - 1 || reordering()}
                          class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ChevronDown size={16} />
                        </button>

                        {/* Edit Toggle */}
                        <Show
                          when={!isEditing()}
                          fallback={
                            <button
                              type="button"
                              onClick={cancelEdit}
                              class="p-1.5 text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                              title="Close editor"
                            >
                              <X size={16} />
                            </button>
                          }
                        >
                          <button
                            type="button"
                            onClick={() => startEdit(section)}
                            class="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                            title="Edit"
                          >
                            <FileText size={16} />
                          </button>
                        </Show>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(section.id)}
                          class="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Editor */}
                    <Show when={isEditing()}>
                      <div class="border-t border-ktip-sand-200 p-4 space-y-4">
                        <div>
                          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
                            Section Title
                          </label>
                          <input
                            type="text"
                            value={editTitle()}
                            onInput={(e) => setEditTitle(e.currentTarget.value)}
                            class={INPUT_CLASS}
                            placeholder="Section title..."
                          />
                        </div>

                        {renderContentEditor(section.section_type, editContent, setEditContent)}

                        <div class="flex justify-end gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={cancelEdit} type="button">
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            icon={<Save size={14} />}
                            onClick={() => handleSaveSection(section.id)}
                            loading={updating()}
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </Suspense>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget()}
        title="Delete Section"
        message="Are you sure you want to delete this page section? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting()}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
