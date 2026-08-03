import { Loader2, Check, CircleAlert } from 'lucide-react'
import type { SaveStatus } from '../../../hooks/useAutoSave'
import { Trans } from '@lingui/react/macro'

interface SaveStatusBadgeProps {
  status: SaveStatus
}

export function SaveStatusBadge({ status }: SaveStatusBadgeProps) {
  if (status === 'idle') return null

  return (
    <span className="inline-flex items-center gap-1 ml-3 text-xs">
      {status === 'saving' && (
        <>
          <Loader2 size={12} className="animate-spin text-ktip-sand-400" />
          <span className="text-ktip-sand-400"><Trans>Saving...</Trans></span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={12} className="text-ktip-tropical-700 dark:text-ktip-tropical-500" />
          <span className="text-ktip-tropical-600"><Trans>Saved</Trans></span>
        </>
      )}
      {status === 'error' && (
        <>
          <CircleAlert size={12} className="text-red-400" />
          <span className="text-red-500"><Trans>Save failed</Trans></span>
        </>
      )}
    </span>
  )
}
