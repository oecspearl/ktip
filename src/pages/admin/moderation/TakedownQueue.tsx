import { useState } from 'react'
import { AlertTriangle, ExternalLink, Gavel, Scale } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { Badge } from '../../../components/ui/Badge'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import {
  useApplyTakedownOutcome,
  useCounterNotices,
  useTakedownQueue,
  type TakedownNotice,
  type TakedownStatus,
} from '../../../hooks/useTakedowns'
import { formatDate } from '../../../lib/utils'

/**
 * The copyright queue, alongside the conduct queue it sits next to.
 *
 * Behind the existing `moderation:view` / `moderation:action` permissions rather
 * than a new key — a copyright notice is moderation work, and adding a key here
 * would force a matching migration edit under rbac-parity.test.ts for no gain.
 */

const STATUS_TONE: Record<TakedownStatus, 'default' | 'warning' | 'danger' | 'success' | 'info'> = {
  received: 'warning',
  reviewing: 'info',
  actioned: 'danger',
  rejected: 'default',
  counter_received: 'warning',
  restored: 'success',
  withdrawn: 'default',
}

const STATUS_LABEL: Record<TakedownStatus, string> = {
  received: 'Received',
  reviewing: 'Reviewing',
  actioned: 'Actioned',
  rejected: 'Rejected',
  counter_received: 'Counter-notice filed',
  restored: 'Restored',
  withdrawn: 'Withdrawn',
}

export function TakedownQueue() {
  const auth = useAuth()
  const toast = useToast()

  const [statusFilter, setStatusFilter] = useState<TakedownStatus | 'all'>('all')
  const [selected, setSelected] = useState<TakedownNotice | null>(null)
  const [notes, setNotes] = useState('')

  const { data: notices, isPending } = useTakedownQueue(statusFilter)
  const { data: counters } = useCounterNotices(selected?.id ?? null)
  const applyOutcome = useApplyTakedownOutcome()

  const canAction = auth.can('moderation:action')

  const open = (notice: TakedownNotice) => {
    setSelected(notice)
    setNotes(notice.admin_notes ?? '')
  }

  const decide = async (
    status: Extract<TakedownStatus, 'reviewing' | 'actioned' | 'rejected' | 'restored' | 'withdrawn'>
  ) => {
    if (!selected) return
    try {
      const result = await applyOutcome.mutateAsync({
        noticeId: selected.id,
        status,
        notes: notes || undefined,
      })
      // Surfaced, never executed automatically. Terminating an account is a
      // decision someone makes with the queue in front of them.
      if (result.at_limit) {
        toast.error(
          `This account is now at ${result.strikes} of ${result.limit} standing notices. Review it for termination.`
        )
      } else {
        toast.success(`Notice ${STATUS_LABEL[status].toLowerCase()}. Strikes: ${result.strikes}`)
      }
      setSelected(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record the outcome')
    }
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-ktip-sand-100 bg-ktip-cream p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <Scale size={16} className="text-ktip-sand-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TakedownStatus | 'all')}
            className="rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm focus:border-ktip-ocean-500 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20"
          >
            <option value="all">All statuses</option>
            <option value="received">Received</option>
            <option value="reviewing">Reviewing</option>
            <option value="counter_received">Counter-notice filed</option>
            <option value="actioned">Actioned</option>
            <option value="rejected">Rejected</option>
            <option value="restored">Restored</option>
          </select>
          <p className="text-sm text-ktip-sand-500">
            Filed through the public form at /legal/copyright/report — claimants do not need an
            account.
          </p>
        </div>
      </div>

      {isPending ? (
        <p className="py-8 text-center text-sm text-ktip-sand-500">Loading notices…</p>
      ) : !notices || notices.length === 0 ? (
        <p className="py-8 text-center text-sm text-ktip-sand-500">No notices.</p>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <button
              key={notice.id}
              type="button"
              onClick={() => open(notice)}
              className="w-full rounded-2xl border border-ktip-sand-100 bg-ktip-cream p-4 text-left shadow-card transition-colors hover:border-ktip-ocean-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-ktip-sand-500">{notice.reference}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-ktip-sand-900">
                    {notice.claimant_name}
                    {notice.claimant_org ? ` · ${notice.claimant_org}` : ''}
                  </p>
                  <p className="mt-1 truncate text-sm text-ktip-sand-600">{notice.target_url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {notice.counts_as_strike && (
                    <Badge variant="danger" size="sm">
                      Strike
                    </Badge>
                  )}
                  <Badge variant={STATUS_TONE[notice.status]} size="sm">
                    {STATUS_LABEL[notice.status]}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-xs text-ktip-sand-500">{formatDate(notice.created_at)}</p>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? `Notice ${selected.reference}` : ''}
      >
        {selected && (
          <div className="space-y-5">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-ktip-sand-900">Claimant</dt>
                <dd className="text-ktip-sand-700">
                  {selected.claimant_name}
                  {selected.claimant_org ? ` · ${selected.claimant_org}` : ''} ·{' '}
                  {selected.claimant_email}
                  <br />
                  Filing as{' '}
                  {selected.claimant_role === 'owner' ? 'the owner' : 'an authorised agent'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ktip-sand-900">Content</dt>
                <dd>
                  <a
                    href={selected.target_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-ktip-ocean-700 hover:underline"
                  >
                    {selected.target_url}
                    <ExternalLink size={13} aria-hidden />
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ktip-sand-900">The work claimed</dt>
                <dd className="whitespace-pre-wrap text-ktip-sand-700">
                  {selected.work_description}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ktip-sand-900">Why it infringes</dt>
                <dd className="whitespace-pre-wrap text-ktip-sand-700">
                  {selected.infringement_detail}
                </dd>
              </div>
              {selected.content_snapshot && (
                <div>
                  <dt className="font-semibold text-ktip-sand-900">Snapshot at filing</dt>
                  <dd className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ktip-sand-50 p-3 text-xs text-ktip-sand-700">
                    {selected.content_snapshot}
                  </dd>
                </div>
              )}
            </dl>

            {counters && counters.length > 0 && (
              <div className="rounded-xl border border-ktip-sun-300 bg-ktip-sun-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ktip-sand-900">
                  <AlertTriangle size={15} aria-hidden className="text-ktip-sun-700" />
                  Counter-notice filed
                </p>
                {counters.map((counter) => (
                  <p key={counter.id} className="mt-2 whitespace-pre-wrap text-sm text-ktip-sand-700">
                    {counter.infringement_detail}
                  </p>
                ))}
                <p className="mt-2 text-xs text-ktip-sand-600">
                  Pass this to the claimant. Unless they tell us they have started proceedings,
                  restore the content — restoring also clears the strike.
                </p>
              </div>
            )}

            <Textarea
              label="Internal notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              fullWidth
            />

            {canAction ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => decide('reviewing')} loading={applyOutcome.isPending}>
                  Mark reviewing
                </Button>
                <Button variant="secondary" size="sm" onClick={() => decide('rejected')} loading={applyOutcome.isPending}>
                  Reject
                </Button>
                <Button variant="secondary" size="sm" onClick={() => decide('restored')} loading={applyOutcome.isPending}>
                  Restore
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Gavel size={16} />}
                  onClick={() => decide('actioned')}
                  loading={applyOutcome.isPending}
                >
                  Action — remove content
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ktip-sand-500">
                You can read this queue but not act on it.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
