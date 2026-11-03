import { useEffect, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Ban, RotateCcw } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../contexts/ToastContext'
import { useSetGrantSuspension } from '../../../hooks/useGrantModeration'
import type { Grant } from '../../../types'

interface GrantSuspensionModalProps {
  /** The call to suspend or restore. Which one is decided by its current status. */
  grant: Pick<Grant, 'id' | 'title' | 'moderation_status'> | null
  onClose: () => void
  onDone?: () => void
}

const textareaClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 bg-ktip-cream rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

/**
 * Suspend a funding call with a reason, or restore it (migration 181).
 *
 * The reason is required to suspend: the poster is shown it, on the call and
 * as a note they can answer (182). Restoring takes an optional note.
 */
export function GrantSuspensionModal({ grant, onClose, onDone }: GrantSuspensionModalProps) {
  const { t } = useLingui()
  const toast = useToast()
  const { setSuspension, loading } = useSetGrantSuspension()
  const [reason, setReason] = useState('')

  useEffect(() => {
    setReason('')
  }, [grant?.id])

  const suspending = (grant?.moderation_status ?? 'active') !== 'suspended'
  const trimmed = reason.trim()

  const submit = async () => {
    if (!grant) return
    if (suspending && !trimmed) return
    try {
      await setSuspension(grant.id, suspending, trimmed || undefined)
      toast.success(suspending ? t`Funding call suspended` : t`Funding call restored`)
      onDone?.()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || t`Could not change the suspension`)
    }
  }

  return (
    <Modal
      open={!!grant}
      onClose={onClose}
      title={suspending ? t`Suspend funding call` : t`Restore funding call`}
      description={grant?.title}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-600">
          {suspending ? (
            <Trans>
              Members will not see this call until you restore it. The organisation that posted it sees your reason and
              can reply.
            </Trans>
          ) : (
            <Trans>Members will see this call again. You can add a note for the organisation that posted it.</Trans>
          )}
        </p>

        <div>
          <label htmlFor="grant-suspension-reason" className="block text-sm font-medium text-ktip-sand-700 mb-1">
            {suspending ? <Trans>Reason (the poster sees this)</Trans> : <Trans>Note to the poster (optional)</Trans>}
          </label>
          <textarea
            id="grant-suspension-reason"
            rows={4}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            className={textareaClass}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            size="sm"
            variant={suspending ? 'danger' : 'primary'}
            icon={suspending ? <Ban size={14} /> : <RotateCcw size={14} />}
            loading={loading}
            disabled={suspending && !trimmed}
            onClick={submit}
          >
            {suspending ? <Trans>Suspend</Trans> : <Trans>Restore</Trans>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
