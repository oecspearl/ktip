import { useMemo, useState } from 'react'
import { Sparkles, Check, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { useUpdateGrant } from '../../hooks/useGrants'
import { useUpdateProject } from '../../hooks/useProjects'
import { useClearExtractedFields, useReextractFields } from '../../hooks/useEntityDocuments'
import { fieldLabel } from '../../lib/extracted-fields'
import type { DocumentEntityType, ExtractedFields } from '../../types'

interface ExtractionReviewPanelProps {
  documentId: string
  entityType: DocumentEntityType
  entityId: string
  /** The parent record, so each proposal can be shown against what is there now. */
  entity: Record<string, any> | null | undefined
  fields: ExtractedFields
  markdown: string | null
  onApplied?: () => void
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * AI proposals from the uploaded document, shown against the record's current
 * values. Nothing is written until the user picks rows and applies them, and
 * fields that already hold a value start unchecked so a scrape cannot quietly
 * overwrite something a person typed.
 */
export function ExtractionReviewPanel({
  documentId,
  entityType,
  entityId,
  entity,
  fields,
  markdown,
  onApplied,
}: ExtractionReviewPanelProps) {
  const toast = useToast()
  const { updateGrant, loading: savingGrant } = useUpdateGrant()
  const { updateProject, loading: savingProject } = useUpdateProject()
  const { clearFields } = useClearExtractedFields()
  const { reextract, loading: reextracting } = useReextractFields()

  const entries = useMemo(() => Object.entries(fields || {}), [fields])

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const [key] of Object.entries(fields || {})) {
      initial[key] = isEmpty(entity?.[key])
    }
    return initial
  })

  const saving = savingGrant || savingProject
  const checkedKeys = entries.filter(([key]) => selected[key]).map(([key]) => key)

  const handleApply = async () => {
    if (checkedKeys.length === 0) return

    const patch: Record<string, any> = {}
    for (const key of checkedKeys) {
      patch[key] = fields[key].value
    }

    try {
      if (entityType === 'grant') {
        await updateGrant(entityId, patch as any)
      } else {
        await updateProject(entityId, patch as any)
      }
      await clearFields(documentId)
      toast.success(`Applied ${checkedKeys.length} field${checkedKeys.length === 1 ? '' : 's'}`)
      onApplied?.()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to apply the fields')
    }
  }

  const handleReextract = async () => {
    if (!markdown) return
    try {
      const next = await reextract({ documentId, entityType, markdown })
      const initial: Record<string, boolean> = {}
      for (const key of Object.keys(next)) initial[key] = isEmpty(entity?.[key])
      setSelected(initial)
      toast.success('Re-read the document')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to re-read the document')
    }
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 border border-ktip-sand-200 rounded-xl bg-ktip-sand-50 space-y-3">
        <p className="text-sm text-ktip-sand-600">
          Nothing was pulled out of this document yet.
        </p>
        {markdown && (
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw size={14} />}
            onClick={handleReextract}
            loading={reextracting}
          >
            Read it again
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="border border-ktip-ocean-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-ktip-ocean-50 border-b border-ktip-ocean-200">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={16} className="text-ktip-ocean-600 shrink-0" />
          <p className="text-sm font-medium text-ktip-ocean-800 truncate">
            {entries.length} field{entries.length === 1 ? '' : 's'} found in this document
          </p>
        </div>
        {markdown && (
          <button
            type="button"
            onClick={handleReextract}
            disabled={reextracting}
            className="text-xs text-ktip-ocean-700 hover:underline disabled:opacity-50 shrink-0"
          >
            {reextracting ? 'Re-reading…' : 'Read again'}
          </button>
        )}
      </div>

      <div className="divide-y divide-ktip-sand-100">
        {entries.map(([key, proposal]) => {
          const current = entity?.[key]
          const willOverwrite = !isEmpty(current)
          return (
            <label
              key={key}
              className="flex gap-3 p-4 cursor-pointer hover:bg-ktip-sand-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={!!selected[key]}
                onChange={(e) => setSelected((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="mt-1 h-4 w-4 shrink-0 accent-ktip-ocean-600"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ktip-sand-900">
                    {fieldLabel(entityType, key)}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-ktip-sand-100 text-ktip-sand-600">
                    {Math.round((proposal.confidence ?? 0) * 100)}% sure
                  </span>
                  {willOverwrite && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-ktip-sun-100 text-ktip-sun-800">
                      overwrites current value
                    </span>
                  )}
                </div>

                <p className="text-sm text-ktip-sand-800 break-words">
                  {display(proposal.value)}
                </p>

                {willOverwrite && (
                  <p className="text-xs text-ktip-sand-500 break-words">
                    Now: {display(current)}
                  </p>
                )}

                {proposal.evidence && (
                  <p className="text-xs italic text-ktip-sand-500 break-words">
                    “{proposal.evidence}”
                  </p>
                )}
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-ktip-sand-50 border-t border-ktip-sand-100">
        <p className="text-xs text-ktip-sand-500">
          {checkedKeys.length} selected
        </p>
        <Button
          size="sm"
          icon={<Check size={14} />}
          onClick={handleApply}
          loading={saving}
          disabled={checkedKeys.length === 0}
        >
          Apply to this {entityType}
        </Button>
      </div>
    </div>
  )
}
