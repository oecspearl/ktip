import { useState } from 'react'
import { useParams, Link, useLocation, useSearchParams } from 'react-router'
import { useEvent, useIsEventHost } from '../../../hooks/useEvents'
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
  ArrowRight,
  Check,
  ExternalLink,
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
import { Stepper } from '../../../components/ui/Stepper'
import { blueprintFor, setupSteps } from '../../../lib/event-blueprints'
import { entityPath } from '../../../lib/slug'
import { venuePath } from '../../../lib/event-slug'
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
import { EventDetailsForm } from '../../../components/events/EventDetailsForm'

type TabId =
  | 'overview'
  | 'details'
  | 'registrations'
  | 'form'
  | 'challenge'
  | 'venue'
  | 'pages'
  | 'schedule'
  | 'speakers'
  | 'updates'
  | 'articles'

/**
 * The event management workspace, and the only place an event is set up.
 *
 * Mounted twice: at /admin/events/:id inside the admin console, and at
 * /events/:id/manage for the event's own organizer — running an event is the
 * organizer's job, not an admin privilege. The host gate below (and RLS on
 * every table the tabs write) is the control; the admin route is just one of
 * two doors.
 *
 * Setting an event up used to be two standalone pages that mounted these same
 * tabs a second time, then handed you here. They are gone: `?setup=1` draws a
 * stepper over the tab strip and walks the host through the tabs their event
 * type needs. Same page, same editors, no seam between building an event and
 * running it.
 */
