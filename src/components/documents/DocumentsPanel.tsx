import { useState } from 'react'
import { FolderOpen, Upload } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { DocumentCard } from './DocumentCard'
import { DocumentUploadModal } from './DocumentUploadModal'
import { DocumentContentModal } from './DocumentContentModal'
import { DocumentAccessModal } from './DocumentAccessModal'
import { RequestAccessModal } from './RequestAccessModal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  openDocument,
  useDeleteDocument,
  useEntityDocuments,
} from '../../hooks/useEntityDocuments'
import type { DocumentEntityType, EntityDocumentSummary } from '../../types'

interface DocumentsPanelProps {
  entityType: DocumentEntityType
  entityId: string
  /**
   * Whether the viewer can write to the parent grant/project. Gates the
   * extraction review panel — proposals are pointless to someone who cannot
   * apply them.
   */
  canEditEntity: boolean
  /** The parent record, so proposals can be shown against current values. */
  entity?: Record<string, any> | null
}

type ActiveModal = 'upload' | 'content' | 'access' | 'request' | null

/**
 * Documents attached to a grant or project: the uploaded file plus the
 * editable copy scraped out of it.
 */
export function DocumentsPanel({ entityType, entityId, canEditEntity, entity }: DocumentsPanelProps) {
  const auth = useAuth()
  const toast = useToast()
  const { documents, loading } = useEntityDocuments(entityType, entityId)
  const { deleteDocument, loading: deleting } = useDeleteDocument()

  const [modal, setModal] = useState<ActiveModal>(null)
  const [selected, setSelected] = useState<EntityDocumentSummary | null>(null)

  const open = (next: ActiveModal, document?: EntityDocumentSummary) => {
    if (document) setSelected(document)
    setModal(next)
  }

  const closeModal = () => {
    setModal(null)
    setSelected(null)
  }

  const handleDownload = async (document: EntityDocumentSummary) => {
    if (!document.storage_path) return
    const ok = await openDocument(document.storage_path, document.file_name)
    if (!ok) toast.error('Could not open the file')
  }

  const handleDelete = async (document: EntityDocumentSummary) => {
    if (!window.confirm(`Delete "${document.title}"? This cannot be undone.`)) return
    try {
      await deleteDocument({ documentId: document.id, storagePath: document.storage_path })
      toast.success('Document deleted')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete the document')
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
            <FolderOpen size={20} className="text-ktip-ocean-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">Documents</h2>
            <p className="text-sm text-ktip-sand-600">
              {canEditEntity
                ? 'Uploaded files, with an editable copy of their contents'
                : entityType === 'grant'
                  ? 'Published by the funder — the call, annexes and any templates'
                  : 'Files attached to this project'}
            </p>
          </div>
        </div>

        {/* Uploading here is the owner's act, not any member's. Migration 080
            narrowed the INSERT policy to match; showing the button to everyone
            only produced a refusal — and, before 080, published an applicant's
            private files on a public grant page. */}
        {auth.user && canEditEntity && (
          <Button size="sm" icon={<Upload size={14} />} onClick={() => open('upload')}>
            Upload
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-ktip-sand-500">Loading documents…</p>
      ) : !documents || documents.length === 0 ? (
        <p className="py-8 text-center text-sm text-ktip-sand-500">
          No documents yet.{' '}
          {canEditEntity
            ? 'Upload the call for proposals, annexes or budget templates.'
            : entityType === 'grant'
              ? 'Your own supporting documents belong on your application, not here.'
              : ''}
        </p>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onOpen={() => open('content', document)}
              onRequestAccess={() => open('request', document)}
              onManageAccess={() => open('access', document)}
              onDownload={() => handleDownload(document)}
              onDelete={() => handleDelete(document)}
              deleting={deleting}
            />
          ))}
        </div>
      )}

      {auth.user && canEditEntity && (
        <DocumentUploadModal
          open={modal === 'upload'}
          onClose={closeModal}
          entityType={entityType}
          entityId={entityId}
          canEditEntity={canEditEntity}
        />
      )}

      {selected && modal === 'content' && (
        <DocumentContentModal
          open
          onClose={closeModal}
          document={selected}
          entityType={entityType}
          entityId={entityId}
          entity={entity}
          canEditEntity={canEditEntity}
        />
      )}

      {selected && modal === 'access' && (
        <DocumentAccessModal
          open
          onClose={closeModal}
          document={selected}
          entityType={entityType}
          entityId={entityId}
        />
      )}

      {selected && modal === 'request' && (
        <RequestAccessModal
          open
          onClose={closeModal}
          document={selected}
          entityType={entityType}
          entityId={entityId}
        />
      )}
    </Card>
  )
}
