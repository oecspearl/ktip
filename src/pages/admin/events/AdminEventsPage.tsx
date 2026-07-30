import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAdminEvents, useEventStatusUpdate } from '../../../hooks/useAdminEvents'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import {
  Calendar,
  Plus,
  Search,
  Eye,
  Send,
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
import { format, isPast } from 'date-fns'
import { debounce } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import type { EventStatus } from '../../../types'

export default function AdminEventsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])
  const [confirmAction, setConfirmAction] = useState<{
    eventId: string
    status: EventStatus
    title: string
  } | null>(null)

  const { events, loading, refetch } = useAdminEvents({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    search: debouncedSearch || undefined,
  })

  const { updateStatus, loading: statusLoading } = useEventStatusUpdate()

  const stats = useMemo(() => {
    const list = events || []
    return {
      total: list.length,
      upcoming: list.filter(e => !isPast(new Date(e.start_date))).length,
      drafts: list.filter(e => e.status === 'draft').length,
      published: list.filter(e => e.status === 'published').length,
    }
  }, [events])

  const handleStatusChange = async () => {
    const action = confirmAction
    if (!action) return

    try {
      await updateStatus(action.eventId, action.status)
      toast.success(`Event ${EVENT_STATUS_LABELS[action.status].toLowerCase()} successfully`)
      setConfirmAction(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event status')
    }
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
              className="w-full pl-9 pr-4 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            className="px-3 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.currentTarget.value)}
            className="px-3 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="hackathon">Hackathon</option>
            <option value="workshop">Workshop</option>
            <option value="meetup">Meetup</option>
            <option value="conference">Conference</option>
            <option value="demo_day">Demo Day</option>
          </select>
          {(statusFilter || typeFilter || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('')
                setTypeFilter('')
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
            >
              Clear all
            </button>
          )}
          <Link to="/events/new" className="sm:ml-auto shrink-0">
            <Button size="sm" icon={<Plus size={16} />}>
              Create Event
            </Button>
          </Link>
        </div>
      </div>

      {/* Events Table */}
      <div className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            Loading events...
          </div>
        ) : !events?.length ? (
          <div className="p-12 text-center">
            <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No events found</h3>
            <p className="text-gray-500 text-sm">
              {statusFilter || typeFilter || searchQuery
                ? 'Try adjusting your filters'
                : 'Create your first event to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ktip-sand-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ktip-sand-200 stagger-rows">
                {events.map((event) => (
                  <tr className="hover:bg-ktip-sand-50 transition-colors" key={event.id}>
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
                            onClick={() => setConfirmAction({ eventId: event.id, status: 'published', title: event.title })}
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
                              onClick={() => setConfirmAction({ eventId: event.id, status: 'cancelled', title: event.title })}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              title="Cancel event"
                            >
                              <XCircle size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ eventId: event.id, status: 'completed', title: event.title })}
                              className="p-1.5 text-gray-400 hover:text-ktip-tropical-700 transition-colors"
                              title="Mark complete"
                            >
                              <CheckCircle size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
    </>
  )
}
