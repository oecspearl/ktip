import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAdminEventCounts, useAdminEvents } from '../../../hooks/useAdminEvents'
import { fetchRsvpCounts, useBulkDeleteEvents, useBulkSetEventStatus } from '../../../hooks/useEvents'
import { useSetContentStatus, type ContentModerationStatus } from '../../../hooks/useAdminContentStatus'
import { useSelection } from '../../../hooks/useSelection'
import type { Measured } from '../../../lib/measured'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { BulkActionBar } from '../../../components/shared/BulkActionBar'
import { BulkDeleteDialog } from '../../../components/shared/BulkDeleteDialog'
import { ModerationReasonModal, type ModerationTarget } from '../../../components/admin/ModerationReasonModal'
import { ModerationStatusBadge } from '../../../components/admin/ModerationStatusBadge'
import { describeEventDeletion, type BulkDeleteItem } from '../../../lib/delete-guard'
import {
  Ban,
  Calendar,
  CheckSquare,
  Plus,
  RotateCcw,
  Search,
  Eye,
  Send,
  Trash2,
  XCircle,
  CheckCircle,
  FileText,
  Users,
} from 'lucide-react'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
} from '../../../lib/constants'
import { format } from 'date-fns'
import { debounce } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import type { Event, EventStatus } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

type LifecycleAction = Extract<EventStatus, 'published' | 'cancelled' | 'completed'>

/** Which lifecycle moves a row can take, matching the per-row buttons. */
const ELIGIBLE: Record<LifecycleAction, EventStatus> = {
  published: 'draft',
  cancelled: 'published',
  completed: 'published',
}

const moderationOf = (event: Event): ContentModerationStatus => event.moderation_status ?? 'active'

