import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../contexts/ToastContext'
import type { SettledBatch } from '../../lib/bulk'

export interface ModerationTarget {
  id: string
  title: string
}

interface ModerationReasonModalProps {
  open: boolean
  mode: 'suspend' | 'restore'
  /** Already counted and translated by the page, e.g. "3 projects". */
  label: string
  items: ModerationTarget[]
  onClose: () => void
  onRun: (
    ids: string[],
    reason: string,
    onProgress: (finished: number, total: number) => void
  ) => Promise<SettledBatch<string>>
  /** The ids that changed, so the page can drop its selection. */
  onDone: (changedIds: string[]) => void
}

/**
 * Suspend or restore one or several projects, events or resources from the
 * console (183). A suspension needs a reason, because the owner is sent it.
 * Each row is its own RPC, so one refusal is reported against that row and
 * the rest still go through, the way BulkDeleteDialog reports a delete.
 */
export function ModerationReasonModal({
  open,
  mode,
  label,
  items,
  onClose,
  onRun,
  onDone,
}: ModerationReasonModalProps) {
  const { t } = useLingui()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null)
  const [failures, setFailures] = useState<{ title: string; message: string }[] | null>(null)
  const [doneCount, setDoneCount] = useState(0)

  useEffect(() => {
    if (!open) {
      setReason('')
      setProgress(null)
      setFailures(null)
      setDoneCount(0)
    }
  }, [open])

  const running = progress !== null && failures === null
  const suspending = mode === 'suspend'
  const ready = items.length > 0 && (!suspending || reason.trim().length > 0)

  const run = async () => {
    if (!ready) return
    const titleOf = new Map(items.map((item) => [item.id, item.title]))
    setProgress({ finished: 0, total: items.length })
    const result = await onRun(
      items.map((item) => item.id),
      reason.trim(),
      (finished, total) => setProgress({ finished, total })
    )
    onDone(result.done)

    if (result.failed.length === 0) {
      const n = result.done.length
      toast.success(
        suspending
          ? plural(n, { one: '# item suspended', other: '# items suspended' })
          : plural(n, { one: '# item restored', other: '# items restored' })
      )
      onClose()
      return
    }
    setDoneCount(result.done.length)
    setFailures(
      result.failed.map(({ item, message }) => ({ title: titleOf.get(item) || t`Untitled`, message }))
    )
  }

  if (failures) {
    const total = doneCount + failures.length
    return (
      <Modal open={open} onClose={onClose} title={t`Some could not be changed`} size="lg">
        <div className="space-y-5">
          <p className="text-sm text-ktip-sand-700">
            <Trans>
              {doneCount} of {total} changed. These were not:
            </Trans>
          </p>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {failures.map((failure, index) => (
              <li key={index} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-ktip-sand-900">{failure.title}</p>
                <p className="mt-0.5 text-sm text-red-700">{failure.message}</p>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={onClose}>
              <Trans>Close</Trans>
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={running ? () => {} : onClose}
      title={suspending ? t`Suspend ${label}?` : t`Restore ${label}?`}
      description={
        suspending
          ? t`Suspended items are hidden from everyone except the owner and staff.`
          : t`Restored items are visible again to everyone who could see them before.`
      }
      size="lg"
    >
      <div className="space-y-5">
        <ul className="max-h-48 divide-y divide-ktip-sand-200 overflow-y-auto rounded-xl border border-ktip-sand-200">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-2.5 text-sm font-semibold text-ktip-sand-900">
              {item.title || t`Untitled`}
            </li>
          ))}
        </ul>

        {suspending && (
          <Textarea
            label={t`Reason`}
            helperText={t`Sent to the owner as a note, and kept in the moderation log.`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={running}
            rows={3}
            maxLength={1000}
            fullWidth
          />
        )}

        {running && progress && (
          <p role="status" className="flex items-center gap-2 text-sm text-ktip-sand-600">
            <Loader2 size={16} className="animate-spin" />
            <Trans>
              {progress.finished} of {progress.total} done…
            </Trans>
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant={suspending ? 'danger' : 'primary'}
            size="sm"
            loading={running}
            disabled={!ready}
            onClick={run}
          >
            {suspending ? t`Suspend` : t`Restore`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
