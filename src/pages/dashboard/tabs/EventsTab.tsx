import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Calendar, CheckSquare, Plus, Trash2 } from 'lucide-react'
import { isPast } from 'date-fns'
import { Button } from '../../../components/ui/Button'
import { Segmented } from '../../../components/ui/Segmented'
import { EventCard } from '../../../components/events/EventCard'
import { SelectableTile } from '../../../components/shared/SelectableTile'
import { BulkActionBar } from '../../../components/shared/BulkActionBar'
import { BulkDeleteDialog } from '../../../components/shared/BulkDeleteDialog'
import { Modal } from '../../../components/ui/Modal'
import { useUserEvents } from '../../../hooks/useProfile'
import { fetchRsvpCounts, useBulkDeleteEvents, useBulkSetEventStatus } from '../../../hooks/useEvents'
import { useSelection } from '../../../hooks/useSelection'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { describeEventDeletion, type BulkDeleteItem } from '../../../lib/delete-guard'
import { errorMessage } from '../../../lib/bulk'
import type { Event, EventStatus } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

type EventFilter = 'all' | 'upcoming' | 'past' | 'draft'

const isOver = (event: Event) => isPast(new Date(event.end_date || event.start_date))

function matchesFilter(event: Event, filter: EventFilter): boolean {
  if (filter === 'upcoming') return !isOver(event)
  if (filter === 'past') return isOver(event)
  if (filter === 'draft') return event.status === 'draft'
  return true
}

/** The statuses the bar can set. 'completed' is left to the admin console. */
type BulkStatus = Extract<EventStatus, 'published' | 'draft' | 'cancelled'>

