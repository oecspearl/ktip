import { Plus, RotateCcw, X, ChevronUp, ChevronDown } from 'lucide-react'
import { DEFAULT_REQUIRED_DOCUMENTS } from '../../lib/grant-application-template'
import type { RequiredDocument } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface RequiredDocumentsEditorProps {
  value: RequiredDocument[]
  onChange: (value: RequiredDocument[]) => void
}

const inputClass =
  'w-full px-3 py-2 border border-ktip-sand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

const iconButtonClass =
  'p-1.5 text-ktip-sand-400 hover:text-ktip-sand-700 hover:bg-ktip-sand-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

const addButtonClass =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ktip-ocean-600 border border-ktip-ocean-200 rounded-lg hover:bg-ktip-ocean-50 transition-colors'

/** Slug of the label, which is all a key ever needs to be. */
function keyFor(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'document'
  let key = base
  let n = 2
  while (taken.has(key)) key = `${base}_${n++}`
  return key
}

/**
 * Trims, drops rows with no label, and fills in any key the funder never saw.
 *
 * Keys already on the row are kept: ApplicationDocumentsField matches uploads
 * against the checklist, so renaming a row must not orphan what was uploaded
 * against it.
 */
export function cleanRequiredDocuments(docs: RequiredDocument[]): RequiredDocument[] {
  const taken = new Set<string>()
  return docs
    .map((doc) => ({ ...doc, label: doc.label.trim(), description: (doc.description || '').trim() }))
    .filter((doc) => doc.label)
    .map((doc) => {
      const key = doc.key?.trim() && !taken.has(doc.key.trim()) ? doc.key.trim() : keyFor(doc.label, taken)
      taken.add(key)
      return { key, label: doc.label, description: doc.description, required: !!doc.required }
    })
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Edits `grants.required_documents` — the checklist the application wizard's
 * upload step renders.
 *
 * The column has existed since migration 080 and no form has ever exposed it,
 * which is the mismatch the feedback queue reported: applicants were shown a
 * documents pipeline the funder had no way to define. Rows are the funder's
 * copy, so this is a plain list editor rather than anything typed.
 */
export function RequiredDocumentsEditor({ value, onChange }: RequiredDocumentsEditorProps) {
  const { t } = useLingui()

  const update = (index: number, patch: Partial<RequiredDocument>) =>
    onChange(value.map((doc, i) => (i === index ? { ...doc, ...patch } : doc)))

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index))

  const add = () =>
    onChange([...value, { key: '', label: '', description: '', required: false }])

  return (
    <div className="space-y-3">
      {value.map((doc, index) => (
        <div key={doc.key || index} className="border border-ktip-sand-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={doc.label}
              onChange={(e) => update(index, { label: e.currentTarget.value })}
              placeholder={t`Detailed budget`}
              className={`${inputClass} font-medium`}
            />
            <button
              type="button"
              onClick={() => onChange(move(value, index, index - 1))}
              disabled={index === 0}
              className={iconButtonClass}
              aria-label={t`Move up`}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              onClick={() => onChange(move(value, index, index + 1))}
              disabled={index === value.length - 1}
              className={iconButtonClass}
              aria-label={t`Move down`}
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              className={iconButtonClass}
              aria-label={t`Remove document`}
            >
              <X size={16} />
            </button>
          </div>

          <input
            type="text"
            value={doc.description}
            onChange={(e) => update(index, { description: e.currentTarget.value })}
            placeholder={t`What it should contain, and what you will accept instead.`}
            className={inputClass}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={doc.required}
              onChange={(e) => update(index, { required: e.currentTarget.checked })}
              className="w-4 h-4 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
            />
            <span className="text-xs text-ktip-sand-600">
              <Trans>Required — the applicant is told they cannot submit without it</Trans>
            </span>
          </label>
        </div>
      ))}

      {value.length === 0 && (
        <p className="text-xs text-ktip-sand-500">
          <Trans>
            No documents asked for. Applicants will see an upload step with nothing on the checklist.
          </Trans>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} className={addButtonClass}>
          <Plus size={14} />
          <Trans>Add a document</Trans>
        </button>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_REQUIRED_DOCUMENTS.map((d) => ({ ...d })))}
          className={addButtonClass}
        >
          <RotateCcw size={14} />
          <Trans>Use the standard checklist</Trans>
        </button>
      </div>
    </div>
  )
}
