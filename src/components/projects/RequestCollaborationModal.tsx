import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useProjectJoinRequestMutations } from '../../hooks/useProjectJoinRequests'
import { Trans, useLingui } from '@lingui/react/macro'

interface RequestCollaborationModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectTitle: string
  ownerId: string
  ownerName?: string | null
}

/**
 * Ask the owner to join a project team. Same shape as the document
 * RequestAccessModal — a message and a send button — because it is the same
 * act: a knock, not a claim.
 */
export function RequestCollaborationModal({
  open,
  onClose,
  projectId,
  projectTitle,
  ownerId,
  ownerName,
}: RequestCollaborationModalProps) {
  const { t } = useLingui()
  // The owner's display name is never translated — it is a person's name. Only
  // the sentence around it is, and it needs the name as a named substitution so
  // French can put the verb where French puts it.
  const owner = ownerName || t`The owner`
  const auth = useAuth()
  const toast = useToast()
  const { requestToJoin, requesting } = useProjectJoinRequestMutations()
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!auth.user) return
    try {
      await requestToJoin({
        projectId,
        projectTitle,
        requesterId: auth.user.id,
        requesterName: auth.profile?.display_name || 'A member',
        ownerId,
        message: message.trim() || undefined,
      })
      toast.success(t`Request sent to the project owner`)
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
      title={t`Request to collaborate`}
      description={projectTitle}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-600">
          <Trans>
            {owner} will be notified. If they accept, you join the team and the project appears
            in your dashboard.
          </Trans>
        </p>

        <Textarea
          label={t`Message (optional)`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t`What would you bring to this project? It helps the owner decide.`}
          rows={3}
          fullWidth
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={requesting}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={handleSubmit} loading={requesting}>
            <Trans>Send request</Trans>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
