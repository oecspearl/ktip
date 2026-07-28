import { useEffect, useState } from 'react'
import { useRegistrationFields, useUpdateRegistrationFields } from '../../../hooks/useEventRegistrationForm'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { Plus, Trash2, Edit, ChevronUp, ChevronDown, Save, FormInput, GripVertical, X } from 'lucide-react'
import type { RegistrationFieldConfig, RegistrationFieldType } from '../../../types'

const FIELD_TYPE_LABELS: Record<RegistrationFieldType, string> = {
  text: 'Text',
  textarea: 'Long Text',
  number: 'Number',
  email: 'Email',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  date: 'Date',
}

const FIELD_TYPE_BADGE_VARIANTS: Record<RegistrationFieldType, 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  text: 'default',
  textarea: 'info',
  number: 'warning',
  email: 'primary',
  select: 'success',
  checkbox: 'danger',
  date: 'info',
}

const FIELD_TYPES: RegistrationFieldType[] = ['text', 'textarea', 'number', 'email', 'select', 'checkbox', 'date']

function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function createEmptyField(): RegistrationFieldConfig {
  return {
    id: generateFieldId(),
    label: '',
    type: 'text',
    placeholder: '',
    required: false,
    options: [],
    helpText: '',
  }
}

interface AdminEventFormBuilderTabProps {
  eventId: string
}

