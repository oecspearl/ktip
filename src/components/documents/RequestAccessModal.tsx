import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDocumentAccessMutations } from '../../hooks/useDocumentAccess'
import type { DocumentEntityType, EntityDocumentSummary } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

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
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { requestAccess, requestingAccess } = useDocumentAccessMutations()
  const [message, setMessage] = useState('')
  const ownerName = document.owner_name || t`The owner`

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
        requesterName: auth.profile?.display_name || t`A member`,
        message: message.trim() || undefined,
      })
      toast.success(t`Request sent to the document owner`)
      setMessage('')
      onClose()
    } catch (err: any) {
      toast.error(err?.message || t`Failed to send the request`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t`Request access`}
      description={document.title}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-600">
          <Trans>{ownerName} will be notified and can grant you view or edit access.</Trans>
        </p>

        <Textarea
          label={t`Message (optional)`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t`Say why you need it — it helps the owner decide.`}
          rows={3}
          fullWidth
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={requestingAccess}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={handleSubmit} loading={requestingAccess}>
            <Trans>Send request</Trans>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
