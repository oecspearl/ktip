import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Gavel, Link2, Scale } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { Badge } from '../../../components/ui/Badge'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import {
  useApplyTakedownOutcome,
  useCounterNotices,
  useSetTakedownTarget,
  useTakedownQueue,
  type TakedownContentEffect,
  type TakedownNotice,
  type TakedownStatus,
} from '../../../hooks/useTakedowns'
import { formatDate } from '../../../lib/utils'
import { isUuid } from '../../../lib/slug'
import { parseTakedownTarget, type TakedownTargetType } from '../../../lib/takedown-target'
import { supabase } from '../../../lib/supabase'

/** Targets apply_takedown_outcome() can hide and restore (185). */
const HOLDABLE = new Set([
  'project', 'resource', 'event', 'forum_post', 'forum_reply', 'project_comment', 'event_solution',
])

const TARGET_TABLE: Record<TakedownTargetType, string> = {
  resource: 'resources',
  project: 'projects',
  event: 'events',
}

const TARGET_PATH: Record<TakedownTargetType, string> = {
  resource: '/resources',
  project: '/projects',
  event: '/events',
}

/** Looks up a page by id or slug. Staff read past the status filter. */
async function findTarget(type: TakedownTargetType, key: string): Promise<{ id: string; title: string } | null> {
  const { data, error } = await (supabase as any)
    .from(TARGET_TABLE[type])
    .select('id, title')
    .eq(isUuid(key) ? 'id' : 'slug', key)
    .maybeSingle()
  if (error || !data) return null
  return data as { id: string; title: string }
}

/**
 * Which piece of KTIP content the notice is about. Starting a review hides it,
 * so the moderator confirms it first; a notice from a "Report infringement"
 * link arrives with it already filled in, and a pasted URL pre-fills the rest.
 */
