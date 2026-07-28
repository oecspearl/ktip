import DOMPurify from 'dompurify'
import { GRANT_APPLICATION_STEPS } from '../../../lib/grant-application-template'
import type { StepConfig } from '../../../lib/grant-application-template'

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

interface ApplicationPreviewProps {
  title: string
  grantTitle?: string
  data: Record<string, any>
  steps?: StepConfig[]
}

export function ApplicationPreview({ title, grantTitle, data, steps = GRANT_APPLICATION_STEPS }: ApplicationPreviewProps) {
  return (
    <div className="proposal-preview prose prose-sm max-w-none">
      {/* Title Block */}
      <div className="border-b border-ktip-sand-200 pb-4 mb-6 print:mb-4">
        <h1 className="text-2xl font-bold text-ktip-sand-900 mb-2 font-display">{title}</h1>
        <div className="flex items-center gap-3 text-sm text-ktip-sand-500">
          {grantTitle && (
            <span className="px-2 py-0.5 bg-ktip-ocean-50 text-ktip-ocean-700 rounded-full text-xs font-medium">
              {grantTitle}
            </span>
          )}
          <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Sections */}
      {steps.map((step) => {
        const hasContent = step.fields.some((f) => {
          const val = data[f.name]
          return val && String(val).trim()
        })

        if (!hasContent) return null

        return (
          <div key={step.title} className="mb-6 print:mb-4">
            <h2 className="text-lg font-semibold text-ktip-sand-800 mb-3 pb-1 border-b border-ktip-sand-100 font-display">
              {step.title}
            </h2>
            <div className="space-y-3">
              {step.fields.map((field) => {
                const raw = data[field.name]
                const value = raw && String(raw).trim() ? String(raw) : null
                if (!value) return null

                return (
                  <div key={field.name}>
                    <h3 className="text-sm font-medium text-ktip-sand-600 mb-1">{field.label}</h3>
                    {isHtml(value) ? (
                      <div
                        className="prose-preview text-sm text-ktip-sand-800 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(value, {
                            ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div'],
                            ALLOWED_ATTR: ['href', 'target', 'rel'],
                            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
                            ADD_ATTR: ['target'],
                            FORCE_BODY: true,
                          }),
                        }}
                      />
                    ) : (
                      <div className="text-sm text-ktip-sand-800 whitespace-pre-wrap leading-relaxed">
                        {value}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-ktip-sand-200 text-xs text-ktip-sand-400 print:mt-4">
        Generated with KTIP Grant Application
      </div>
    </div>
  )
}
