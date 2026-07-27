import { createSignal, Show, Suspense } from 'solid-js'
import { useParams, A } from '@solidjs/router'
import { useEvent } from '../../../hooks/useEvents'
import { useEventStatusUpdate } from '../../../hooks/useAdminEvents'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Globe,
  Edit,
  Send,
  XCircle,
  CheckCircle,
  ClipboardList,
  Megaphone,
  FileText,
  LayoutDashboard,
  FormInput,
  LayoutList,
  Clock,
  Mic,
} from 'lucide-solid'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
} from '../../../lib/constants'
import { format } from 'date-fns'
import { cn } from '../../../lib/utils'
import type { EventStatus } from '../../../types'

import AdminEventRegistrationsTab from './AdminEventRegistrationsTab'
import AdminEventUpdatesTab from './AdminEventUpdatesTab'
import AdminEventArticlesTab from './AdminEventArticlesTab'
import AdminEventFormBuilderTab from './AdminEventFormBuilderTab'
import AdminEventPageBuilderTab from './AdminEventPageBuilderTab'
import AdminEventScheduleTab from './AdminEventScheduleTab'
import AdminEventSpeakersTab from './AdminEventSpeakersTab'

type TabId = 'overview' | 'registrations' | 'form' | 'pages' | 'schedule' | 'speakers' | 'updates' | 'articles'

