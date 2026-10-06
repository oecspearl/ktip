import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useToast } from '../../contexts/ToastContext'
import {
  describeBulkDeletion,
  isBulkDeleteConfirmed,
  type BulkDeleteItem,
} from '../../lib/delete-guard'
import type { SettledBatch } from '../../lib/bulk'

type Kind = 'event' | 'project'

interface BulkDeleteDialogProps {
  open: boolean
  kind: Kind
  /** Null while the facts behind each row's impact are still loading. */
  items: BulkDeleteItem[] | null
  onClose: () => void
  onDelete: (
    ids: string[],
    onProgress: (finished: number, total: number) => void
  ) => Promise<SettledBatch<string>>
  /** Called once the run ends, with the ids that are gone, so the list can drop them. */
  onDeleted: (deletedIds: string[]) => void
}

/**
 * DeleteEntityDialog for several rows at once. It decides nothing either: each
 * row's impact comes from delete-guard exactly as its own delete button would
 * compute it, and describeBulkDeletion only merges them. A row that would have
 * asked for its title alone is listed with its warning, and its presence makes
 * the whole batch ask for confirmation.
 *
 * The deletes are independent, so a partial failure is reported row by row
 * instead of being rolled up into one error.
 */
export function BulkDeleteDialog({ open, kind, items, onClose, onDelete, onDeleted }: BulkDeleteDialogProps) {
  const { t } = useLingui()
  const toast = useToast()

  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null)
  const [failures, setFailures] = useState<{ title: string; message: string }[] | null>(null)
  const [doneCount, setDoneCount] = useState(0)

  // A reopened dialog starts clean: no half-typed confirmation, no old report.
  useEffect(() => {
    if (!open) {
      setTyped('')
      setProgress(null)
      setFailures(null)
      setDoneCount(0)
    }
  }, [open])

  const bulk = useMemo(() => describeBulkDeletion(items ?? []), [items])
  const running = progress !== null && failures === null
  const confirmed = items !== null && isBulkDeleteConfirmed(bulk, typed)

  const copy =
    kind === 'event'
      ? {
          title: plural(bulk.count, { one: 'Delete # event?', other: 'Delete # events?' }),
          confirm: plural(bulk.count, { one: 'Delete # event', other: 'Delete # events' }),
          typeTitle: t`Type the event title to confirm`,
          deleted: (n: number) => plural(n, { one: '# event deleted', other: '# events deleted' }),
        }
      : {
          title: plural(bulk.count, { one: 'Delete # project?', other: 'Delete # projects?' }),
          confirm: plural(bulk.count, { one: 'Delete # project', other: 'Delete # projects' }),
          typeTitle: t`Type the project title to confirm`,
          deleted: (n: number) => plural(n, { one: '# project deleted', other: '# projects deleted' }),
        }

  const handleConfirm = async () => {
    if (!items || !confirmed) return
    const titleOf = new Map(items.map((item) => [item.id, item.title]))
    setProgress({ finished: 0, total: items.length })
    const result = await onDelete(
      items.map((item) => item.id),
      (finished, total) => setProgress({ finished, total })
    )
    onDeleted(result.done)

    if (result.failed.length === 0) {
      toast.success(copy.deleted(result.done.length))
      onClose()
      return
    }
    setDoneCount(result.done.length)
    setFailures(
      result.failed.map(({ item, message }) => ({ title: titleOf.get(item) || t`Untitled`, message }))
    )
  }

  // After a partial failure the dialog becomes the report.
  if (failures) {
    const total = doneCount + failures.length
    return (
      <Modal open={open} onClose={onClose} title={t`Some could not be deleted`} size="lg">
        <div className="space-y-5">
          <p className="text-sm text-ktip-sand-700">
            <Trans>
              {doneCount} of {total} deleted. These are still here:
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
      title={copy.title}
      description={t`This cannot be undone.`}
      size="lg"
    >
      <div className="space-y-5">
        {items === null ? (
          <p className="flex items-center gap-2 text-sm text-ktip-sand-600">
            <Loader2 size={16} className="animate-spin" />
            <Trans>Checking what each one holds…</Trans>
          </p>
        ) : (
          <>
            <ul className="max-h-60 divide-y divide-ktip-sand-200 overflow-y-auto rounded-xl border border-ktip-sand-200">
              {items.map((item) => (
                <li key={item.id} className="px-4 py-2.5">
                  <p className="text-sm font-semibold text-ktip-sand-900">{item.title || t`Untitled`}</p>
                  {item.impact.requiresTitleConfirmation && item.impact.warning && (
                    <p className="mt-1 flex gap-1.5 text-caption text-red-700">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>{item.impact.warning}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div>
              <p className="text-sm text-ktip-sand-700">
                <Trans>Deleting removes, for each one:</Trans>
              </p>
              <ul className="mt-2 space-y-1.5">
                {bulk.cascades.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-ktip-sand-600">
                    <span aria-hidden="true" className="text-ktip-sand-400">
                      &bull;
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {bulk.requiresConfirmation && (
              <Input
                label={bulk.count === 1 ? copy.typeTitle : t`Type ${bulk.count} to confirm`}
                placeholder={bulk.confirmPhrase}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={running}
                autoComplete="off"
                inputMode={bulk.count === 1 ? undefined : 'numeric'}
                fullWidth
              />
            )}
          </>
        )}

        {running && progress && (
          <p role="status" className="flex items-center gap-2 text-sm text-ktip-sand-600">
            <Loader2 size={16} className="animate-spin" />
            <Trans>
              Deleting {progress.finished} of {progress.total}…
            </Trans>
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700 disabled:opacity-50"
          >
            <Trans>Keep them</Trans>
          </button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={16} />}
            loading={running}
            disabled={!confirmed}
            onClick={handleConfirm}
          >
            {copy.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
