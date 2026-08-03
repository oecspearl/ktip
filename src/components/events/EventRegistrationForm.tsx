import { useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Send, X } from 'lucide-react'
import type { RegistrationFieldConfig } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

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

function initializeDefaults(fields: RegistrationFieldConfig[]) {
  const data: Record<string, any> = {}
  for (const field of fields) {
    if (field.type === 'checkbox') {
      data[field.id] = false
    } else {
      data[field.id] = ''
    }
  }
  return data
}

export function EventRegistrationForm({ fields, onSubmit, onCancel, loading }: EventRegistrationFormProps) {
    const { t } = useLingui()
  const [formData, setFormData] = useState<Record<string, any>>(() => initializeDefaults(fields))
  const [errors, setErrors] = useState<Record<string, string>>({})

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

    for (const field of fields) {
      const value = formData[field.id]

      if (field.required) {
        if (field.type === 'checkbox') {
          // Checkbox required means it must be checked
          if (!value) {
            newErrors[field.id] = t`${field.label} is required`
          }
        } else if (!value || (typeof value === 'string' && value.trim() === '')) {
          newErrors[field.id] = t`${field.label} is required`
        }
      }

      if (field.type === 'email' && value && typeof value === 'string' && value.trim() !== '') {
        if (!EMAIL_REGEX.test(value)) {
          newErrors[field.id] = t`Please enter a valid email address`
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h3 className="text-lg font-semibold text-ktip-sand-800"><Trans>Registration Form</Trans></h3>

      {fields.map((field) => (
        <div key={field.id}>
          {field.type !== 'checkbox' && (
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1.5">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
          )}

          {field.helpText && (
            <p className="text-xs text-ktip-sand-400 mb-1.5">{field.helpText}</p>
          )}

          {/* Text input */}
          {field.type === 'text' && (
            <input
              type="text"
              className={errors[field.id] ? inputError : inputNormal}
              placeholder={field.placeholder}
              value={(formData[field.id] as string) || ''}
              onChange={(e) => updateField(field.id, e.target.value)}
            />
          )}

          {/* Textarea */}
          {field.type === 'textarea' && (
            <textarea
              rows={4}
              className={errors[field.id] ? inputError : inputNormal}
              placeholder={field.placeholder}
              value={(formData[field.id] as string) || ''}
              onChange={(e) => updateField(field.id, e.target.value)}
            />
          )}

          {/* Number input */}
          {field.type === 'number' && (
            <input
              type="number"
              className={errors[field.id] ? inputError : inputNormal}
              placeholder={field.placeholder}
              value={(formData[field.id] as string) || ''}
              onChange={(e) => updateField(field.id, e.target.value)}
            />
          )}

          {/* Email input */}
          {field.type === 'email' && (
            <input
              type="email"
              className={errors[field.id] ? inputError : inputNormal}
              placeholder={field.placeholder}
              value={(formData[field.id] as string) || ''}
              onChange={(e) => updateField(field.id, e.target.value)}
            />
          )}

          {/* Select dropdown */}
          {field.type === 'select' && (
            <select
              className={errors[field.id] ? inputError : inputNormal}
              value={(formData[field.id] as string) || ''}
              onChange={(e) => updateField(field.id, e.target.value)}
            >
              <option value="">{field.placeholder || t`Select an option`}</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}

          {/* Checkbox */}
          {field.type === 'checkbox' && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
                checked={!!formData[field.id]}
                onChange={(e) => updateField(field.id, e.target.checked)}
              />
              <span className="text-sm text-ktip-sand-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </span>
            </label>
          )}

          {/* Date input */}
          {field.type === 'date' && (
            <input
              type="date"
              className={errors[field.id] ? inputError : inputNormal}
              placeholder={field.placeholder}
              value={(formData[field.id] as string) || ''}
              onChange={(e) => updateField(field.id, e.target.value)}
            />
          )}

          {/* Error message */}
          {errors[field.id] && (
            <p className="text-xs text-red-500 mt-1">{errors[field.id]}</p>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          disabled={loading}
          icon={<Send size={16} />}
        >
          <Trans>Submit Registration</Trans>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onCancel()}
          disabled={loading}
          icon={<X size={16} />}
        >
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </form>
  )
}
