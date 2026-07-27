import { createSignal, Show, For, Suspense, createMemo } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import { useAdminEvents, useEventStatusUpdate } from '../../../hooks/useAdminEvents'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { AdminLayout } from '../../../components/layout/AdminLayout'
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
} from 'lucide-solid'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
} from '../../../lib/constants'
import { format, isPast } from 'date-fns'
import { debounce } from '../../../lib/utils'
import type { EventStatus } from '../../../types'

function AdminEventsContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = createSignal('')
  const [typeFilter, setTypeFilter] = createSignal('')
  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)
  const [confirmAction, setConfirmAction] = createSignal<{
    eventId: string
    status: EventStatus
    title: string
  } | null>(null)

  const { events, refetch } = useAdminEvents({
    get status() { return statusFilter() || undefined },
    get type() { return typeFilter() || undefined },
    get search() { return debouncedSearch() || undefined },
  })

  const { updateStatus, loading: statusLoading } = useEventStatusUpdate()

  const stats = createMemo(() => {
    const list = events() || []
    return {
      total: list.length,
      upcoming: list.filter(e => !isPast(new Date(e.start_date))).length,
      drafts: list.filter(e => e.status === 'draft').length,
      published: list.filter(e => e.status === 'published').length,
    }
  })

  const handleStatusChange = async () => {
    const action = confirmAction()
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
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p class="text-gray-400 text-xs uppercase tracking-widest mb-1">Administration</p>
            <h1 class="text-2xl font-bold text-white">
              Events Management
            </h1>
            <p class="mt-1 text-gray-400 text-sm">
              Manage all events, registrations, and content
            </p>
          </div>
          <A href="/events/new">
            <Button size="sm" icon={<Plus size={16} />}>
              Create Event
            </Button>
          </A>
        </div>
      </div>

      {/* Flat Stat Cards */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="border border-gray-200 p-4 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
              <Calendar size={20} class="text-ktip-ocean-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{stats().total}</p>
              <p class="text-xs text-gray-500">Total Events</p>
            </div>
          </div>
        </div>
        <div class="border border-gray-200 p-4 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
              <Send size={20} class="text-ktip-tropical-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{stats().published}</p>
              <p class="text-xs text-gray-500">Published</p>
            </div>
          </div>
        </div>
        <div class="border border-gray-200 p-4 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <FileText size={20} class="text-yellow-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{stats().drafts}</p>
              <p class="text-xs text-gray-500">Drafts</p>
            </div>
          </div>
        </div>
        <div class="border border-gray-200 p-4 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users size={20} class="text-purple-600" />
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{stats().upcoming}</p>
              <p class="text-xs text-gray-500">Upcoming</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Filter Bar */}
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery()}
              onInput={(e) => { setSearchQuery(e.currentTarget.value); debouncedSetSearch(e.currentTarget.value) }}
              class="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={typeFilter()}
            onChange={(e) => setTypeFilter(e.currentTarget.value)}
            class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="hackathon">Hackathon</option>
            <option value="workshop">Workshop</option>
            <option value="meetup">Meetup</option>
            <option value="conference">Conference</option>
            <option value="demo_day">Demo Day</option>
          </select>
          <Show when={statusFilter() || typeFilter() || searchQuery()}>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('')
                setTypeFilter('')
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
            >
              Clear all
            </button>
          </Show>
        </div>
      </div>

      {/* Events Table */}
      <div class="overflow-hidden">
        <Suspense
          fallback={
            <div class="p-12 text-center text-gray-500">
              Loading events...
            </div>
          }
        >
          <Show
            when={events()?.length}
            fallback={
              <div class="p-12 text-center">
                <Calendar size={48} class="mx-auto text-gray-300 mb-4" />
                <h3 class="text-lg font-semibold text-gray-700 mb-1">No events found</h3>
                <p class="text-gray-500 text-sm">
                  {statusFilter() || typeFilter() || searchQuery()
                    ? 'Try adjusting your filters'
                    : 'Create your first event to get started'}
                </p>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Event</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <For each={events()}>
                    {(event) => (
                      <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-3">
                            <div>
                              <A
                                href={`/admin/events/${event.id}`}
                                class="font-medium text-gray-900 hover:text-ktip-ocean-600 transition-colors"
                              >
                                {event.title}
                              </A>
                              <p class="text-xs text-gray-500 mt-0.5">
                                by {event.organizer?.display_name || 'Unknown'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td class="px-4 py-3">
                          <Badge
                            size="sm"
                            class={EVENT_STATUS_COLORS[event.status] || ''}
                          >
                            {EVENT_STATUS_LABELS[event.status] || event.status}
                          </Badge>
                        </td>
                        <td class="px-4 py-3">
                          <Badge
                            size="sm"
                            class={EVENT_TYPE_COLORS[event.event_type] || ''}
                          >
                            {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                          </Badge>
                        </td>
                        <td class="px-4 py-3">
                          <span class="text-sm text-gray-700">
                            {format(new Date(event.start_date), 'MMM d, yyyy')}
                          </span>
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/events/${event.id}`)}
                              class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                              title="View details"
                            >
                              <Eye size={16} />
                            </button>
                            <Show when={event.status === 'draft'}>
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ eventId: event.id, status: 'published', title: event.title })}
                                class="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                                title="Publish"
                              >
                                <Send size={16} />
                              </button>
                            </Show>
                            <Show when={event.status === 'published'}>
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ eventId: event.id, status: 'cancelled', title: event.title })}
                                class="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                title="Cancel event"
                              >
                                <XCircle size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ eventId: event.id, status: 'completed', title: event.title })}
                                class="p-1.5 text-gray-400 hover:text-green-600 transition-colors"
                                title="Mark complete"
                              >
                                <CheckCircle size={16} />
                              </button>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Suspense>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        open={!!confirmAction()}
        title={confirmAction()?.status === 'cancelled' ? 'Cancel Event' : `${getStatusActionLabel(confirmAction()?.status || 'published')} Event`}
        message={
          confirmAction()?.status === 'cancelled'
            ? `Are you sure you want to cancel "${confirmAction()?.title}"? This action will be visible to all users.`
            : `Are you sure you want to ${getStatusActionLabel(confirmAction()?.status || 'published').toLowerCase()} "${confirmAction()?.title}"?`
        }
        confirmLabel={getStatusActionLabel(confirmAction()?.status || 'published')}
        confirmVariant={confirmAction()?.status === 'cancelled' ? 'danger' : 'primary'}
        loading={statusLoading()}
        onConfirm={handleStatusChange}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  )
}

export default function AdminEventsPage() {
  return (
    <AdminLayout>
      <AdminEventsContent />
    </AdminLayout>
  )
}
