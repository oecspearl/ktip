import { useEffect, useState } from 'react'
import { Download, Save, FileWarning } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { RichTextField } from '../grants/application/RichTextField'
import { ExtractionReviewPanel } from './ExtractionReviewPanel'
import { useToast } from '../../contexts/ToastContext'
import {
  openDocument,
  useDocumentContent,
  useSaveDocumentContent,
} from '../../hooks/useEntityDocuments'
import { formatFileSize } from '../../lib/document-extract'
import type { DocumentEntityType, EntityDocumentSummary } from '../../types'

interface DocumentContentModalProps {
  open: boolean
  onClose: () => void
  document: EntityDocumentSummary
  entityType: DocumentEntityType
  entityId: string
  /** The parent grant/project, for the extraction review panel. */
  entity: Record<string, any> | null | undefined
  canEditEntity: boolean
}

/**
 * The scraped document, opened in the same rich-text editor the rest of the app
 * uses. Owners and editors can correct what the scraper got wrong and save it;
 * viewers get the identical rendering with the toolbar hidden.
 *
 * Saving rewrites the markdown twin from the edited HTML, so the AI always
 * reads what the user actually sees.
 */
export function DocumentContentModal({
  open,
  onClose,
  document,
  entityType,
  entityId,
  entity,
  canEditEntity,
}: DocumentContentModalProps) {
  const toast = useToast()
  const { document: full, loading } = useDocumentContent(open ? document.id : undefined)
  const { saveContent, loading: saving } = useSaveDocumentContent()

  const canEditDocument = document.my_role === 'owner' || document.my_role === 'editor'

  const [html, setHtml] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (full) {
      setHtml(full.content_html || '')
      setDirty(false)
    }
  }, [full])

  const handleSave = async () => {
    try {
      await saveContent({ documentId: document.id, html })
      setDirty(false)
      toast.success('Saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save')
    }
  }

  const handleDownload = async () => {
    if (!document.storage_path) return
    const ok = await openDocument(document.storage_path, document.file_name)
    if (!ok) toast.error('Could not open the original file')
  }

  const handleClose = () => {
    if (dirty && !window.confirm('Discard your unsaved changes to this document?')) return
    onClose()
  }

  const noContent = !loading && !full?.content_html

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={document.title}
      description={`${document.file_name} · ${formatFileSize(document.file_size)}`}
      size="xl"
      className="max-w-5xl"
    >
      <div className="space-y-5">
        {document.description && (
          <p className="text-sm text-ktip-sand-600">{document.description}</p>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-ktip-sand-500">Loading…</p>
        ) : noContent ? (
          <div className="flex items-start gap-3 p-4 bg-ktip-sun-50 border border-ktip-sun-200 rounded-xl">
            <FileWarning size={18} className="text-ktip-sun-700 shrink-0 mt-0.5" />
            <div className="text-sm text-ktip-sun-800">
              <p className="font-medium">No readable text in this file.</p>
              <p className="text-ktip-sun-700">
                {full?.extraction_error || 'Download the original to view it.'}
              </p>
            </div>
          </div>
        ) : (
          <RichTextField
            value={html}
            onChange={(next) => {
              setHtml(next)
              setDirty(true)
            }}
            editable={canEditDocument}
            minHeight="380px"
          />
        )}

        {canEditEntity && full && (
          <ExtractionReviewPanel
            documentId={document.id}
            entityType={entityType}
            entityId={entityId}
            entity={entity}
            fields={full.extracted_fields || {}}
            markdown={full.markdown}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={handleDownload}
            disabled={!document.storage_path}
          >
            Original file
          </Button>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
            {canEditDocument && !noContent && (
              <Button icon={<Save size={16} />} onClick={handleSave} loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
