import type { StepConfig } from '../../lib/proposal-templates'
import { RichTextField } from './RichTextField'
import { AIFieldActions } from './AIFieldActions'
import { HelpCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StepFormProps {
  step: StepConfig
  data: Record<string, any>
  onChange: (field: string, value: string) => void
  errors?: Record<string, string>
  proposalType?: string
  proposalTitle?: string
}

export function StepForm({ step, data, onChange, errors, proposalType, proposalTitle }: StepFormProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ktip-sand-900">{step.title}</h3>
        <p className="text-sm text-ktip-sand-500 mt-1">{step.description}</p>
      </div>

      <div className="space-y-5">
        {step.fields.map((field) => {
          const value = data[field.name] || ''
          const error = errors?.[field.name]

          return (
            <div key={field.name}>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>

              {field.helpText && (
                <p className="text-xs text-ktip-sand-400 mb-1.5 flex items-start gap-1">
                  <HelpCircle size={12} className="shrink-0 mt-0.5" />
                  {field.helpText}
                </p>
              )}

              {field.type === 'textarea' ? (
                <>
                  <RichTextField
                    value={value}
                    onChange={(html) => onChange(field.name, html)}
                    placeholder={field.placeholder}
                    minHeight={`${(field.rows || 4) * 28}px`}
                    error={!!error}
                  />
                  {proposalType && (
                    <AIFieldActions
                      proposalType={proposalType}
                      fieldLabel={field.label}
                      fieldValue={value}
                      helpText={field.helpText}
                      placeholder={field.placeholder}
                      proposalTitle={proposalTitle}
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
                    'w-full px-3 py-2.5 border rounded-xl text-sm text-ktip-sand-900 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 bg-white',
                    error ? 'border-red-300' : 'border-ktip-sand-200'
                  )}
                >
                  <option value="">Select...</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
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