function AdminEventDetailContent() {
  const params = useParams<{ id: string }>()
  const toast = useToast()
  const [activeTab, setActiveTab] = createSignal<TabId>('overview')
  const [confirmAction, setConfirmAction] = createSignal<{
    status: EventStatus
  } | null>(null)

  const { event, refetch } = useEvent(() => params.id)
  const { updateStatus, loading: statusLoading } = useEventStatusUpdate()

  const handleStatusChange = async () => {
    const action = confirmAction()
    if (!action || !params.id) return

    try {
      await updateStatus(params.id, action.status)
      toast.success(`Event ${EVENT_STATUS_LABELS[action.status].toLowerCase()} successfully`)
      setConfirmAction(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event status')
    }
  }

  const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'registrations', label: 'Registrations', icon: ClipboardList },
    { id: 'form', label: 'Reg. Form', icon: FormInput },
    { id: 'pages', label: 'Pages', icon: LayoutList },
    { id: 'schedule', label: 'Schedule', icon: Clock },
    { id: 'speakers', label: 'Speakers', icon: Mic },
    { id: 'updates', label: 'Updates', icon: Megaphone },
    { id: 'articles', label: 'Articles', icon: FileText },
  ]

  return (
    <>
      <Suspense
        fallback={
          <div class="flex items-center justify-center py-20">
            <div class="text-center">
              <div class="animate-spin rounded-full h-8 w-8 border-2 border-ktip-ocean-500 border-t-transparent mx-auto" />
              <p class="mt-4 text-gray-600">Loading event...</p>
            </div>
          </div>
        }
      >
        <Show
          when={event()}
          fallback={
            <div class="text-center py-20">
              <h2 class="text-xl font-semibold text-gray-700">Event not found</h2>
              <A href="/admin/events" class="text-ktip-ocean-600 hover:underline mt-2 inline-block">
                Back to events
              </A>
            </div>
          }
        >
          {(evt) => (
            <>
              {/* Back link */}
              <A
                href="/admin/events"
                class="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-ktip-ocean-600 mb-6 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Events
              </A>

              {/* Dark Header Band */}
              <div class="bg-gray-800 rounded-lg p-6 mb-6">
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div class="flex items-center gap-3 mb-2">
                      <h1 class="text-2xl font-bold font-display text-white">
                        {evt().title}
                      </h1>
                      <Badge class={EVENT_STATUS_COLORS[evt().status] || ''}>
                        {EVENT_STATUS_LABELS[evt().status] || evt().status}
                      </Badge>
                      <Badge class={EVENT_TYPE_COLORS[evt().event_type] || ''}>
                        {EVENT_TYPE_LABELS[evt().event_type] || evt().event_type}
                      </Badge>
                    </div>
                    <div class="flex items-center gap-4 text-sm text-gray-400">
                      <span class="flex items-center gap-1">
                        <Calendar size={14} />
                        {format(new Date(evt().start_date), 'MMM d, yyyy h:mm a')}
                      </span>
                      <Show when={evt().location}>
                        <span class="flex items-center gap-1">
                          <MapPin size={14} />
                          {evt().location}
                        </span>
                      </Show>
                      <Show when={evt().is_virtual}>
                        <span class="flex items-center gap-1">
                          <Globe size={14} />
                          Virtual
                        </span>
                      </Show>
                      <Show when={evt().capacity}>
                        <span class="flex items-center gap-1">
                          <Users size={14} />
                          Capacity: {evt().capacity}
                        </span>
                      </Show>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <A href={`/events/${evt().id}/edit`}>
                      <Button variant="outline" size="sm" icon={<Edit size={14} />}>
                        Edit
                      </Button>
                    </A>
                    <Show when={evt().status === 'draft'}>
                      <Button
                        size="sm"
                        icon={<Send size={14} />}
                        onClick={() => setConfirmAction({ status: 'published' })}
                      >
                        Publish
                      </Button>
                    </Show>
                    <Show when={evt().status === 'published'}>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<XCircle size={14} />}
                        onClick={() => setConfirmAction({ status: 'cancelled' })}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CheckCircle size={14} />}
                        onClick={() => setConfirmAction({ status: 'completed' })}
                      >
                        Complete
                      </Button>
                    </Show>
                  </div>
                </div>
              </div>

              {/* Flat Tab Navigation */}
              <div class="relative border-b border-gray-200 mb-6" role="tablist" aria-label="Event management">
                <nav class="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
                  {tabs.map((tab) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab() === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      class={cn(
                        'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                        activeTab() === tab.id
                          ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      )}
                    >
                      <tab.icon size={16} />
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <Show when={activeTab() === 'overview'}>
                <div class="animate-tab-enter border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">Event Details</h3>
                  <Show when={evt().description}>
                    <div class="prose prose-sm max-w-none">
                      <p class="text-gray-700 whitespace-pre-wrap">{evt().description}</p>
                    </div>
                  </Show>
                  <Show when={!evt().description}>
                    <p class="text-gray-400 italic">No description provided</p>
                  </Show>

                  <div class="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Organizer</p>
                      <p class="text-sm font-medium text-gray-900">{evt().organizer?.display_name || 'Unknown'}</p>
                    </div>
                    <div>
                      <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Created</p>
                      <p class="text-sm text-gray-700">{format(new Date(evt().created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <Show when={evt().end_date}>
                      <div>
                        <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">End Date</p>
                        <p class="text-sm text-gray-700">{format(new Date(evt().end_date!), 'MMM d, yyyy h:mm a')}</p>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>

              <Show when={activeTab() === 'registrations'}>
                <div class="animate-tab-enter">
                  <AdminEventRegistrationsTab
                    eventId={params.id}
                    eventTitle={evt().title}
                    registrationFields={evt().registration_fields || []}
                  />
                </div>
              </Show>

              <Show when={activeTab() === 'form'}>
                <div class="animate-tab-enter">
                  <AdminEventFormBuilderTab eventId={params.id} />
                </div>
              </Show>

              <Show when={activeTab() === 'pages'}>
                <div class="animate-tab-enter">
                  <AdminEventPageBuilderTab eventId={params.id} />
                </div>
              </Show>

              <Show when={activeTab() === 'schedule'}>
                <div class="animate-tab-enter">
                  <AdminEventScheduleTab eventId={params.id} />
                </div>
              </Show>

              <Show when={activeTab() === 'speakers'}>
                <div class="animate-tab-enter">
                  <AdminEventSpeakersTab eventId={params.id} />
                </div>
              </Show>

              <Show when={activeTab() === 'updates'}>
                <div class="animate-tab-enter">
                  <AdminEventUpdatesTab eventId={params.id} />
                </div>
              </Show>

              <Show when={activeTab() === 'articles'}>
                <div class="animate-tab-enter">
                  <AdminEventArticlesTab eventId={params.id} />
                </div>
              </Show>

              {/* Confirm Modal */}
              <ConfirmModal
                open={!!confirmAction()}
                title={
                  confirmAction()?.status === 'cancelled'
                    ? 'Cancel Event'
                    : confirmAction()?.status === 'completed'
                    ? 'Complete Event'
                    : 'Publish Event'
                }
                message={
                  confirmAction()?.status === 'cancelled'
                    ? `Are you sure you want to cancel "${evt().title}"? This will be visible to all users.`
                    : confirmAction()?.status === 'completed'
                    ? `Mark "${evt().title}" as completed?`
                    : `Publish "${evt().title}"? It will become visible to all users.`
                }
                confirmLabel={
                  confirmAction()?.status === 'cancelled'
                    ? 'Cancel Event'
                    : confirmAction()?.status === 'completed'
                    ? 'Mark Complete'
                    : 'Publish'
                }
                confirmVariant={confirmAction()?.status === 'cancelled' ? 'danger' : 'primary'}
                loading={statusLoading()}
                onConfirm={handleStatusChange}
                onCancel={() => setConfirmAction(null)}
              />
            </>
          )}
        </Show>
      </Suspense>
    </>
  )
}

export default function AdminEventDetailPage() {
  return (
    <AdminLayout>
      <AdminEventDetailContent />
    </AdminLayout>
  )
}