export default function EventsTab() {
  const { t } = useLingui()
  usePageTitle(t`My Events`)
  const auth = useAuth()
  const toast = useToast()
  const { events } = useUserEvents(auth.user?.id)
  // Status is the admin's lever; see useBulkSetEventStatus.
  const canSetStatus = auth.can('event:manage')

  const [filter, setFilter] = useState<EventFilter>('all')
  const [selecting, setSelecting] = useState(false)
  const shown = useMemo(() => (events ?? []).filter((event) => matchesFilter(event, filter)), [events, filter])
  const shownIds = useMemo(() => shown.map((event) => event.id), [shown])
  const selection = useSelection(shownIds)

  const { deleteEvents } = useBulkDeleteEvents()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteItems, setDeleteItems] = useState<BulkDeleteItem[] | null>(null)
  // A close-and-reopen while counts load must not let the first answer land.
  const deleteRun = useRef(0)

  const { setStatus, loading: statusLoading } = useBulkSetEventStatus()
  const [statusAction, setStatusAction] = useState<BulkStatus | null>(null)

  const stopSelecting = () => {
    setSelecting(false)
    selection.clear()
  }

  const openDelete = async () => {
    const chosen = shown.filter((event) => selection.isSelected(event.id))
    if (chosen.length === 0) return
    const run = ++deleteRun.current
    setDeleteItems(null)
    setDeleteOpen(true)

    let counts: Map<string, number> | null = null
    try {
      counts = await fetchRsvpCounts(chosen.map((event) => event.id))
    } catch {
      counts = null
    }
    if (run !== deleteRun.current) return

    setDeleteItems(
      chosen.map((event) => ({
        id: event.id,
        title: event.title,
        impact: describeEventDeletion({
          status: event.status,
          rsvpCount: counts ? (counts.get(event.id) ?? 0) : null,
          hasVenue: !!event.has_venue,
          hasChallenge: !!event.has_challenge,
        }),
      }))
    )
  }

  const closeDelete = () => {
    deleteRun.current++
    setDeleteOpen(false)
  }

  const statusCopy = (status: BulkStatus, n: number) => {
    switch (status) {
      case 'published':
        return {
          title: plural(n, { one: 'Publish # event?', other: 'Publish # events?' }),
          message: t`Published events show up in public listings.`,
          confirm: t`Publish`,
          done: plural(n, { one: '# event published', other: '# events published' }),
        }
      case 'draft':
        return {
          title: plural(n, { one: 'Move # event back to draft?', other: 'Move # events back to draft?' }),
          message: t`Drafts are hidden from public listings. Existing registrations are kept.`,
          confirm: t`Move to draft`,
          done: plural(n, { one: '# event moved to draft', other: '# events moved to draft' }),
        }
      case 'cancelled':
        return {
          title: plural(n, { one: 'Cancel # event?', other: 'Cancel # events?' }),
          message: t`Cancelled events stay listed with a Cancelled badge. People who registered are not notified.`,
          confirm: plural(n, { one: 'Cancel event', other: 'Cancel events' }),
          done: plural(n, { one: '# event cancelled', other: '# events cancelled' }),
        }
    }
  }

  const runStatus = async () => {
    if (!statusAction) return
    const ids = selection.selectedIds
    try {
      const result = await setStatus(ids, statusAction)
      if (result.failed.length === 0) {
        toast.success(statusCopy(statusAction, result.done.length).done)
      } else {
        toast.warning(
          t`${result.done.length} of ${ids.length} changed. The rest may no longer be yours to edit.`
        )
      }
      selection.clear()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setStatusAction(null)
  }

  if (!events?.length) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar size={32} className="text-ktip-sand-400" />
        </div>
        <p className="text-ktip-sand-600 mb-4"><Trans>No events organized yet.</Trans></p>
        <Link to="/events/new">
          <Button icon={<Plus size={18} />}><Trans>Create an event</Trans></Button>
        </Link>
      </div>
    )
  }

  const pending = statusAction ? statusCopy(statusAction, selection.count) : null

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          label={t`Show events`}
          options={[
            { value: 'all', label: t`All` },
            { value: 'upcoming', label: t`Upcoming` },
            { value: 'past', label: t`Past` },
            { value: 'draft', label: t`Drafts` },
          ]}
        />
        {!selecting && (
          <Button variant="secondary" size="sm" icon={<CheckSquare size={16} />} onClick={() => setSelecting(true)}>
            <Trans>Select</Trans>
          </Button>
        )}
      </div>

      {selecting && (
        <BulkActionBar
          count={selection.count}
          total={shown.length}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onDone={stopSelecting}
        >
          {canSetStatus && (
            <>
              <Button variant="secondary" size="sm" disabled={!selection.count} onClick={() => setStatusAction('published')}>
                <Trans>Publish</Trans>
              </Button>
              <Button variant="secondary" size="sm" disabled={!selection.count} onClick={() => setStatusAction('draft')}>
                <Trans>Move to draft</Trans>
              </Button>
              <Button variant="secondary" size="sm" disabled={!selection.count} onClick={() => setStatusAction('cancelled')}>
                <Trans>Mark cancelled</Trans>
              </Button>
            </>
          )}
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!selection.count} onClick={openDelete}>
            <Trans>Delete</Trans>
          </Button>
        </BulkActionBar>
      )}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-ktip-sand-600"><Trans>No events match this filter.</Trans></p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr stagger-children">
          {shown.map((event) => (
            <SelectableTile
              key={event.id}
              selecting={selecting}
              selected={selection.isSelected(event.id)}
              onToggle={() => selection.toggle(event.id)}
              label={t`Select ${event.title}`}
            >
              <EventCard event={event} />
            </SelectableTile>
          ))}
        </div>
      )}

      <BulkDeleteDialog
        open={deleteOpen}
        kind="event"
        items={deleteItems}
        onClose={closeDelete}
        onDelete={deleteEvents}
        onDeleted={() => selection.clear()}
      />

      <Modal
        open={!!statusAction}
        onClose={statusLoading ? () => {} : () => setStatusAction(null)}
        title={pending?.title}
        size="md"
      >
        <p className="text-sm text-ktip-sand-700">{pending?.message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setStatusAction(null)}
            disabled={statusLoading}
            className="text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700 disabled:opacity-50"
          >
            <Trans>Go back</Trans>
          </button>
          <Button
            variant={statusAction === 'cancelled' ? 'danger' : 'primary'}
            size="sm"
            loading={statusLoading}
            onClick={runStatus}
          >
            {pending?.confirm}
          </Button>
        </div>
      </Modal>
    </>
  )
}