export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const toast = useToast()
  const location = useLocation()
  const inAdminConsole = location.pathname.startsWith('/admin')
  // The tab lives in the URL so a link can open one — which is what setup now
  // is, and what "Back to the venue" from anywhere else needs.
  const [searchParams, setSearchParams] = useSearchParams()
  const [confirmAction, setConfirmAction] = useState<{
    status: EventStatus
  } | null>(null)

  const { event, loading: eventLoading, refetch } = useEvent(id)
  const isHost = useIsEventHost(event)
  const { updateStatus, loading: statusLoading } = useEventStatusUpdate()

  const handleStatusChange = async () => {
    const action = confirmAction
    if (!action || !id) return

    try {
      await updateStatus(id, action.status)
      toast.success(`Event ${EVENT_STATUS_LABELS[action.status].toLowerCase()} successfully`)
      setConfirmAction(null)
      refetch()
      // Publishing is the last step's save, so a successful one ends the run
      // rather than leaving the stepper up over a finished event.
      if (searchParams.get('setup') === '1' && action.status === 'published') {
        const next = new URLSearchParams(searchParams)
        next.delete('setup')
        setSearchParams(next, { replace: true })
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event status')
    }
  }

  const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'details', label: 'Details', icon: Edit },
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

  const tabParam = searchParams.get('tab')
  const activeTab: TabId = tabs.some((tab) => tab.id === tabParam)
    ? (tabParam as TabId)
    : 'overview'

  // replace, not push: a run through the setup steps should leave one entry in
  // the history, not one per tab the host looked at.
  const setActiveTab = (tab: TabId, opts: { setup?: boolean } = {}) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    if (opts.setup === false) next.delete('setup')
    setSearchParams(next, { replace: true })
  }

  const inSetup = searchParams.get('setup') === '1'
  const blueprint = blueprintFor(event?.event_type)
  const steps = setupSteps(event?.event_type)
  // -1 while the host is on a tab outside the run (registrations, say). The
  // stepper then shows the whole run as still ahead rather than claiming a
  // step it is not on.
  const stepIndex = steps.findIndex((step) => step.tab === activeTab)
  const nextStep = stepIndex >= 0 ? steps[stepIndex + 1] : undefined
  const showSetup = inSetup && steps.length > 1
  // The admin console has its own chrome to sit inside, so the setup band is
  // only worn on the organizer's door.
  const setupShell = showSetup && !inAdminConsole
  // The run's last stop. Overview's summary card is every field the host has
  // just filled in read back at them, so on this step it gives way to the one
  // thing they actually want here: the event as everyone else sees it.
  const onPreviewStep = showSetup && stepIndex === steps.length - 1

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

  // The organizer or a platform admin. RLS enforces the same thing on every
  // write; this gate keeps a curious member from reading the console shell.
  if (!isHost) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-700">
          Only the organizer can manage this event
        </h2>
        <Link
          to={`/events/${event.slug || event.id}`}
          className="text-ktip-ocean-600 hover:underline mt-2 inline-block"
        >
          Back to the event
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Setting up wears the shell the standalone setup pages had: the
          full-bleed band, the step's own name as the title and the blueprint's
          blurb under it. Same page and same tabs as always underneath — only
          the chrome says "you are being walked through this". */}
      {setupShell && (
        <PageHero
          compact
          eyebrow="Set up your event"
          title={steps[stepIndex]?.label ?? event.title}
          subtitle={blueprint.setup?.blurb}
          imageSeed="events"
          breadcrumb={[
            { label: 'Home', href: '/' },
            { label: 'Events', href: '/events' },
            { label: event.title, href: entityPath('event', event) },
            { label: 'Set up' },
          ]}
        />
      )}

      <div
        className={cn(
          !inAdminConsole && 'mx-auto max-w-7xl px-4 pb-12',
          !inAdminConsole && (setupShell ? 'pt-12' : 'pt-[calc(var(--nav-h)+2rem)]')
        )}
      >
      {/* Back link */}
      {!setupShell && (
        <Link
          to={inAdminConsole ? '/admin/events' : '/events'}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-ktip-ocean-600 mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Events
        </Link>
      )}

      {!setupShell && (
      <PageHero
        inset
        compact
        eyebrow="Event Management"
        title={event.title}
        image={event.image_url}
        imageSeed={event.id}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Edit size={14} />}
              onClick={() => setActiveTab('details')}
            >
              Edit
            </Button>
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
      )}

      {/* One row of navigation, not two. The run is a step per tab this event
          type needs, so the stepper replaces the tab strip for its duration
          rather than sitting on top of it saying a coarser version of the same
          thing. "Skip setup" below puts the full strip back. */}
      {showSetup ? (
        <Stepper
          steps={steps.map((step) => step.label)}
          currentStep={stepIndex}
          onStepClick={(i) => {
            const tab = steps[i].tab
            if (tab) setActiveTab(tab as TabId)
          }}
          className="mb-8"
        />
      ) : (
        /* Flat Tab Navigation */
        <div className="relative border-b border-ktip-sand-200 mb-6" role="tablist" aria-label="Event management">
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
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-ktip-sand-300'
                )}
                key={tab.id}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && onPreviewStep && (
        <div className="animate-tab-enter">
          {/* ?from=setup so the event page knows to offer the way back — it is
              the one stop on this run that is not the console. */}
          <Link to={`${entityPath('event', event)}?from=setup`} className="block">
            <Button fullWidth variant="secondary" icon={<ExternalLink size={18} />}>
              View the event
            </Button>
          </Link>
        </div>
      )}

      {activeTab === 'overview' && !onPreviewStep && (
        <div className="animate-tab-enter border border-ktip-sand-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Details</h3>
          {event.description ? (
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          ) : (
            <p className="text-gray-400 italic">No description provided</p>
          )}

          <div className="mt-6 pt-6 border-t border-ktip-sand-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {activeTab === 'details' && (
        <div className="animate-tab-enter border border-ktip-sand-200 rounded-lg p-6">
          <EventDetailsForm eventId={event.id} onSaved={refetch} />
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
            eventTitle={event.title}
            eventType={event.event_type}
            hasVenue={event.has_venue ?? false}
            spectatorsEnabled={event.spectators_enabled ?? false}
            venueFloorplanUrl={event.venue_floorplan_url ?? null}
            venueMap={event.venue_map ?? null}
            venueHref={venuePath(event)}
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

      {/* Each tab saves its own editor, so every step but the last is only
          ever "take me to the next thing". The last one is where the run ends
          and needs something final to press: publishing is the save a draft is
          waiting for, and an already-published event just closes the run. */}
      {showSetup && (
        <div className="mt-10 flex items-center gap-4">
          <Button
            fullWidth
            icon={nextStep ? <ArrowRight size={20} /> : <Check size={20} />}
            onClick={() => {
              if (nextStep) return setActiveTab(nextStep.tab as TabId)
              if (event.status === 'draft') return setConfirmAction({ status: 'published' })
              setActiveTab('overview', { setup: false })
            }}
          >
            {nextStep
              ? `Next: ${nextStep.label}`
              : event.status === 'draft'
                ? 'Save & publish'
                : 'Save & finish'}
          </Button>
          {/* No escape offered on the last step: "View the event" sits in the
              panel above, and the only thing left to do is end the run. */}
          {nextStep && (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab, { setup: false })}
              className="whitespace-nowrap text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700"
            >
              Skip setup
            </button>
          )}
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
      </div>
    </>
  )
}
