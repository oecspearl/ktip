import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { isDeleteConfirmed, type DeleteImpact } from '../../lib/delete-guard'
import { Trans, useLingui } from '@lingui/react/macro'

interface DeleteEntityDialogProps {
  open: boolean
  /** Lower-case singular: "event", "project". Used in the copy only. */
  noun: string
  /** The row's title, echoed back and used as the typed confirmation phrase. */
  title: string
  impact: DeleteImpact
  loading?: boolean
  /** Surfaced when the delete itself fails — usually an RLS refusal. */
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The confirm step for an irreversible owner delete. `ConfirmModal` is the
 * house pattern for "are you sure", but it takes a single message string and
 * has no input, so it cannot show the cascade list or take the typed title
 * that [delete-guard.ts](../../lib/delete-guard.ts) asks for on consequential
 * deletes.
 *
 * The dialog decides nothing. Whether typing is required, and what the
 * cascade list says, both come in as `impact`.
 */
export function DeleteEntityDialog({
  open,
  noun,
  title,
  impact,
  loading,
  error,
  onCancel,
  onConfirm,
}: DeleteEntityDialogProps) {
    const { t } = useLingui()
  const [typed, setTyped] = useState('')

  // Reopening after a cancel must not inherit a half-typed confirmation.
  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const confirmed = isDeleteConfirmed(impact, typed, title)

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onCancel}
      title={`Delete this ${noun}?`}
      description={t`This cannot be undone.`}
      size="lg"
    >
      <div className="space-y-5">
        <p className="text-sm text-ktip-sand-700">
          <span className="font-semibold text-ktip-sand-900">{title || `Untitled ${noun}`}</span> will
          be permanently deleted, along with:
        </p>

        <ul className="space-y-1.5">
          {impact.cascades.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-ktip-sand-600">
              <span aria-hidden="true" className="text-ktip-sand-400">
                &bull;
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {impact.warning && (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{impact.warning}</p>
          </div>
        )}

        {impact.requiresTitleConfirmation && (
          <Input
            label={`Type the ${noun} title to confirm`}
            placeholder={title}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={loading}
            autoComplete="off"
            fullWidth
          />
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700 disabled:opacity-50"
          >
            <Trans>Keep it</Trans>
          </button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={16} />}
            loading={loading}
            disabled={!confirmed}
            onClick={onConfirm}
          >
            Delete {noun}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