export default function AdminEventsPage() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [moderationFilter, setModerationFilter] = useState<'' | ContentModerationStatus>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])
  const [confirmAction, setConfirmAction] = useState<{
    ids: string[]
    status: LifecycleAction
    title: string
  } | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [deleteItems, setDeleteItems] = useState<BulkDeleteItem[] | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteRun = useRef(0)
  const [moderation, setModeration] = useState<{ mode: 'suspend' | 'restore'; items: ModerationTarget[] } | null>(
    null
  )

  const { events: allEvents, loading, refetch } = useAdminEvents({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    search: debouncedSearch || undefined,
  })

  const events = useMemo(
    () => (allEvents ?? []).filter((e) => !moderationFilter || moderationOf(e) === moderationFilter),
    [allEvents, moderationFilter]
  )
  const eventIds = useMemo(() => events.map((e) => e.id), [events])
  const selection = useSelection(eventIds)
  const chosen = () => events.filter((e) => selection.isSelected(e.id))

  const { setStatus: setLifecycle, loading: statusLoading } = useBulkSetEventStatus()
  const { deleteEvents } = useBulkDeleteEvents()
  const { setStatus: setModerationStatus } = useSetContentStatus('event')

  // Real head counts, not the length of the filtered page (see
  // useAdminEventCounts). A count that could not be read shows an em dash.
  const { counts } = useAdminEventCounts()
  const stats = useMemo(() => {
    const show = (m: Measured | undefined) => (m?.state === 'ok' ? m.value.toLocaleString() : '—')
    return {
      total: show(counts?.total),
      upcoming: show(counts?.upcoming),
      drafts: show(counts?.drafts),
      published: show(counts?.published),
    }
  }, [counts])

  const stopSelecting = () => {
    setSelecting(false)
    selection.clear()
  }

  const handleStatusChange = async () => {
    const action = confirmAction
    if (!action) return

    try {
      const result = await setLifecycle(action.ids, action.status)
      if (result.failed.length === 0) {
        toast.success(
          action.ids.length === 1
            ? `Event ${EVENT_STATUS_LABELS[action.status].toLowerCase()} successfully`
            : t`${result.done.length} events changed`
        )
      } else {
        toast.warning(t`${result.done.length} of ${action.ids.length} changed. ${result.failed[0].message}`)
      }
      setConfirmAction(null)
      selection.clear()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event status')
    }
  }

  const askLifecycle = (status: LifecycleAction, rows: Event[]) => {
    const eligible = rows.filter((e) => e.status === ELIGIBLE[status])
    if (eligible.length === 0) {
      toast.info(
        status === 'published'
          ? t`Only drafts can be published.`
          : t`Only published events can be cancelled or marked complete.`
      )
      return
    }
    setConfirmAction({
      ids: eligible.map((e) => e.id),
      status,
      title: eligible.length === 1 ? eligible[0].title : plural(eligible.length, { one: '# event', other: '# events' }),
    })
  }

  const openDelete = async (rows: Event[]) => {
    if (rows.length === 0) return
    const run = ++deleteRun.current
    setDeleteItems(null)
    setDeleteOpen(true)

    let rsvps: Map<string, number> | null = null
    try {
      rsvps = await fetchRsvpCounts(rows.map((e) => e.id))
    } catch {
      rsvps = null
    }
    if (run !== deleteRun.current) return

    setDeleteItems(
      rows.map((e) => ({
        id: e.id,
        title: e.title,
        impact: describeEventDeletion({
          status: e.status,
          rsvpCount: rsvps ? (rsvps.get(e.id) ?? 0) : null,
          hasVenue: !!e.has_venue,
          hasChallenge: !!e.has_challenge,
        }),
      }))
    )
  }

  const closeDelete = () => {
    deleteRun.current++
    setDeleteOpen(false)
  }

  const openModeration = (mode: 'suspend' | 'restore', rows: Event[]) => {
    const items = rows
      .filter((e) => (mode === 'suspend' ? moderationOf(e) === 'active' : moderationOf(e) !== 'active'))
      .map((e) => ({ id: e.id, title: e.title }))
    if (items.length === 0) {
      toast.info(mode === 'suspend' ? t`Those events are already suspended.` : t`Those events are already active.`)
      return
    }
    setModeration({ mode, items })
  }

  const getStatusActionLabel = (status: EventStatus) => {
    switch (status) {
      case 'published': return 'Publish'
      case 'cancelled': return 'Cancel Event'
      case 'completed': return 'Mark Complete'
      default: return 'Update'
    }
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Events Management"
        subtitle="Manage all events, registrations, and content"
        imageSeed="admin-events"
      />

      {/* Flat Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="border border-ktip-sand-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
              <Calendar size={20} className="text-ktip-ocean-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Events</p>
            </div>
          </div>
        </div>
        <div className="border border-ktip-sand-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
              <Send size={20} className="text-ktip-tropical-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.published}</p>
              <p className="text-xs text-gray-500">Published</p>
            </div>
          </div>
        </div>
        <div className="border border-ktip-sand-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ktip-sun-100 flex items-center justify-center">
              <FileText size={20} className="text-ktip-sun-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.drafts}</p>
              <p className="text-xs text-gray-500">Drafts</p>
            </div>
          </div>
        </div>
        <div className="border border-ktip-sand-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
              <Users size={20} className="text-ktip-ocean-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.upcoming}</p>
              <p className="text-xs text-gray-500">Upcoming</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Filter Bar */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
              className="w-full pl-9 pr-4 py-2 bg-ktip-cream neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-hidden"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            className="px-3 py-2 bg-ktip-cream neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-hidden"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={moderationFilter}
            onChange={(e) => setModerationFilter(e.currentTarget.value as '' | ContentModerationStatus)}
            aria-label={t`Filter by moderation status`}
            className="px-3 py-2 bg-ktip-cream neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-hidden"
          >
            <option value="">{t`Any moderation`}</option>
            <option value="active">{t`Active`}</option>
            <option value="quarantined">{t`Suspended`}</option>
            <option value="removed">{t`Removed`}</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.currentTarget.value)}
            className="px-3 py-2 bg-ktip-cream neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-hidden"
          >
            <option value="">All Types</option>
            <option value="hackathon">Hackathon</option>
            <option value="workshop">Workshop</option>
            <option value="meetup">Meetup</option>
            <option value="conference">Conference</option>
            <option value="demo_day">Demo Day</option>
            <option value="challenge">Challenge</option>
          </select>
          {(statusFilter || typeFilter || moderationFilter || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('')
                setTypeFilter('')
                setModerationFilter('')
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
            >
              Clear all
            </button>
          )}
          <div className="sm:ml-auto flex shrink-0 items-center gap-2">
            {!selecting && (
              <Button variant="secondary" size="sm" icon={<CheckSquare size={16} />} onClick={() => setSelecting(true)}>
                <Trans>Select</Trans>
              </Button>
            )}
            <Link to="/events/new" className="shrink-0">
              <Button size="sm" icon={<Plus size={16} />}>
                Create Event
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {selecting && (
        <BulkActionBar
          count={selection.count}
          total={events.length}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onDone={stopSelecting}
        >
          <Button variant="secondary" size="sm" icon={<Send size={16} />} disabled={!selection.count} onClick={() => askLifecycle('published', chosen())}>
            <Trans>Publish</Trans>
          </Button>
          <Button variant="secondary" size="sm" icon={<XCircle size={16} />} disabled={!selection.count} onClick={() => askLifecycle('cancelled', chosen())}>
            <Trans>Cancel</Trans>
          </Button>
          <Button variant="secondary" size="sm" icon={<CheckCircle size={16} />} disabled={!selection.count} onClick={() => askLifecycle('completed', chosen())}>
            <Trans>Mark complete</Trans>
          </Button>
          <Button variant="secondary" size="sm" icon={<Ban size={16} />} disabled={!selection.count} onClick={() => openModeration('suspend', chosen())}>
            <Trans>Suspend</Trans>
          </Button>
          <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} disabled={!selection.count} onClick={() => openModeration('restore', chosen())}>
            <Trans>Restore</Trans>
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!selection.count} onClick={() => openDelete(chosen())}>
            <Trans>Delete</Trans>
          </Button>
        </BulkActionBar>
      )}

      {/* Events Table */}
      <div className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            Loading events...
          </div>
        ) : !events.length ? (
          <div className="p-12 text-center">
            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No events found</h3>
            <p className="text-gray-500 text-sm">
              {statusFilter || typeFilter || moderationFilter || searchQuery
                ? 'Try adjusting your filters'
                : 'Create your first event to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scroll-cue-x">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ktip-sand-200">
                  {selecting && (
                    <th className="w-10 px-4 py-3">
                      <span className="sr-only">{t`Select`}</span>
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t`Moderation`}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ktip-sand-200 stagger-rows">
                {events.map((event) => {
                  const moderationStatus = moderationOf(event)
                  return (
                  <tr className="hover:bg-ktip-sand-50 transition-colors" key={event.id}>
                    {selecting && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(event.id)}
                          onChange={() => selection.toggle(event.id)}
                          aria-label={t`Select ${event.title}`}
                          className="w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <Link
                            to={`/admin/events/${event.id}`}
                            className="font-medium text-gray-900 hover:text-ktip-ocean-600 transition-colors"
                          >
                            {event.title}
                          </Link>
                          <p className="text-xs text-gray-500 mt-0.5">
                            by {event.organizer?.display_name || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        size="sm"
                        className={EVENT_STATUS_COLORS[event.status] || ''}
                      >
                        {EVENT_STATUS_LABELS[event.status] || event.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ModerationStatusBadge status={moderationStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        size="sm"
                        className={EVENT_TYPE_COLORS[event.event_type] || ''}
                      >
                        {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {format(new Date(event.start_date), 'MMM d, yyyy')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/events/${event.id}`)}
                          className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                        {event.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => askLifecycle('published', [event])}
                            className="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                            title="Publish"
                          >
                            <Send size={16} />
                          </button>
                        )}
                        {event.status === 'published' && (
                          <>
                            <button
                              type="button"
                              onClick={() => askLifecycle('cancelled', [event])}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              title="Cancel event"
                            >
                              <XCircle size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => askLifecycle('completed', [event])}
                              className="p-1.5 text-gray-400 hover:text-ktip-tropical-700 transition-colors"
                              title="Mark complete"
                            >
                              <CheckCircle size={16} />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openModeration(moderationStatus === 'active' ? 'suspend' : 'restore', [event])}
                          className="p-1.5 text-gray-400 hover:text-ktip-sun-700 transition-colors"
                          title={moderationStatus === 'active' ? t`Suspend event` : t`Restore event`}
                          aria-label={moderationStatus === 'active' ? t`Suspend ${event.title}` : t`Restore ${event.title}`}
                        >
                          {moderationStatus === 'active' ? <Ban size={16} /> : <RotateCcw size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete([event])}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          title={t`Delete event`}
                          aria-label={t`Delete ${event.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.status === 'cancelled' ? 'Cancel Event' : `${getStatusActionLabel(confirmAction?.status || 'published')} Event`}
        message={
          confirmAction?.status === 'cancelled'
            ? `Are you sure you want to cancel "${confirmAction?.title}"? This action will be visible to all users.`
            : `Are you sure you want to ${getStatusActionLabel(confirmAction?.status || 'published').toLowerCase()} "${confirmAction?.title}"?`
        }
        confirmLabel={getStatusActionLabel(confirmAction?.status || 'published')}
        confirmVariant={confirmAction?.status === 'cancelled' ? 'danger' : 'primary'}
        loading={statusLoading}
        onConfirm={handleStatusChange}
        onCancel={() => setConfirmAction(null)}
      />

      <ModerationReasonModal
        open={!!moderation}
        mode={moderation?.mode ?? 'suspend'}
        label={plural(moderation?.items.length ?? 0, { one: '# event', other: '# events' })}
        items={moderation?.items ?? []}
        onClose={() => setModeration(null)}
        onRun={(ids, reason, onProgress) =>
          setModerationStatus(ids, moderation?.mode === 'restore' ? 'active' : 'quarantined', reason, onProgress)
        }
        onDone={() => {
          selection.clear()
          refetch()
        }}
      />

      <BulkDeleteDialog
        open={deleteOpen}
        kind="event"
        items={deleteItems}
        onClose={closeDelete}
        onDelete={deleteEvents}
        onDeleted={() => {
          selection.clear()
          refetch()
        }}
      />
    </>
  )
}
