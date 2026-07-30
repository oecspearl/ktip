import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useProjectJoinRequestMutations } from '../../hooks/useProjectJoinRequests'

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
      toast.success('Request sent to the project owner')
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
      title="Request to collaborate"
      description={projectTitle}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-600">
          {ownerName || 'The owner'} will be notified. If they accept, you join the team and the
          project appears in your dashboard.
        </p>

        <Textarea
          label="Message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would you bring to this project? It helps the owner decide."
          rows={3}
          fullWidth
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={requesting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={requesting}>
            Send request
          </Button>
        </div>
      </div>
    </Modal>
  )
}
