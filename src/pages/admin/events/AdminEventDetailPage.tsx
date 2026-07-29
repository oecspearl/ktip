import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { useEvent } from '../../../hooks/useEvents'
import { useEventStatusUpdate } from '../../../hooks/useAdminEvents'
import { useToast } from '../../../contexts/ToastContext'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
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
  Target,
  Map,
} from 'lucide-react'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
} from '../../../lib/constants'
import { format } from 'date-fns'
import { cn } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import type { EventStatus } from '../../../types'

import AdminEventRegistrationsTab from './AdminEventRegistrationsTab'
import AdminEventUpdatesTab from './AdminEventUpdatesTab'
import AdminEventArticlesTab from './AdminEventArticlesTab'
import AdminEventFormBuilderTab from './AdminEventFormBuilderTab'
import AdminEventPageBuilderTab from './AdminEventPageBuilderTab'
import AdminEventScheduleTab from './AdminEventScheduleTab'
import AdminEventSpeakersTab from './AdminEventSpeakersTab'
import AdminEventChallengeTab from './AdminEventChallengeTab'
import AdminEventVenueTab from './AdminEventVenueTab'

type TabId =
  | 'overview'
  | 'registrations'
  | 'form'
  | 'challenge'
  | 'venue'
  | 'pages'
  | 'schedule'
  | 'speakers'
  | 'updates'
  | 'articles'

export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [confirmAction, setConfirmAction] = useState<{
    status: EventStatus
  } | null>(null)

  const { event, loading: eventLoading, refetch } = useEvent(id)
  const { updateStatus, loading: statusLoading } = useEventStatusUpdate()

  const handleStatusChange = async () => {
    const action = confirmAction
    if (!action || !id) return

    try {
      await updateStatus(id, action.status)
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
    { id: 'challenge', label: 'Challenge', icon: Target },
    { id: 'venue', label: 'Venue', icon: Map },
    { id: 'pages', label: 'Pages', icon: LayoutList },
    { id: 'schedule', label: 'Schedule', icon: Clock },
    { id: 'speakers', label: 'Speakers', icon: Mic },
    { id: 'updates', label: 'Updates', icon: Megaphone },
    { id: 'articles', label: 'Articles', icon: FileText },
  ]

  if (eventLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ktip-ocean-500 border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-600">Loading event...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-700">Event not found</h2>
        <Link to="/admin/events" className="text-ktip-ocean-600 hover:underline mt-2 inline-block">
          Back to events
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Back link */}
      <Link
        to="/admin/events"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-ktip-ocean-600 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Events
      </Link>

      <PageHero
        inset
        compact
        eyebrow="Event Management"
        title={event.title}
        image={event.image_url}
        imageSeed={event.id}
        actions={
          <>
            <Link to={`/events/${event.id}/edit`}>
              <Button variant="outline" size="sm" icon={<Edit size={14} />}>
                Edit
              </Button>
            </Link>
            {event.status === 'draft' && (
              <Button
                size="sm"
                icon={<Send size={14} />}
                onClick={() => setConfirmAction({ status: 'published' })}
              >
                Publish
              </Button>
            )}
            {event.status === 'published' && (
              <>
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
              </>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Badge className={EVENT_STATUS_COLORS[event.status] || ''}>
              {EVENT_STATUS_LABELS[event.status] || event.status}
            </Badge>
            <Badge className={EVENT_TYPE_COLORS[event.event_type] || ''}>
              {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {format(new Date(event.start_date), 'MMM d, yyyy h:mm a')}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                {event.location}
              </span>
            )}
            {event.is_virtual && (
              <span className="flex items-center gap-1">
                <Globe size={14} />
                Virtual
              </span>
            )}
            {event.capacity && (
              <span className="flex items-center gap-1">
                <Users size={14} />
                Capacity: {event.capacity}
              </span>
            )}
          </div>
        </div>
      </PageHero>

      {/* Flat Tab Navigation */}
      <div className="relative border-b border-gray-200 mb-6" role="tablist" aria-label="Event management">
        <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                activeTab === tab.id
                  ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
              key={tab.id}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="animate-tab-enter border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Details</h3>
          {event.description ? (
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          ) : (
            <p className="text-gray-400 italic">No description provided</p>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Organizer</p>
              <p className="text-sm font-medium text-gray-900">{event.organizer?.display_name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Created</p>
              <p className="text-sm text-gray-700">{format(new Date(event.created_at), 'MMM d, yyyy')}</p>
            </div>
            {event.end_date && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">End Date</p>
                <p className="text-sm text-gray-700">{format(new Date(event.end_date), 'MMM d, yyyy h:mm a')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'registrations' && (
        <div className="animate-tab-enter">
          <AdminEventRegistrationsTab
            eventId={event.id}
            eventTitle={event.title}
            registrationFields={event.registration_fields || []}
          />
        </div>
      )}

      {activeTab === 'form' && (
        <div className="animate-tab-enter">
          <AdminEventFormBuilderTab eventId={event.id} />
        </div>
      )}

      {activeTab === 'venue' && (
        <div className="animate-tab-enter">
          <AdminEventVenueTab
            eventId={event.id}
            hasVenue={event.has_venue ?? false}
            venueFloorplanUrl={event.venue_floorplan_url ?? null}
            onEventChange={refetch}
          />
        </div>
      )}

      {activeTab === 'challenge' && (
        <div className="animate-tab-enter">
          <AdminEventChallengeTab
            eventId={event.id}
            hasChallenge={event.has_challenge ?? false}
            submissionDeadline={event.submission_deadline ?? null}
            onEventChange={refetch}
          />
        </div>
      )}

      {activeTab === 'pages' && (
        <div className="animate-tab-enter">
          <AdminEventPageBuilderTab eventId={event.id} />
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="animate-tab-enter">
          <AdminEventScheduleTab eventId={event.id} />
        </div>
      )}

      {activeTab === 'speakers' && (
        <div className="animate-tab-enter">
          <AdminEventSpeakersTab eventId={event.id} />
        </div>
      )}

      {activeTab === 'updates' && (
        <div className="animate-tab-enter">
          <AdminEventUpdatesTab eventId={event.id} />
        </div>
      )}

      {activeTab === 'articles' && (
        <div className="animate-tab-enter">
          <AdminEventArticlesTab eventId={event.id} />
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={
          confirmAction?.status === 'cancelled'
            ? 'Cancel Event'
            : confirmAction?.status === 'completed'
            ? 'Complete Event'
            : 'Publish Event'
        }
        message={
          confirmAction?.status === 'cancelled'
            ? `Are you sure you want to cancel "${event.title}"? This will be visible to all users.`
            : confirmAction?.status === 'completed'
            ? `Mark "${event.title}" as completed?`
            : `Publish "${event.title}"? It will become visible to all users.`
        }
        confirmLabel={
          confirmAction?.status === 'cancelled'
            ? 'Cancel Event'
            : confirmAction?.status === 'completed'
            ? 'Mark Complete'
            : 'Publish'
        }
        confirmVariant={confirmAction?.status === 'cancelled' ? 'danger' : 'primary'}
        loading={statusLoading}
        onConfirm={handleStatusChange}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  )
}
