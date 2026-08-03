import { useState } from 'react'
import { Flag } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { ReportModal } from './ReportModal'
import type { ModerationTargetType } from '../../types'
import { useLingui } from '@lingui/react/macro'

interface ReportButtonProps {
  targetType: ModerationTargetType
  targetId: string
  targetAuthorId?: string | null
  contentSnapshot?: string | null
  targetLabel?: string
  className?: string
}

/**
 * Small trigger that owns its own modal, so a card only has to drop it in
 * rather than thread open state through. Hidden for signed-out visitors and
 * for the author's own content.
 */
export function ReportButton({
  targetType,
  targetId,
  targetAuthorId,
  contentSnapshot,
  targetLabel,
  className = '',
}: ReportButtonProps) {
    const { t } = useLingui()
  const auth = useAuth()
  const [open, setOpen] = useState(false)

  if (!auth.user || auth.user.id === targetAuthorId) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t`Report`}
        aria-label={t`Report this content`}
        className={`p-1 text-ktip-sand-400 hover:text-red-500 transition-colors shrink-0 ${className}`}
      >
        <Flag size={16} />
      </button>

      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        targetAuthorId={targetAuthorId}
        contentSnapshot={contentSnapshot}
        targetLabel={targetLabel}
      />
    </>
  )
}

export default ReportButton
