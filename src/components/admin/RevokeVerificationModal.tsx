import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../contexts/ToastContext'
import { useClearVerificationHold, useRevokeVerification } from '../../hooks/useVerificationLifecycle'

/**
 * Removing a badge, or lifting a hold, always with a reason (migration 174).
 * The member is sent the reason, so the copy says so. Admin console: English
 * only, like the rest of /admin.
 */
export function RevokeVerificationModal({
  target,
  mode = 'revoke',
  onClose,
  onDone,
}: {
  target: { userId: string; userName: string } | null
  mode?: 'revoke' | 'clear_hold'
  onClose: () => void
  onDone?: () => void
}) {
  const toast = useToast()
  const { revoke, loading: revoking } = useRevokeVerification()
  const { clearHold, loading: clearing } = useClearVerificationHold()
  const [reason, setReason] = useState('')
  const [hold, setHold] = useState(true)

  if (!target) return null

  const close = () => {
    setReason('')
    setHold(true)
    onClose()
  }

  const submit = async () => {
    try {
      if (mode === 'revoke') {
        await revoke({ userId: target.userId, reason: reason.trim(), hold })
        toast.success(`${target.userName} is no longer verified`)
      } else {
        await clearHold({ userId: target.userId, reason: reason.trim() })
        toast.success(`${target.userName} can verify again`)
      }
      close()
      onDone?.()
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    }
  }

  const tooShort = reason.trim().length < 10

  return (
    <Modal
      open
      onClose={close}
      title={mode === 'revoke' ? `Remove verification from ${target.userName}?` : `Lift the hold on ${target.userName}?`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-600">
          {mode === 'revoke'
            ? 'They lose the badge and every action that needs it. Their roles stay; change those separately. They are notified and shown your reason.'
            : 'Their email address, institution or a code will be able to verify them again. They are notified.'}
        </p>
        <Textarea
          label="Reason (the member sees this)"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={mode === 'revoke' ? 'e.g. Left the OECS Commission in September' : 'e.g. Appeal upheld after a call with their manager'}
          rows={3}
          fullWidth
        />
        {mode === 'revoke' && (
          <label className="flex items-start gap-2 text-sm text-ktip-sand-700">
            <input
              type="checkbox"
              checked={hold}
              onChange={(e) => setHold(e.currentTarget.checked)}
              className="mt-1"
            />
            <span>
              Pause automatic verification. Without this, their work email or institution could verify
              them again at their next sign-in. Leave it ticked unless they only verified the wrong way.
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={mode === 'revoke' ? 'danger' : 'primary'}
            onClick={submit}
            loading={revoking || clearing}
            disabled={tooShort}
          >
            {mode === 'revoke' ? 'Remove verification' : 'Lift hold'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default RevokeVerificationModal
