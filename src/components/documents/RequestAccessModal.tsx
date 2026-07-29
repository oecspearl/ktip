import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDocumentAccessMutations } from '../../hooks/useDocumentAccess'
import type { DocumentEntityType, EntityDocumentSummary } from '../../types'

interface RequestAccessModalProps {
  open: boolean
  onClose: () => void
  document: EntityDocumentSummary
  entityType: DocumentEntityType
  entityId: string
}

export function RequestAccessModal({
  open,
  onClose,
  document,
  entityType,
  entityId,
}: RequestAccessModalProps) {
  const auth = useAuth()
  const toast = useToast()
  const { requestAccess, requestingAccess } = useDocumentAccessMutations()
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!auth.user) return
    try {
      await requestAccess({
        documentId: document.id,
        requesterId: auth.user.id,
        ownerId: document.owner_id,
        documentTitle: document.title,
        entityType,
        entityId,
        requesterName: auth.profile?.display_name || 'A member',
        message: message.trim() || undefined,
      })
      toast.success('Request sent to the document owner')
      setMessage('')
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send the request')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request access"
      description={document.title}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-600">
          {document.owner_name || 'The owner'} will be notified and can grant you view or edit
          access.
        </p>

        <Textarea
          label="Message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say why you need it — it helps the owner decide."
          rows={3}
          fullWidth
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={requestingAccess}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={requestingAccess}>
            Send request
          </Button>
        </div>
      </div>
    </Modal>
  )
}
