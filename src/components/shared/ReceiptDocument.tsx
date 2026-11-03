import DOMPurify from 'dompurify'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { GRANT_APPLICATION_STEPS, VIDEO_URL_FIELD } from '../../lib/grant-application-template'
import { VideoLinkButton } from './VideoViewer'
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

/** A bare http(s) link with no surrounding text, e.g. the video-link field. */
function isBareUrl(str: string): boolean {
  return /^https?:\/\/\S+$/i.test(str.trim())
}

export interface ReceiptField {
  label: string
  value: string
  /** A video link: gets a button that plays it in a pop-up beside the link. */
  video?: boolean
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
  footer,
}: ReceiptDocumentProps) {
  const { t } = useLingui()
  const populated = sections.filter((s) => s.fields.length > 0)
  const footerText = footer ?? t`Generated with KTIP Grant Application`

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
              ? t`Submitted ${formatDate(submittedAt)}`
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
                ) : isBareUrl(field.value) ? (
                  <div className="flex items-start gap-2">
                    <a
                      href={field.value.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 underline break-all leading-relaxed"
                    >
                      {field.value.trim()}
                    </a>
                    {field.video && (
                      <VideoLinkButton url={field.value} title={title} className="print:hidden" />
                    )}
                  </div>
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
          <Trans>No additional information was requested for this submission.</Trans>
        </p>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-ktip-sand-200 text-xs text-ktip-sand-400 print:mt-4">
        {footerText}
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
  if (typeof raw === 'boolean') return raw ? i18n._(msg`Yes`) : i18n._(msg`No`)
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
      return value ? [{ label, value, video: key === VIDEO_URL_FIELD }] : []
    }),
  })

  let sections: ReceiptSection[] = []

  switch (receipt.template_key) {
    case 'grant_application_v1':
      sections = GRANT_APPLICATION_STEPS.map((step) =>
        build(
          i18n._(step.title),
          step.fields.map((f) => ({ key: f.name, label: i18n._(f.label) }))
        )
      )
      break

    case 'event_registration':
      sections = [
        build(
          i18n._(msg`Registration Details`),
          (receipt.field_config || []).map((f) => ({ key: f.id, label: f.label }))
        ),
      ]
      break

    case 'grievance_v1': {
      const category = toDisplayValue(data.category)
      used.add('category')
      sections = [
        {
          title: i18n._(msg`Report Details`),
          fields: [
            ...(category
              ? [
                  {
                    label: i18n._(msg`Category`),
                    value: GRIEVANCE_CATEGORY_LABELS[category]
                      ? i18n._(GRIEVANCE_CATEGORY_LABELS[category])
                      : category,
                  },
                ]
              : []),
            ...build('', [
              { key: 'description', label: i18n._(msg`What happened`) },
              { key: 'context', label: i18n._(msg`Additional context`) },
              { key: 'evidence_url', label: i18n._(msg`Evidence`) },
            ]).fields,
          ],
        },
      ]
      break
    }

    // A hackathon entry from the Submission Desk (migration 192).
    case 'event_submission_v1': {
      // team_id is there for the receipt's own RLS policy, not for reading.
      used.add('team_id')
      used.add('ai_use')
      used.add('evidence')
      const aiUse = typeof data.ai_use === 'string' ? data.ai_use : null
      const aiLabel =
        aiUse === 'drafted'
          ? i18n._(msg`AI wrote the full first draft`)
          : aiUse === 'assisted'
            ? i18n._(msg`AI tools materially helped`)
            : aiUse === 'none'
              ? i18n._(msg`No material AI help`)
              : null

      const evidence = Array.isArray(data.evidence) ? data.evidence : []

      sections = [
        build(i18n._(msg`Entry`), [
          { key: 'team', label: i18n._(msg`Team`) },
          { key: 'members', label: i18n._(msg`Members`) },
          { key: 'summary', label: i18n._(msg`Summary`) },
        ]),
        build(i18n._(msg`Links`), [
          { key: 'repo_url', label: i18n._(msg`Code repository`) },
          { key: VIDEO_URL_FIELD, label: i18n._(msg`Demo video`) },
          { key: 'video_length', label: i18n._(msg`Video length`) },
          { key: 'pitch_deck', label: i18n._(msg`Pitch deck`) },
        ]),
        {
          title: i18n._(msg`AI declaration`),
          fields: [
            ...(aiLabel ? [{ label: i18n._(msg`Declaration`), value: aiLabel }] : []),
            ...build('', [{ key: 'ai_tools', label: i18n._(msg`Tools and how they were used`) }]).fields,
          ],
        },
        {
          title: i18n._(msg`Evidence`),
          fields: evidence.flatMap((item: any) => {
            const value = [toDisplayValue(item?.note), toDisplayValue(item?.url)]
              .filter(Boolean)
              .join('\n')
            const label = toDisplayValue(item?.criterion)
            return label && value ? [{ label, value }] : []
          }),
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
    sections = [...sections, { title: i18n._(msg`Other Responses`), fields: leftovers }]
  }

  return sections
}
