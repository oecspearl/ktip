import type { StepConfig } from '../../../lib/grant-application-template'
import { RichTextField } from './RichTextField'
import { AIFieldActions } from './AIFieldActions'
import { ApplicationDocumentsField } from './ApplicationDocumentsField'
import { HelpCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { RequiredDocument } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface StepFormProps {
  step: StepConfig
  data: Record<string, any>
  onChange: (field: string, value: string) => void
  errors?: Record<string, string>
  grantTitle?: string
  applicationTitle?: string
  /** Everything the 'documents' field needs; unused by the other steps. */
  applicationId?: string | null
  requiredDocuments?: RequiredDocument[]
  onSaveDraft?: () => Promise<void>
}

export function StepForm({
  step,
  data,
  onChange,
  errors,
  grantTitle,
  applicationTitle,
  applicationId = null,
  requiredDocuments,
  onSaveDraft,
}: StepFormProps) {
  const { i18n } = useLingui()
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ktip-sand-900">{i18n._(step.title)}</h3>
        <p className="text-sm text-ktip-sand-500 mt-1">{i18n._(step.description)}</p>
      </div>

      <div className="space-y-5">
        {step.fields.map((field) => {
          const value = data[field.name] || ''
          const error = errors?.[field.name]
          const label = i18n._(field.label)
          const helpText = field.helpText ? i18n._(field.helpText) : undefined
          const placeholder = field.placeholder ? i18n._(field.placeholder) : undefined

          return (
            <div key={field.name}>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1.5">
                {label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>

              {helpText && (
                <p className="text-xs text-ktip-sand-400 mb-1.5 flex items-start gap-1">
                  <HelpCircle size={12} className="shrink-0 mt-0.5" />
                  {helpText}
                </p>
              )}

              {field.type === 'documents' ? (
                <ApplicationDocumentsField
                  applicationId={applicationId}
                  requiredDocuments={requiredDocuments || []}
                  onSaveDraft={onSaveDraft || (async () => {})}
                />
              ) : field.type === 'textarea' ? (
                <>
                  <RichTextField
                    value={value}
                    onChange={(html) => onChange(field.name, html)}
                    placeholder={placeholder}
                    minHeight={`${(field.rows || 4) * 28}px`}
                    error={!!error}
                  />
                  {grantTitle && (
                    <AIFieldActions
                      grantTitle={grantTitle}
                      fieldLabel={label}
                      fieldValue={value}
                      helpText={helpText}
                      placeholder={placeholder}
                      applicationTitle={applicationTitle}
                      existingData={data}
                      onReplace={(html) => onChange(field.name, html)}
                    />
                  )}
                </>
              ) : field.type === 'select' ? (
                <select
                  value={value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  className={cn(
                    'w-full px-3 py-2.5 border rounded-xl text-sm text-ktip-sand-900 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 bg-ktip-cream',
                    error ? 'border-red-300' : 'border-ktip-sand-200'
                  )}
                >
                  <option value=""><Trans>Select...</Trans></option>
                  {(field.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={placeholder}
                  className={cn(
                    'w-full px-3 py-2.5 border rounded-xl text-sm text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500',
                    error ? 'border-red-300' : 'border-ktip-sand-200'
                  )}
                />
              )}

              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