function TakedownTargetPanel({ notice, canAction }: { notice: TakedownNotice; canAction: boolean }) {
  const { t } = useLingui()
  const toast = useToast()
  const setTarget = useSetTakedownTarget()
  const guess = parseTakedownTarget(notice.target_url)
  const [type, setType] = useState<TakedownTargetType>(guess?.type ?? 'resource')
  const [key, setKey] = useState(guess?.key ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setType(guess?.type ?? 'resource')
    setKey(guess?.key ?? '')
    setEditing(false)
    // Reset per notice; `guess` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice.id])

  const linkedType = notice.target_type as TakedownTargetType | null
  const { data: linked } = useQuery({
    queryKey: ['takedowns', 'target', notice.target_type, notice.target_id],
    queryFn: () => findTarget(linkedType!, notice.target_id!),
    enabled: !!notice.target_id && !!linkedType && linkedType in TARGET_TABLE,
  })

  const link = async () => {
    const parsed = parseTakedownTarget(key)
    const lookupType = parsed?.type ?? type
    const lookupKey = (parsed?.key ?? key).trim()
    if (!lookupKey) return
    const found = await findTarget(lookupType, lookupKey)
    if (!found) {
      toast.error(t`Nothing on KTIP matches that link or ID.`)
      return
    }
    try {
      await setTarget.mutateAsync({ noticeId: notice.id, targetType: lookupType, targetId: found.id })
      toast.success(t`Linked to "${found.title}".`)
      setEditing(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Could not link the content`)
    }
  }

  const hasTarget = !!notice.target_id && !!notice.target_type

  return (
    <div className="rounded-xl border border-ktip-sand-200 p-4">
      <p className="text-sm font-semibold text-ktip-sand-900">
        <Trans>Content on KTIP</Trans>
      </p>
      {hasTarget ? (
        <p className="mt-1 text-sm text-ktip-sand-700">
          {linked && linkedType && linkedType in TARGET_PATH ? (
            <Link
              to={`${TARGET_PATH[linkedType]}/${linked.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-ktip-ocean-700 hover:underline"
            >
              {linked.title}
              <ExternalLink size={13} aria-hidden />
            </Link>
          ) : (
            <span className="font-mono text-xs">
              {notice.target_type} · {notice.target_id}
            </span>
          )}
          {notice.held_content && (
            <span className="ml-2 text-caption text-ktip-sun-700">
              <Trans>Hidden by this notice</Trans>
            </span>
          )}
        </p>
      ) : (
        <p className="mt-1 text-sm text-ktip-sand-600">
          <Trans>Not linked yet. Starting a review hides nothing until you link the content.</Trans>
        </p>
      )}

      {canAction && !notice.held_content && (editing || !hasTarget) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-label font-medium text-ktip-sand-700">
            <Trans>Type</Trans>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TakedownTargetType)}
              className="rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm focus:border-ktip-ocean-500 focus:outline-hidden"
            >
              <option value="resource">{t`Resource`}</option>
              <option value="project">{t`Project`}</option>
              <option value="event">{t`Event`}</option>
            </select>
          </label>
          <div className="flex-1">
            <Input
              label={t`Link or ID`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              fullWidth
            />
          </div>
          <Button size="sm" variant="secondary" icon={<Link2 size={16} />} onClick={link} loading={setTarget.isPending}>
            <Trans>Link content</Trans>
          </Button>
        </div>
      )}

      {canAction && !notice.held_content && hasTarget && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 text-caption font-medium text-ktip-ocean-700 hover:underline"
        >
          <Trans>Change</Trans>
        </button>
      )}
    </div>
  )
}

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
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()

  const [statusFilter, setStatusFilter] = useState<TakedownStatus | 'all'>('all')
  const [picked, setSelected] = useState<TakedownNotice | null>(null)
  const [notes, setNotes] = useState('')

  const { data: notices, isPending } = useTakedownQueue(statusFilter)
  // Read through the live list, so linking a target updates the open modal.
  const selected = picked ? (notices?.find((n) => n.id === picked.id) ?? picked) : null
  const { data: counters } = useCounterNotices(selected?.id ?? null)
  const applyOutcome = useApplyTakedownOutcome()

  const canAction = auth.can('moderation:action')

  // What each button actually does to the content, so the label never
  // promises a removal that will not happen (185).
  const linked = !!selected?.target_id && HOLDABLE.has(selected?.target_type ?? '')
  const held = !!selected?.held_content
  const labels = {
    reviewing: linked ? t`Start review and hide content` : t`Start review`,
    rejected: held ? t`Reject and restore content` : t`Reject`,
    restored: held ? t`Restore content` : t`Mark restored`,
    actioned: linked ? t`Uphold and remove content` : t`Uphold notice`,
  }

  const contentMessage = (effect: TakedownContentEffect | undefined, status: TakedownStatus): string => {
    switch (effect) {
      case 'quarantined':
        return t`The content is hidden while you review it.`
      case 'removed':
        return t`The content has been removed.`
      case 'restored':
        return t`The content is visible again.`
      case 'still_held':
        return t`Another notice still holds this content, so it stays hidden.`
      case 'unsupported':
        return t`This content can't be hidden from here. Act on it by hand.`
      case 'no_target':
        return status === 'reviewing' || status === 'actioned'
          ? t`No content is linked, so nothing was hidden.`
          : ''
      default:
        return ''
    }
  }

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
      const effect = contentMessage(result.content, status)
      if (result.at_limit) {
        toast.error(
          `This account is now at ${result.strikes} of ${result.limit} standing notices. Review it for termination.`
        )
      } else {
        toast.success(`Notice ${STATUS_LABEL[status].toLowerCase()}. Strikes: ${result.strikes}`)
      }
      if (effect) {
        if (result.content === 'unsupported' || result.content === 'no_target') toast.warning(effect)
        else toast.info(effect)
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
            className="rounded-lg border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm focus:border-ktip-ocean-500 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20"
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

            <TakedownTargetPanel notice={selected} canAction={canAction} />

            <Textarea
              label="Internal notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              fullWidth
            />

            {canAction ? (
              <div className="flex flex-wrap justify-end gap-2">
                {selected.status !== 'reviewing' && (
                  <Button variant="ghost" size="sm" onClick={() => decide('reviewing')} loading={applyOutcome.isPending}>
                    {labels.reviewing}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => decide('rejected')} loading={applyOutcome.isPending}>
                  {labels.rejected}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => decide('restored')} loading={applyOutcome.isPending}>
                  {labels.restored}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Gavel size={16} />}
                  onClick={() => decide('actioned')}
                  loading={applyOutcome.isPending}
                >
                  {labels.actioned}
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
