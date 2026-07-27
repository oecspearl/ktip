import { createSignal, Show, For } from 'solid-js'
import { Button } from '../ui/Button'
import { Send, X } from 'lucide-solid'
import type { RegistrationFieldConfig } from '../../types'

interface EventRegistrationFormProps {
  fields: RegistrationFieldConfig[]
  onSubmit: (data: Record<string, any>) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputBase =
  'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'
const inputNormal = `${inputBase} border-ktip-sand-200`
const inputError = `${inputBase} border-red-300`

export function EventRegistrationForm(props: EventRegistrationFormProps) {
  const [formData, setFormData] = createSignal<Record<string, any>>({})
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const initializeDefaults = () => {
    const data: Record<string, any> = {}
    for (const field of props.fields) {
      if (field.type === 'checkbox') {
        data[field.id] = false
      } else {
        data[field.id] = ''
      }
    }
    return data
  }

  // Initialize form data on first access if empty
  const getFormData = () => {
    const current = formData()
    if (Object.keys(current).length === 0 && props.fields.length > 0) {
      const defaults = initializeDefaults()
      setFormData(defaults)
      return defaults
    }
    return current
  }

  const updateField = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }))
    // Clear error when user edits a field
    setErrors((prev) => {
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    const data = getFormData()

    for (const field of props.fields) {
      const value = data[field.id]

      if (field.required) {
        if (field.type === 'checkbox') {
          // Checkbox required means it must be checked
          if (!value) {
            newErrors[field.id] = `${field.label} is required`
          }
        } else if (!value || (typeof value === 'string' && value.trim() === '')) {
          newErrors[field.id] = `${field.label} is required`
        }
      }

      if (field.type === 'email' && value && typeof value === 'string' && value.trim() !== '') {
        if (!EMAIL_REGEX.test(value)) {
          newErrors[field.id] = 'Please enter a valid email address'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!validate()) return
    await props.onSubmit(getFormData())
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-5">
      <h3 class="text-lg font-semibold text-ktip-sand-800">Registration Form</h3>

      <For each={props.fields}>
        {(field) => (
          <div>
            <Show when={field.type !== 'checkbox'}>
              <label class="block text-sm font-medium text-ktip-sand-700 mb-1.5">
                {field.label}
                <Show when={field.required}>
                  <span class="text-red-500 ml-0.5">*</span>
                </Show>
              </label>
            </Show>

            <Show when={field.helpText}>
              <p class="text-xs text-ktip-sand-400 mb-1.5">{field.helpText}</p>
            </Show>

            {/* Text input */}
            <Show when={field.type === 'text'}>
              <input
                type="text"
                class={errors()[field.id] ? inputError : inputNormal}
                placeholder={field.placeholder}
                value={(getFormData()[field.id] as string) || ''}
                onInput={(e) => updateField(field.id, e.currentTarget.value)}
              />
            </Show>

            {/* Textarea */}
            <Show when={field.type === 'textarea'}>
              <textarea
                rows={4}
                class={errors()[field.id] ? inputError : inputNormal}
                placeholder={field.placeholder}
                value={(getFormData()[field.id] as string) || ''}
                onInput={(e) => updateField(field.id, e.currentTarget.value)}
              />
            </Show>

            {/* Number input */}
            <Show when={field.type === 'number'}>
              <input
                type="number"
                class={errors()[field.id] ? inputError : inputNormal}
                placeholder={field.placeholder}
                value={(getFormData()[field.id] as string) || ''}
                onInput={(e) => updateField(field.id, e.currentTarget.value)}
              />
            </Show>

            {/* Email input */}
            <Show when={field.type === 'email'}>
              <input
                type="email"
                class={errors()[field.id] ? inputError : inputNormal}
                placeholder={field.placeholder}
                value={(getFormData()[field.id] as string) || ''}
                onInput={(e) => updateField(field.id, e.currentTarget.value)}
              />
            </Show>

            {/* Select dropdown */}
            <Show when={field.type === 'select'}>
              <select
                class={errors()[field.id] ? inputError : inputNormal}
                value={(getFormData()[field.id] as string) || ''}
                onChange={(e) => updateField(field.id, e.currentTarget.value)}
              >
                <option value="">{field.placeholder || 'Select an option'}</option>
                <For each={field.options}>
                  {(option) => <option value={option.value}>{option.label}</option>}
                </For>
              </select>
            </Show>

            {/* Checkbox */}
            <Show when={field.type === 'checkbox'}>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  class="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
                  checked={!!getFormData()[field.id]}
                  onChange={(e) => updateField(field.id, e.currentTarget.checked)}
                />
                <span class="text-sm text-ktip-sand-700">
                  {field.label}
                  <Show when={field.required}>
                    <span class="text-red-500 ml-0.5">*</span>
                  </Show>
                </span>
              </label>
            </Show>

            {/* Date input */}
            <Show when={field.type === 'date'}>
              <input
                type="date"
                class={errors()[field.id] ? inputError : inputNormal}
                placeholder={field.placeholder}
                value={(getFormData()[field.id] as string) || ''}
                onInput={(e) => updateField(field.id, e.currentTarget.value)}
              />
            </Show>

            {/* Error message */}
            <Show when={errors()[field.id]}>
              <p class="text-xs text-red-500 mt-1">{errors()[field.id]}</p>
            </Show>
          </div>
        )}
      </For>

      <div class="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          variant="primary"
          loading={props.loading}
          disabled={props.loading}
          icon={<Send size={16} />}
        >
          Submit Registration
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => props.onCancel()}
          disabled={props.loading}
          icon={<X size={16} />}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
