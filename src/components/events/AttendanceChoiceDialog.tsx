import { useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { AttendanceTypePicker } from './AttendanceTypePicker'
import type { AttendanceType } from '../../types'

interface AttendanceChoiceDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (type: AttendanceType) => void
  /** Every participant place is taken; spectating is still open */
  participantFull: boolean
  hasChallenge: boolean
  /** What to preselect, e.g. the answer given before "Change" was pressed */
  initial?: AttendanceType
  loading?: boolean
}

/**
 * Asked after "Request to attend" is pressed, not before: the button is the
 * decision to go, this is how. Shown only on event types with an audience
 * (blueprint `allowViewers`); everywhere else attending means taking part.
 */
export function AttendanceChoiceDialog({
  open,
  onClose,
  onConfirm,
  participantFull,
  hasChallenge,
  initial = 'participant',
  loading,
}: AttendanceChoiceDialogProps) {
  const { t } = useLingui()
  const pick = (): AttendanceType => (participantFull ? 'viewer' : initial)
  const [choice, setChoice] = useState<AttendanceType>(pick)

  // Fresh answer each time it opens, so a cancelled choice does not linger.
  useEffect(() => {
    if (open) setChoice(pick())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title={t`How do you want to attend?`} size="sm">
      <AttendanceTypePicker
        value={choice}
        onChange={setChoice}
        hasChallenge={hasChallenge}
        disabled={loading}
        hideLegend
        unavailable={participantFull ? { participant: t`All participant places are taken.` } : undefined}
      />
      <div className="flex gap-3">
        <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>
          {t`Cancel`}
        </Button>
        <Button fullWidth onClick={() => onConfirm(choice)} loading={loading}>
          {t`Continue`}
        </Button>
      </div>
    </Modal>
  )
}
