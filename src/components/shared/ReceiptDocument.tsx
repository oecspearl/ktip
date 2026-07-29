import DOMPurify from 'dompurify'
import { GRANT_APPLICATION_STEPS } from '../../lib/grant-application-template'
import { GRIEVANCE_CATEGORY_LABELS } from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import type { SubmissionReceipt } from '../../types'

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

export interface ReceiptField {
  label: string
  value: string
}

export interface ReceiptSection {
  title: string
  fields: ReceiptField[]
}

interface ReceiptDocumentProps {
  title: string
  subtitle?: string | null
  submittedAt?: string | null
  sections: ReceiptSection[]
  footer?: string
}

/**
 * Renders a submitted document — the grant wizard's review step and the
 * dashboard receipt page both use this. The `proposal-preview` root class
 * hooks into the print styles already defined in index.css.
 */
export function ReceiptDocument({
  title,
  subtitle,
  submittedAt,
  sections,
  footer = 'Generated with KTIP Grant Application',
}: ReceiptDocumentProps) {
  const populated = sections.filter((s) => s.fields.length > 0)

  return (
    <div className="proposal-preview prose prose-sm max-w-none">
      {/* Title Block */}
      <div className="border-b border-ktip-sand-200 pb-4 mb-6 print:mb-4">
        <h1 className="text-2xl font-bold text-ktip-sand-900 mb-2 font-display">{title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ktip-sand-500">
          {subtitle && (
            <span className="px-2 py-0.5 bg-ktip-ocean-50 text-ktip-ocean-700 rounded-full text-xs font-medium">
              {subtitle}
            </span>
          )}
          <span>
            {submittedAt
              ? `Submitted ${formatDate(submittedAt)}`
              : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Sections */}
      {populated.map((section) => (
        <div key={section.title} className="mb-6 print:mb-4">
          <h2 className="text-lg font-semibold text-ktip-sand-800 mb-3 pb-1 border-b border-ktip-sand-100 font-display">
            {section.title}
          </h2>
          <div className="space-y-3">
            {section.fields.map((field) => (
              <div key={field.label}>
                <h3 className="text-sm font-medium text-ktip-sand-600 mb-1">{field.label}</h3>
                {isHtml(field.value) ? (
                  <div
                    className="prose-preview text-sm text-ktip-sand-800 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(field.value, {
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
                    {field.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {populated.length === 0 && (
        <p className="text-sm text-ktip-sand-500 italic">
          No additional information was requested for this submission.
        </p>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-ktip-sand-200 text-xs text-ktip-sand-400 print:mt-4">
        {footer}
      </div>
    </div>
  )
}

/** Turns a stored value into a display string, dropping empties. */
function toDisplayValue(raw: any): string | null {
  if (raw === null || raw === undefined) return null
  if (Array.isArray(raw)) {
    const joined = raw.filter((v) => v !== null && v !== undefined && String(v).trim()).join(', ')
    return joined || null
  }
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  const str = String(raw).trim()
  return str || null
}

/**
 * Maps a stored receipt to renderable sections. Labels come from whatever the
 * receipt's template_key points at; anything the template no longer knows
 * about falls back to its raw key, so old receipts still render in full.
 */
export function receiptToSections(receipt: SubmissionReceipt): ReceiptSection[] {
  const data = receipt.data || {}
  const used = new Set<string>()

  const build = (title: string, entries: { key: string; label: string }[]): ReceiptSection => ({
    title,
    fields: entries.flatMap(({ key, label }) => {
      used.add(key)
      const value = toDisplayValue(data[key])
      return value ? [{ label, value }] : []
    }),
  })

  let sections: ReceiptSection[] = []

  switch (receipt.template_key) {
    case 'grant_application_v1':
      sections = GRANT_APPLICATION_STEPS.map((step) =>
        build(
          step.title,
          step.fields.map((f) => ({ key: f.name, label: f.label }))
        )
      )
      break

    case 'event_registration':
      sections = [
        build(
          'Registration Details',
          (receipt.field_config || []).map((f) => ({ key: f.id, label: f.label }))
        ),
      ]
      break

    case 'grievance_v1': {
      const category = toDisplayValue(data.category)
      used.add('category')
      sections = [
        {
          title: 'Report Details',
          fields: [
            ...(category
              ? [{ label: 'Category', value: GRIEVANCE_CATEGORY_LABELS[category] || category }]
              : []),
            ...build('', [
              { key: 'description', label: 'What happened' },
              { key: 'context', label: 'Additional context' },
              { key: 'evidence_url', label: 'Evidence' },
            ]).fields,
          ],
        },
      ]
      break
    }

    default:
      break
  }

  // Anything not covered by the template still gets shown, keyed raw.
  const leftovers = Object.keys(data)
    .filter((key) => !used.has(key))
    .flatMap((key) => {
      const value = toDisplayValue(data[key])
      return value ? [{ label: key, value }] : []
    })

  if (leftovers.length > 0) {
    sections = [...sections, { title: 'Other Responses', fields: leftovers }]
  }

  return sections
}
