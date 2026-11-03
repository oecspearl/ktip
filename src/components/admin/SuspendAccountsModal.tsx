import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../contexts/ToastContext'
import { settleEach } from '../../lib/bulk'
import { sendAdminNote } from '../../lib/admin-notes'

export interface SuspendAccountTarget {
  id: string
  name: string
}

interface SuspendAccountsModalProps {
  /** Null closes the modal. */
  targets: SuspendAccountTarget[] | null
  mode: 'suspend' | 'reinstate'
  onClose: () => void
  /** useAdminUserActions().setSuspension — one account per call. */
  setSuspension: (
    userId: string,
    suspended: boolean,
    reason?: string,
    until?: string
  ) => Promise<{ success: true; warning?: string }>
  onDone: (changedIds: string[]) => void
}

/** The last moment of the chosen day, in the admin's own time zone. */
function endOfDay(date: string): string | undefined {
  if (!date) return undefined
  const parsed = new Date(`${date}T23:59:59`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function todayInput(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Suspend or reinstate one account or several (124, 184). One request per
 * account through settleEach, because the Super Admin ceiling is decided per
 * target: an Admin in the batch is refused on its own row and the rest still
 * go through. A reason is shown to the member on /account/suspended and sent
 * to them as a note.
 */
export function SuspendAccountsModal({ targets, mode, onClose, setSuspension, onDone }: SuspendAccountsModalProps) {
  const { t } = useLingui()
  const toast = useToast()
  const open = !!targets && targets.length > 0
  const [reason, setReason] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null)
  const [failures, setFailures] = useState<{ name: string; message: string }[] | null>(null)
  const [doneCount, setDoneCount] = useState(0)

  useEffect(() => {
    if (!open) {
      setReason('')
      setEndsOn('')
      setProgress(null)
      setFailures(null)
      setDoneCount(0)
    }
  }, [open])

  if (!targets) return null

  const suspending = mode === 'suspend'
  const running = progress !== null && failures === null
  const label =
    targets.length === 1
      ? targets[0].name
      : plural(targets.length, { one: '# account', other: '# accounts' })

  const run = async () => {
    const until = suspending ? endOfDay(endsOn) : undefined
    const note = reason.trim()
    const warnings = new Set<string>()
    setProgress({ finished: 0, total: targets.length })

    const result = await settleEach(
      targets,
      async (target) => {
        const response = await setSuspension(target.id, suspending, suspending ? note || undefined : undefined, until)
        if (response.warning) warnings.add(response.warning)
        if (suspending && note) await sendAdminNote('account', target.id, note)
      },
      { onProgress: (finished, total) => setProgress({ finished, total }) }
    )

    onDone(result.done.map((target) => target.id))
    for (const warning of warnings) toast.error(warning)

    if (result.failed.length === 0) {
      const n = result.done.length
      toast.success(
        suspending
          ? plural(n, { one: '# account suspended', other: '# accounts suspended' })
          : plural(n, { one: '# account reinstated', other: '# accounts reinstated' })
      )
      onClose()
      return
    }
    setDoneCount(result.done.length)
    setFailures(result.failed.map(({ item, message }) => ({ name: item.name, message })))
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
                <p className="text-sm font-semibold text-ktip-sand-900">{failure.name}</p>
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
      title={suspending ? t`Suspend ${label}?` : t`Reinstate ${label}?`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-ktip-sand-700">
          {suspending
            ? t`They lose every permission straight away. They can still sign in, but only to a page that shows your reason and lets them appeal.`
            : t`Their permissions come back straight away.`}
        </p>

        {targets.length > 1 && (
          <ul className="max-h-40 divide-y divide-ktip-sand-200 overflow-y-auto rounded-xl border border-ktip-sand-200">
            {targets.map((target) => (
              <li key={target.id} className="px-4 py-2 text-sm text-ktip-sand-900">
                {target.name}
              </li>
            ))}
          </ul>
        )}

        {suspending && (
          <>
            <Textarea
              label={t`Reason`}
              helperText={t`The member sees this on their suspended page and gets it as a note.`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={running}
              rows={3}
              maxLength={500}
              fullWidth
            />
            <Input
              type="date"
              label={t`Ends on (optional)`}
              helperText={t`Leave empty to suspend until further notice.`}
              value={endsOn}
              min={todayInput()}
              onChange={(e) => setEndsOn(e.target.value)}
              disabled={running}
              fullWidth
            />
          </>
        )}

        {running && progress && (
          <p role="status" className="flex items-center gap-2 text-sm text-ktip-sand-600">
            <Loader2 size={16} className="animate-spin" />
            <Trans>
              {progress.finished} of {progress.total} done…
            </Trans>
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-ktip-sand-100 pt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={running}>
            <Trans>Cancel</Trans>
          </Button>
          <Button variant={suspending ? 'danger' : 'primary'} size="sm" onClick={run} loading={running}>
            {suspending ? t`Suspend` : t`Reinstate`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
