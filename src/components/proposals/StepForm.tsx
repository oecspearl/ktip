import { For, Show } from 'solid-js'
import type { StepConfig } from '../../lib/proposal-templates'
import { RichTextField } from './RichTextField'
import { AIFieldActions } from './AIFieldActions'
import { HelpCircle } from 'lucide-solid'

interface StepFormProps {
  step: StepConfig
  data: Record<string, any>
  onChange: (field: string, value: string) => void
  errors?: Record<string, string>
  proposalType?: string
  proposalTitle?: string
}

export function StepForm(props: StepFormProps) {
  return (
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold text-ktip-sand-900">{props.step.title}</h3>
        <p class="text-sm text-ktip-sand-500 mt-1">{props.step.description}</p>
      </div>

      <div class="space-y-5">
        <For each={props.step.fields}>
          {(field) => {
            const value = () => props.data[field.name] || ''
            const error = () => props.errors?.[field.name]

            return (
              <div>
                <label class="block text-sm font-medium text-ktip-sand-700 mb-1.5">
                  {field.label}
                  <Show when={field.required}>
                    <span class="text-red-500 ml-0.5">*</span>
                  </Show>
                </label>

                <Show when={field.helpText}>
                  <p class="text-xs text-ktip-sand-400 mb-1.5 flex items-start gap-1">
                    <HelpCircle size={12} class="shrink-0 mt-0.5" />
                    {field.helpText}
                  </p>
                </Show>

                {field.type === 'textarea' ? (
                  <>
                    <RichTextField
                      value={value()}
                      onChange={(html) => props.onChange(field.name, html)}
                      placeholder={field.placeholder}
                      minHeight={`${(field.rows || 4) * 28}px`}
                      error={!!error()}
                    />
                    <Show when={props.proposalType}>
                      <AIFieldActions
                        proposalType={props.proposalType!}
                        fieldLabel={field.label}
                        fieldValue={value()}
                        helpText={field.helpText}
                        placeholder={field.placeholder}
                        proposalTitle={props.proposalTitle}
                        existingData={props.data}
                        onReplace={(html) => props.onChange(field.name, html)}
                      />
                    </Show>
                  </>
                ) : field.type === 'select' ? (
                  <select
                    value={value()}
                    onChange={(e) => props.onChange(field.name, e.currentTarget.value)}
                    class="w-full px-3 py-2.5 border rounded-xl text-sm text-ktip-sand-900 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 bg-white"
                    classList={{
                      'border-red-300': !!error(),
                      'border-ktip-sand-200': !error(),
                    }}
                  >
                    <option value="">Select...</option>
                    <For each={field.options || []}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={value()}
                    onInput={(e) => props.onChange(field.name, e.currentTarget.value)}
                    placeholder={field.placeholder}
                    class="w-full px-3 py-2.5 border rounded-xl text-sm text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
                    classList={{
                      'border-red-300': !!error(),
                      'border-ktip-sand-200': !error(),
                    }}
                  />
                )}

                <Show when={error()}>
                  <p class="text-xs text-red-500 mt-1">{error()}</p>
                </Show>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}
