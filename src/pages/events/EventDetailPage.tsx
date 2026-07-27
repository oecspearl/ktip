import { Show, For, Suspense, createSignal, createEffect, on } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useEvent, useRSVP } from '../../hooks/useEvents'
import { useSubmitRegistration } from '../../hooks/useEventRegistrationForm'
import { usePublishedEventUpdates } from '../../hooks/useEventUpdates'
import { usePublishedEventArticles } from '../../hooks/useEventArticles'
import { usePublicEventSections } from '../../hooks/useEventPageSections'
import { useEventSchedule } from '../../hooks/useEventSchedule'
import { useEventSpeakers } from '../../hooks/useEventSpeakers'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { EventRegistrationForm } from '../../components/events/EventRegistrationForm'
import { EventPageSectionRenderer } from '../../components/events/EventPageSectionRenderer'
import { EventScheduleTimeline } from '../../components/events/EventScheduleTimeline'
import { EventSpeakerGrid } from '../../components/events/EventSpeakerGrid'
import {
  Calendar,
  MapPin,
  Video,
  Clock,
  Users,
  Share2,
  Edit,
  CheckCircle,
  XCircle,
  Megaphone,
  FileText,
  ChevronRight,
} from 'lucide-solid'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
  EVENT_UPDATE_TYPE_LABELS,
  EVENT_UPDATE_TYPE_COLORS,
  EVENT_ARTICLE_TYPE_LABELS,
} from '../../lib/constants'
import { format, isPast, isSameDay } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'
import { truncate } from '../../lib/utils'

