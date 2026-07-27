import { For, Show } from 'solid-js'
import DOMPurify from 'dompurify'
import { PROPOSAL_STEPS } from '../../lib/proposal-templates'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import type { ProposalType } from '../../types'

// Force all links to open in new tab safely
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

function isHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str)
}

interface ProposalPreviewProps {
  type: ProposalType
  title: string
  data: Record<string, any>
}

export function ProposalPreview(props: ProposalPreviewProps) {
  const steps = () => PROPOSAL_STEPS[props.type]
  const typeLabel = () => PROPOSAL_TYPE_LABELS[props.type] || props.type

  return (
    <div class="proposal-preview prose prose-sm max-w-none">
      {/* Title Block */}
      <div class="border-b border-ktip-sand-200 pb-4 mb-6 print:mb-4">
        <h1 class="text-2xl font-bold text-ktip-sand-900 mb-2 font-display">{props.title}</h1>
        <div class="flex items-center gap-3 text-sm text-ktip-sand-500">
          <span class="px-2 py-0.5 bg-ktip-ocean-50 text-ktip-ocean-700 rounded-full text-xs font-medium">
            {typeLabel()}
          </span>
          <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Sections */}
      <For each={steps()}>
        {(step) => {
          const hasContent = () => step.fields.some(f => {
            const val = props.data[f.name]
            return val && String(val).trim()
          })

          return (
            <Show when={hasContent()}>
              <div class="mb-6 print:mb-4">
                <h2 class="text-lg font-semibold text-ktip-sand-800 mb-3 pb-1 border-b border-ktip-sand-100 font-display">
                  {step.title}
                </h2>
                <div class="space-y-3">
                  <For each={step.fields}>
                    {(field) => {
                      const value = () => {
                        const v = props.data[field.name]
                        return v && String(v).trim() ? String(v) : null
                      }

                      return (
                        <Show when={value()}>
                          <div>
                            <h3 class="text-sm font-medium text-ktip-sand-600 mb-1">{field.label}</h3>
                            <Show
                              when={isHtml(value()!)}
                              fallback={
                                <div class="text-sm text-ktip-sand-800 whitespace-pre-wrap leading-relaxed">
                                  {value()}
                                </div>
                              }
                            >
                              <div
                                class="prose-preview text-sm text-ktip-sand-800 leading-relaxed"
                                innerHTML={DOMPurify.sanitize(value()!, {
                                  ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div'],
                                  ALLOWED_ATTR: ['href', 'target', 'rel'],
                                  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
                                  ADD_ATTR: ['target'],
                                  FORCE_BODY: true,
                                })}
                              />
                            </Show>
                          </div>
                        </Show>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>
          )
        }}
      </For>

      {/* Footer */}
      <div class="mt-8 pt-4 border-t border-ktip-sand-200 text-xs text-ktip-sand-400 print:mt-4">
        Generated with KTIP Proposal Wizard
      </div>
    </div>
  )
}