export default function AdminEventFormBuilderTab({ eventId }: AdminEventFormBuilderTabProps) {
  const toast = useToast()
  const { fields: fetchedFields, refetch } = useRegistrationFields(eventId)
  const { updateFields, loading: saving } = useUpdateRegistrationFields()

  // Local working copy of fields
  const [fields, setFields] = useState<RegistrationFieldConfig[]>([])
  const [initialized, setInitialized] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [formData, setFormData] = useState<RegistrationFieldConfig>(createEmptyField())
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Sync fetched fields into local state once loaded
  useEffect(() => {
    if (fetchedFields && !initialized) {
      setFields(fetchedFields)
      setInitialized(true)
    }
  }, [fetchedFields, initialized])

  // --- Option management for select fields ---
  const addOption = () => {
    setFormData({
      ...formData,
      options: [...(formData.options || []), { value: '', label: '' }],
    })
  }

  const updateOption = (index: number, key: 'value' | 'label', value: string) => {
    const newOptions = [...(formData.options || [])]
    newOptions[index] = { ...newOptions[index], [key]: value }
    setFormData({ ...formData, options: newOptions })
  }

  const removeOption = (index: number) => {
    const newOptions = [...(formData.options || [])]
    newOptions.splice(index, 1)
    setFormData({ ...formData, options: newOptions })
  }

  // --- Form actions ---
  const resetForm = () => {
    setShowForm(false)
    setEditingFieldId(null)
    setFormData(createEmptyField())
    setFormErrors({})
  }

  const startAdd = () => {
    resetForm()
    setFormData(createEmptyField())
    setShowForm(true)
  }

  const startEdit = (field: RegistrationFieldConfig) => {
    setEditingFieldId(field.id)
    setFormData({
      ...field,
      placeholder: field.placeholder || '',
      helpText: field.helpText || '',
      options: field.options ? [...field.options.map((o) => ({ ...o }))] : [],
    })
    setFormErrors({})
    setShowForm(true)
  }

  const validateForm = (): boolean => {
    const data = formData
    const errors: Record<string, string> = {}

    if (!data.label.trim()) {
      errors.label = 'Label is required'
    }

    if (data.type === 'select') {
      const opts = data.options || []
      if (opts.length === 0) {
        errors.options = 'At least one option is required for dropdown fields'
      } else {
        const hasEmpty = opts.some((o) => !o.value.trim() || !o.label.trim())
        if (hasEmpty) {
          errors.options = 'All options must have a value and label'
        }
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmitField = () => {
    if (!validateForm()) return

    const data = formData
    const cleaned: RegistrationFieldConfig = {
      id: data.id,
      label: data.label.trim(),
      type: data.type,
      required: data.required,
      placeholder: data.placeholder?.trim() || undefined,
      helpText: data.helpText?.trim() || undefined,
      options: data.type === 'select' ? data.options : undefined,
    }

    if (editingFieldId) {
      // Update existing field
      setFields(fields.map((f) => (f.id === editingFieldId ? cleaned : f)))
    } else {
      // Add new field
      setFields([...fields, cleaned])
    }

    resetForm()
  }

  // --- Reorder ---
  const moveField = (index: number, direction: 'up' | 'down') => {
    const current = [...fields]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= current.length) return

    const temp = current[index]
    current[index] = current[targetIndex]
    current[targetIndex] = temp
    setFields(current)
  }

  // --- Delete ---
  const confirmDelete = () => {
    const id = deleteTarget
    if (!id) return
    setFields(fields.filter((f) => f.id !== id))
    setDeleteTarget(null)

    // If we were editing this field, close the form
    if (editingFieldId === id) {
      resetForm()
    }
  }

  // --- Save ---
  const handleSave = async () => {
    try {
      await updateFields(eventId, fields)
      toast.success('Registration form saved successfully')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save registration form')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ktip-sand-900 font-display">Registration Form Builder</h3>
          <p className="text-sm text-ktip-sand-500 mt-0.5">
            Define the fields users fill out when registering for this event
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!showForm && (
            <Button
              size="sm"
              variant="outline"
              icon={<Plus size={14} />}
              onClick={startAdd}
            >
              Add Field
            </Button>
          )}
          <Button
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            loading={saving}
            disabled={saving}
          >
            Save Form
          </Button>
        </div>
      </div>

      {/* Inline Add/Edit Form */}
      {showForm && (
        <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-ktip-sand-900 font-display">
              {editingFieldId ? 'Edit Field' : 'Add New Field'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
              aria-label="Close form"
            >
              <X size={18} />
            </button>
          </div>

          {/* Label */}
          <Input
            label="Label"
            placeholder="e.g. Company Name"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.currentTarget.value })}
            error={formErrors.label}
            fullWidth
          />

          {/* Field Type */}
          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1.5">Field Type</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.currentTarget.value as RegistrationFieldType,
                })
              }
              className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 text-ktip-sand-900 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-ktip-cream"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>{FIELD_TYPE_LABELS[ft]}</option>
              ))}
            </select>
          </div>

          {/* Required toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.required}
              onChange={(e) => setFormData({ ...formData, required: e.currentTarget.checked })}
              className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500"
            />
            <span className="text-sm text-ktip-sand-700">Required field</span>
          </label>

          {/* Placeholder */}
          <Input
            label="Placeholder"
            placeholder="Optional placeholder text"
            value={formData.placeholder || ''}
            onChange={(e) => setFormData({ ...formData, placeholder: e.currentTarget.value })}
            fullWidth
          />

          {/* Help Text */}
          <Input
            label="Help Text"
            placeholder="Optional help text shown below the field"
            value={formData.helpText || ''}
            onChange={(e) => setFormData({ ...formData, helpText: e.currentTarget.value })}
            fullWidth
          />

          {/* Options (only for select type) */}
          {formData.type === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-ktip-sand-700">Dropdown Options</label>
                <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={addOption}>
                  Add Option
                </Button>
              </div>

              {formErrors.options && (
                <p className="text-sm text-red-600">{formErrors.options}</p>
              )}

              {(formData.options || []).length > 0 ? (
                <div className="space-y-2">
                  {(formData.options || []).map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Value"
                        value={option.value}
                        onChange={(e) => updateOption(index, 'value', e.currentTarget.value)}
                        fullWidth
                      />
                      <Input
                        placeholder="Label"
                        value={option.label}
                        onChange={(e) => updateOption(index, 'label', e.currentTarget.value)}
                        fullWidth
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="p-2 text-ktip-sand-400 hover:text-red-600 transition-colors flex-shrink-0"
                        aria-label="Remove option"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ktip-sand-400 italic">No options added yet. Click "Add Option" to begin.</p>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmitField}>
              {editingFieldId ? 'Update Field' : 'Add Field'}
            </Button>
          </div>
        </div>
      )}

      {/* Fields List */}
      {fields.length > 0 ? (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-soft p-4 flex items-center gap-4 group hover:shadow-card transition-shadow">
              {/* Drag handle indicator */}
              <div className="text-ktip-sand-300 flex-shrink-0">
                <GripVertical size={18} />
              </div>

              {/* Field info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ktip-sand-900">{field.label}</span>
                  <Badge size="sm" variant={FIELD_TYPE_BADGE_VARIANTS[field.type]}>
                    {FIELD_TYPE_LABELS[field.type]}
                  </Badge>
                  {field.required && (
                    <Badge size="sm" variant="danger">Required</Badge>
                  )}
                </div>
                {field.helpText && (
                  <p className="text-xs text-ktip-sand-400 mt-0.5">{field.helpText}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => moveField(index, 'up')}
                  disabled={index === 0}
                  className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveField(index, 'down')}
                  disabled={index === fields.length - 1}
                  className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(field)}
                  className="p-1.5 text-ktip-sand-400 hover:text-ktip-ocean-600 transition-colors"
                  title="Edit field"
                >
                  <Edit size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(field.id)}
                  className="p-1.5 text-ktip-sand-400 hover:text-red-600 transition-colors"
                  title="Delete field"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-soft p-12 text-center">
            <FormInput size={48} className="mx-auto text-ktip-sand-300 mb-4" />
            <h3 className="text-lg font-semibold text-ktip-sand-700 font-display mb-1">
              No registration fields yet
            </h3>
            <p className="text-ktip-sand-500 text-sm mb-6">
              Add fields to build a custom registration form for this event
            </p>
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={startAdd}
            >
              Add Your First Field
            </Button>
          </div>
        )
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Field"
        message="Are you sure you want to remove this field from the registration form? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={false}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