export default function EventDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { event } = useEvent(() => params.id)
  usePageTitle(() => event()?.title)
  const toast = useToast()
  const { rsvp, cancelRSVP, checkRSVP, getRSVPCount, loading: rsvpLoading } = useRSVP()
  const { submitRegistration, loading: regLoading } = useSubmitRegistration()
  const { updates: eventUpdates } = usePublishedEventUpdates(() => params.id)
  const { articles: eventArticles } = usePublishedEventArticles(() => params.id)
  const { sections: pageSections } = usePublicEventSections(() => params.id)
  const { schedule: scheduleItems } = useEventSchedule(() => params.id)
  const { speakers: eventSpeakers } = useEventSpeakers(() => params.id)

  const [hasRSVPd, setHasRSVPd] = createSignal(false)
  const [rsvpCount, setRSVPCount] = createSignal(0)
  const [checking, setChecking] = createSignal(true)
  const [showRegForm, setShowRegForm] = createSignal(false)

  const hasCustomFields = () => (event()?.registration_fields || []).length > 0

  const isOrganizer = () => event()?.organizer_id === auth.user()?.id
  const isPastEvent = () => event() && isPast(new Date(event()!.start_date))

  // Check RSVP status and count
  createEffect(
    on(
      () => [event(), auth.user()] as const,
      ([eventData, userData]) => {
        if (!eventData || !userData) return
        setChecking(true)
        Promise.all([
          checkRSVP(eventData.id, userData.id),
          getRSVPCount(eventData.id),
        ])
          .then(([hasRSVP, count]) => {
            setHasRSVPd(hasRSVP)
            setRSVPCount(count)
          })
          .catch((error) => {
            console.error('Error checking RSVP:', error)
          })
          .finally(() => {
            setChecking(false)
          })
      }
    )
  )

  const handleRSVP = async () => {
    if (!auth.user() || !event()) return

    try {
      if (hasRSVPd()) {
        await cancelRSVP(event()!.id, auth.user()!.id)
        setHasRSVPd(false)
        setRSVPCount((c) => c - 1)
      } else if (hasCustomFields()) {
        // Show registration form instead of direct RSVP
        setShowRegForm(true)
      } else {
        await rsvp(event()!.id, auth.user()!.id)
        setHasRSVPd(true)
        setRSVPCount((c) => c + 1)
      }
    } catch (error: any) {
      console.error('RSVP error:', error)
    }
  }

  const handleRegistrationSubmit = async (data: Record<string, any>) => {
    if (!auth.user() || !event()) return
    try {
      await submitRegistration(event()!.id, auth.user()!.id, data)
      setHasRSVPd(true)
      setRSVPCount((c) => c + 1)
      setShowRegForm(false)
      toast.success('Registration submitted successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit registration')
    }
  }

  const startDate = () => event() ? new Date(event()!.start_date) : null
  const endDate = () =>
    event() && event()!.end_date ? new Date(event()!.end_date!) : null
  const isSingleDay = () => {
    const s = startDate()
    const e = endDate()
    if (!s || !e) return true
    return isSameDay(s, e)
  }

  const canRSVP = () => {
    if (!event()) return false
    if (isPastEvent()) return false
    if (isOrganizer()) return false
    if (!event()!.capacity) return true
    return rsvpCount() < event()!.capacity!
  }

  const isFull = () => {
    if (!event()?.capacity) return false
    return rsvpCount() >= event()!.capacity!
  }

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-12 text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
            <p class="mt-4 text-ktip-sand-600">Loading event...</p>
          </div>
        }
      >
        <Show
          when={!event.loading && event()}
          fallback={
            <div class="container mx-auto px-4 py-16 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-3xl">📅</span>
              </div>
              <h2 class="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
                Event Not Found
              </h2>
              <p class="text-gray-500 mb-6">
                This event doesn't exist or has been removed.
              </p>
              <button
                onClick={() => navigate('/events')}
                class="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
              >
                Back to Events
              </button>
            </div>
          }
        >
          {/* === Dark Hero Header Band === */}
          <div
            class="relative min-h-[180px] flex items-center bg-gray-800 bg-cover bg-center"
            style={event()!.image_url ? { "background-image": `url(${event()!.image_url})` } : {}}
          >
            {/* Dark overlay */}
            <div class="absolute inset-0 bg-gray-900/80" />

            <div class="relative container mx-auto px-4 py-10">
              <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Event Detail</p>
                  <h1 class="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                    {event()!.title}
                  </h1>
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge class={EVENT_TYPE_COLORS[event()!.event_type]}>
                      {EVENT_TYPE_LABELS[event()!.event_type]}
                    </Badge>
                    <Show when={event()!.status === 'cancelled'}>
                      <Badge class={EVENT_STATUS_COLORS['cancelled']}>
                        {EVENT_STATUS_LABELS['cancelled']}
                      </Badge>
                    </Show>
                    <Show when={isPastEvent() && event()!.status !== 'cancelled'}>
                      <Badge variant="default">Past Event</Badge>
                    </Show>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <Show when={isOrganizer()}>
                    <A href={`/events/${params.id}/edit`}>
                      <button class="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-semibold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center gap-1.5">
                        <Edit size={14} />
                        Edit
                      </button>
                    </A>
                  </Show>
                  <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                    <A href="/" class="hover:text-white transition-colors">Home</A>
                    <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                    <A href="/events" class="hover:text-white transition-colors">Events</A>
                    <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                    <span class="text-gray-300">{truncate(event()!.title, 30)}</span>
                  </nav>
                </div>
              </div>
            </div>
          </div>

          {/* === Past Event Banner === */}
          <Show when={isPastEvent()}>
            <div class="bg-gray-50 border-b border-gray-200 py-3">
              <p class="text-gray-700 text-center text-sm">
                This event has already passed
              </p>
            </div>
          </Show>

          {/* === Two-Column Content Area === */}
          <div class="bg-white py-12">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

              {/* === Main Column === */}
              <div class="lg:col-span-2">
                {/* Event title repeat */}
                <h2 class="text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2">
                  {event()!.title}
                </h2>

                {/* Date line */}
                <Show when={startDate()}>
                  {(d) => (
                    <p class="text-sm text-gray-400 text-center mb-6">
                      Date: {format(d(), 'MMMM dd, yyyy')}
                    </p>
                  )}
                </Show>

                {/* Event Image */}
                <Show when={event()!.image_url}>
                  <img
                    src={event()!.image_url!}
                    alt={event()!.title}
                    class="w-full max-h-96 object-cover rounded mb-6"
                    loading="lazy"
                    width={800}
                    height={384}
                  />
                </Show>

                {/* Event Details Grid */}
                <div class="grid md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                  {/* Date */}
                  <div class="flex items-start gap-3">
                    <Calendar size={20} class="text-ktip-ocean-600 mt-1" />
                    <div>
                      <p class="text-sm text-gray-500">Date</p>
                      <p class="font-medium text-ktip-sand-900">
                        {format(startDate()!, 'EEEE, MMMM d, yyyy')}
                        <Show when={!isSingleDay()}>
                          <br />
                          to {format(endDate()!, 'EEEE, MMMM d, yyyy')}
                        </Show>
                      </p>
                    </div>
                  </div>

                  {/* Time */}
                  <div class="flex items-start gap-3">
                    <Clock size={20} class="text-ktip-ocean-600 mt-1" />
                    <div>
                      <p class="text-sm text-gray-500">Time</p>
                      <p class="font-medium text-ktip-sand-900">
                        {format(startDate()!, 'h:mm a')}
                        <Show when={endDate()}>
                          {' '}
                          - {format(endDate()!, 'h:mm a')}
                        </Show>
                      </p>
                    </div>
                  </div>

                  {/* Location */}
                  <div class="flex items-start gap-3">
                    <Show
                      when={event()!.is_virtual}
                      fallback={<MapPin size={20} class="text-ktip-ocean-600 mt-1" />}
                    >
                      <Video size={20} class="text-ktip-ocean-600 mt-1" />
                    </Show>
                    <div>
                      <p class="text-sm text-gray-500">Location</p>
                      <p class="font-medium text-ktip-sand-900">
                        {event()!.is_virtual ? 'Virtual Event' : event()!.location}
                      </p>
                    </div>
                  </div>

                  {/* Capacity */}
                  <Show when={event()!.capacity}>
                    <div class="flex items-start gap-3">
                      <Users size={20} class="text-ktip-ocean-600 mt-1" />
                      <div>
                        <p class="text-sm text-gray-500">Capacity</p>
                        <p class="font-medium text-ktip-sand-900">
                          {rsvpCount()} / {event()!.capacity} attendees
                          <Show when={isFull()}>
                            <span class="text-red-600 ml-2">(Full)</span>
                          </Show>
                        </p>
                      </div>
                    </div>
                  </Show>
                </div>

                {/* Description */}
                <Show when={event()!.description}>
                  <div class="mb-6">
                    <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                      About This Event
                    </h3>
                    <p class="text-ktip-ocean-600 text-xs italic mb-3">Event description</p>
                    <div class="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                      {event()!.description}
                    </div>
                  </div>
                </Show>

                {/* Engagement row */}
                <div class="border-t border-gray-200 pt-4 mt-6 flex items-center gap-4 mb-6">
                  <button
                    class="flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href)
                      toast.success('Link copied to clipboard!')
                    }}
                  >
                    <Share2 size={16} />
                    Share
                  </button>
                </div>

                {/* Page Sections */}
                <For each={pageSections() || []}>
                  {(section) => <EventPageSectionRenderer section={section} />}
                </For>

                {/* Schedule */}
                <Show when={scheduleItems()?.length}>
                  <EventScheduleTimeline items={scheduleItems()!} />
                </Show>

                {/* Speakers */}
                <Show when={eventSpeakers()?.length}>
                  <EventSpeakerGrid speakers={eventSpeakers()!} />
                </Show>

                {/* Event Updates */}
                <Show when={eventUpdates()?.length}>
                  <div class="mt-10">
                    <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                      <Megaphone size={18} class="text-ktip-ocean-600" />
                      Updates
                    </h3>
                    <p class="text-ktip-ocean-600 text-xs italic mb-4">Latest announcements</p>
                    <div class="space-y-4">
                      <For each={eventUpdates()}>
                        {(update) => (
                          <div class="border-l-4 border-ktip-ocean-200 pl-4 py-2">
                            <div class="flex items-center gap-2 mb-1">
                              <span class="font-medium text-ktip-sand-900">{update.title}</span>
                              <Badge size="sm" class={EVENT_UPDATE_TYPE_COLORS[update.update_type] || ''}>
                                {EVENT_UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                              </Badge>
                            </div>
                            <p class="text-sm text-gray-600 whitespace-pre-wrap">{update.content}</p>
                            <p class="text-xs text-gray-400 mt-2">
                              {format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Event Articles */}
                <Show when={eventArticles()?.length}>
                  <div class="mt-10">
                    <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                      <FileText size={18} class="text-ktip-ocean-600" />
                      Articles
                    </h3>
                    <p class="text-ktip-ocean-600 text-xs italic mb-4">Related reading</p>
                    <div class="space-y-6">
                      <For each={eventArticles()}>
                        {(article) => (
                          <div class="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                            <div class="flex items-center gap-2 mb-2">
                              <h4 class="text-lg font-semibold text-ktip-sand-900">{article.title}</h4>
                              <Badge size="sm" class="bg-gray-100 text-gray-600 border-gray-200">
                                {EVENT_ARTICLE_TYPE_LABELS[article.article_type] || article.article_type}
                              </Badge>
                            </div>
                            <p class="text-gray-700 whitespace-pre-wrap">{article.content}</p>
                            <p class="text-xs text-gray-400 mt-3">
                              {format(new Date(article.created_at), 'MMM d, yyyy')}
                              {article.author?.display_name && ` by ${article.author.display_name}`}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>

              {/* === Sidebar === */}
              <div class="lg:col-span-1">
                {/* Widget 1: Event Registration */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Event Registration
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">RSVP & sign up</p>

                  <Show when={checking()}>
                    <div class="text-center py-4">
                      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                    </div>
                  </Show>

                  <Show when={!checking()}>
                    <Show when={isOrganizer()}>
                      <div class="text-center py-4 text-gray-500">
                        <p>You are the organizer of this event</p>
                      </div>
                    </Show>

                    <Show when={!isOrganizer() && !isPastEvent()}>
                      <Show when={hasRSVPd()}>
                        <div class="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-lg p-4 mb-4">
                          <div class="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                            <CheckCircle size={20} />
                            <span class="font-medium">You're attending!</span>
                          </div>
                          <p class="text-sm text-ktip-tropical-600">
                            We look forward to seeing you at the event.
                          </p>
                        </div>
                      </Show>

                      <Show when={isFull() && !hasRSVPd()}>
                        <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                          <div class="flex items-center gap-2 text-red-700 mb-2">
                            <XCircle size={20} />
                            <span class="font-medium">Event is full</span>
                          </div>
                          <p class="text-sm text-red-600">
                            This event has reached maximum capacity.
                          </p>
                        </div>
                      </Show>

                      <Show
                        when={showRegForm()}
                        fallback={
                          <Button
                            fullWidth
                            variant={hasRSVPd() ? 'outline' : 'primary'}
                            onClick={handleRSVP}
                            loading={rsvpLoading()}
                            disabled={!canRSVP() && !hasRSVPd()}
                          >
                            {hasRSVPd() ? 'Cancel RSVP' : hasCustomFields() ? 'Register for Event' : 'RSVP to Event'}
                          </Button>
                        }
                      >
                        <EventRegistrationForm
                          fields={event()!.registration_fields || []}
                          onSubmit={handleRegistrationSubmit}
                          onCancel={() => setShowRegForm(false)}
                          loading={regLoading()}
                        />
                      </Show>
                    </Show>

                    <Show when={isPastEvent()}>
                      <div class="text-center py-4 text-gray-500">
                        <p>This event has already passed</p>
                      </div>
                    </Show>
                  </Show>

                  {/* Attendee Count */}
                  <div class="mt-4 pt-4 border-t border-gray-200">
                    <p class="text-sm text-gray-500">
                      {rsvpCount()} {rsvpCount() === 1 ? 'person' : 'people'} attending
                    </p>
                  </div>
                </div>

                {/* Widget 2: Organizer */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Organized By
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Event host</p>
                  <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-lg font-medium text-ktip-ocean-700">
                      {event()!.organizer?.display_name?.charAt(0).toUpperCase() || 'O'}
                    </div>
                    <div>
                      <A
                        href={`/profile/${event()!.organizer_id}`}
                        class="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                      >
                        {event()!.organizer?.display_name || 'Unknown User'}
                      </A>
                      <Show when={event()!.organizer?.country}>
                        <p class="text-sm text-gray-500">
                          {event()!.organizer!.country}
                        </p>
                      </Show>
                    </div>
                  </div>
                  <Button variant="outline" fullWidth>
                    Contact Organizer
                  </Button>
                </div>

                {/* Widget 3: Event Details */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Event Details
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Key information</p>
                  <div class="text-sm divide-y divide-gray-100">
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Type</span>
                      <span class="font-medium text-ktip-sand-900">
                        {EVENT_TYPE_LABELS[event()!.event_type]}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Date</span>
                      <span class="font-medium text-ktip-sand-900">
                        {format(startDate()!, 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Time</span>
                      <span class="font-medium text-ktip-sand-900">
                        {format(startDate()!, 'h:mm a')}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Format</span>
                      <span class="font-medium text-ktip-sand-900">
                        {event()!.is_virtual ? 'Virtual' : 'In-Person'}
                      </span>
                    </div>
                    <Show when={event()!.capacity}>
                      <div class="flex items-center justify-between py-2.5">
                        <span class="text-gray-500">Capacity</span>
                        <span class="font-medium text-ktip-sand-900">
                          {event()!.capacity}
                        </span>
                      </div>
                    </Show>
                  </div>
                </div>

                {/* Widget 4: Share */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Share This Event
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Spread the word</p>
                  <Button variant="outline" fullWidth icon={<Share2 size={18} />}>
                    Copy Link
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
