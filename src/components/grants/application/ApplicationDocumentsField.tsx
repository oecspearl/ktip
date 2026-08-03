import { useState } from 'react'
import { Check, FileText, Lock, Trash2, Upload } from 'lucide-react'
import { Button } from '../../ui/Button'
import { DocumentUploadModal } from '../../documents/DocumentUploadModal'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  openDocument,
  useDeleteDocument,
  useEntityDocuments,
} from '../../../hooks/useEntityDocuments'
import { formatFileSize } from '../../../lib/document-extract'
import { cn } from '../../../lib/utils'
import type { RequiredDocument } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface ApplicationDocumentsFieldProps {
  /** Null until the draft has been saved at least once. */
  applicationId: string | null
  /** The call's own checklist (grants.required_documents, migration 080). */
  requiredDocuments: RequiredDocument[]
  /** Saves the draft so there is an id to attach documents to. */
  onSaveDraft: () => Promise<void>
}

/**
 * The wizard's supporting-documents step.
 *
 * Two things the old surface got wrong, both fixed here. First, there was no
 * step at all — the only upload box lived on the public grant page and its
 * copy addressed the funder ("upload the call for proposals, annexes or
 * budget templates"), which is the opposite audience. Second, that box
 * defaulted to visibility='restricted', meaning "listed to everyone", so an
 * applicant attaching their financials published the fact to every member.
 * Uploads here are always private and scoped to the application.
 */
export function ApplicationDocumentsField({
  applicationId,
  requiredDocuments,
  onSaveDraft,
}: ApplicationDocumentsFieldProps) {
    const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { documents, loading } = useEntityDocuments('grant_application', applicationId || undefined)
  const { deleteDocument, loading: deleting } = useDeleteDocument()

  const [uploadFor, setUploadFor] = useState<RequiredDocument | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const uploaded = documents || []

  // Matched on the title the checklist row pre-filled. Loose on purpose: an
  // applicant renaming "Detailed budget" to "Budget v3 (final)" should still
  // tick the row off rather than be told they have not uploaded a budget.
  const matches = (item: RequiredDocument) =>
    uploaded.filter((doc) => doc.title.toLowerCase().includes(item.label.toLowerCase().split(' ')[0]))

  const openUpload = async (item: RequiredDocument | null) => {
    if (!applicationId) {
      setSaving(true)
      try {
        await onSaveDraft()
      } catch {
        toast.error(t`Could not save the draft — try again before uploading`)
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setUploadFor(item)
    setUploadOpen(true)
  }

  const handleDelete = async (id: string, storagePath: string | null, title: string) => {
    if (!window.confirm(t`Remove "${title}" from this application?`)) return
    try {
      await deleteDocument({ documentId: id, storagePath })
      toast.success(t`Document removed`)
    } catch (err: any) {
      toast.error(err?.message || t`Failed to remove the document`)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 p-3">
        <Lock size={16} className="mt-0.5 shrink-0 text-ktip-ocean-600" />
        <p className="text-xs text-ktip-ocean-800">
          <Trans>Everything you attach here is private to you and the people assessing this grant. It is not listed on the public grant page, and other applicants cannot see it.</Trans>
        </p>
      </div>

      {/* The checklist. Without it "Upload documents" was a box with no
          statement of what was wanted, which is exactly the complaint. */}
      {requiredDocuments.some((d) => d.required) && (
        <p className="text-sm text-ktip-sand-600">
          <Trans>
            <span className="font-medium text-ktip-sand-900">
              {requiredDocuments.filter((d) => d.required && matches(d).length > 0).length} of{' '}
              {requiredDocuments.filter((d) => d.required).length}
            </span>{' '}
            required documents attached.
          </Trans>
        </p>
      )}

      <div className="space-y-2">
        {requiredDocuments.map((item) => {
          const found = matches(item)
          return (
            <div
              key={item.key}
              className={cn(
                'rounded-xl border p-4',
                found.length > 0
                  ? 'border-ktip-tropical-300 bg-ktip-tropical-50/50'
                  : item.required
                    ? 'border-ktip-sun-300 bg-ktip-sun-50/40'
                    : 'border-ktip-sand-200'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ktip-sand-900">
                    {found.length > 0 && (
                      <Check size={14} className="text-ktip-tropical-700" aria-hidden="true" />
                    )}
                    {item.label}
                    {item.required ? (
                      <span className="text-xs font-normal text-ktip-sun-800"><Trans>Required</Trans></span>
                    ) : (
                      <span className="text-xs font-normal text-ktip-sand-500"><Trans>Optional</Trans></span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ktip-sand-600">{item.description}</p>
                </div>
                <Button
                  size="sm"
                  variant={found.length > 0 ? 'secondary' : 'primary'}
                  icon={<Upload size={14} />}
                  loading={saving}
                  onClick={() => void openUpload(item)}
                >
                  {found.length > 0 ? t`Add another` : t`Upload`}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Everything attached, including anything outside the checklist */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ktip-sand-700">
            <Trans>Attached ({uploaded.length})</Trans>
          </p>
          <Button
            size="sm"
            variant="ghost"
            icon={<Upload size={14} />}
            loading={saving}
            onClick={() => void openUpload(null)}
          >
            <Trans>Upload something else</Trans>
          </Button>
        </div>

        {!applicationId ? (
          <p className="rounded-xl border border-dashed border-ktip-sand-300 py-6 text-center text-sm text-ktip-sand-500">
            <Trans>Your draft is saved automatically the first time you upload.</Trans>
          </p>
        ) : loading ? (
          <p className="py-6 text-center text-sm text-ktip-sand-500"><Trans>Loading attachments…</Trans></p>
        ) : uploaded.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ktip-sand-300 py-6 text-center text-sm text-ktip-sand-500">
            <Trans>Nothing attached yet.</Trans>
          </p>
        ) : (
          <ul className="space-y-2">
            {uploaded.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-ktip-sand-200 p-3"
              >
                <FileText size={18} className="shrink-0 text-ktip-ocean-600" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (doc.storage_path) void openDocument(doc.storage_path, doc.file_name)
                    }}
                    className="block truncate text-sm font-medium text-ktip-sand-900 hover:text-ktip-ocean-600"
                  >
                    {doc.title}
                  </button>
                  <p className="truncate text-xs text-ktip-sand-500">
                    {doc.file_name} · {formatFileSize(doc.file_size)}
                  </p>
                </div>
                {doc.owner_id === auth.user?.id && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.storage_path, doc.title)}
                    disabled={deleting}
                    aria-label={t`Remove ${doc.title}`}
                    className="rounded-lg p-1.5 text-ktip-sand-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {applicationId && (
        <DocumentUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          entityType="grant_application"
          entityId={applicationId}
          // No AI field extraction: there is no parent record whose columns
          // these files could propose values for.
          canEditEntity={false}
          lockedVisibility="private"
          defaultTitle={uploadFor?.label}
          descriptionCopy={t`Attached to this application only. Visible to you and the grant assessors.`}
        />
      )}
    </div>
  )
}
