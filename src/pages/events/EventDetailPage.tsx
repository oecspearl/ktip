import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useEvent, useRSVP } from '../../hooks/useEvents'
import { useSubmitRegistration } from '../../hooks/useEventRegistrationForm'
import { usePublishedEventUpdates } from '../../hooks/useEventUpdates'
import { usePublishedEventArticles } from '../../hooks/useEventArticles'
import { usePublicEventSections } from '../../hooks/useEventPageSections'
import { useEventSchedule } from '../../hooks/useEventSchedule'
import { useEventSpeakers } from '../../hooks/useEventSpeakers'
import { useEventCriteria } from '../../hooks/useEventCriteria'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import { DetailsList } from '../../components/shared/DetailsList'
import { EventRegistrationForm } from '../../components/events/EventRegistrationForm'
import { EventPageSectionRenderer } from '../../components/events/EventPageSectionRenderer'
import { EventScheduleTimeline } from '../../components/events/EventScheduleTimeline'
import { EventSpeakerGrid } from '../../components/events/EventSpeakerGrid'
import { EventChallengeBrief } from '../../components/events/EventChallengeBrief'
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
  CalendarX,
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
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
  const { openMember } = useMemberPanel()

  const { event, loading: eventLoading } = useEvent(params.id)
  usePageTitle(event?.title)
  const toast = useToast()
  const { rsvp, cancelRSVP, checkRSVP, getRSVPCount, loading: rsvpLoading } = useRSVP()
  const { submitRegistration, loading: regLoading } = useSubmitRegistration()
  const { updates: eventUpdates } = usePublishedEventUpdates(params.id)
  const { articles: eventArticles } = usePublishedEventArticles(params.id)
  const { sections: pageSections } = usePublicEventSections(params.id)
  const { schedule: scheduleItems } = useEventSchedule(params.id)
  const { speakers: eventSpeakers } = useEventSpeakers(params.id)
  const { criteria: eventCriteria } = useEventCriteria(params.id)

  const [hasRSVPd, setHasRSVPd] = useState(false)
  const [rsvpCount, setRSVPCount] = useState(0)
  const [checking, setChecking] = useState(true)
  const [showRegForm, setShowRegForm] = useState(false)

  const hasCustomFields = (event?.registration_fields || []).length > 0

  const isOrganizer = event?.organizer_id === auth.user?.id
  const isPastEvent = !!(event && isPast(new Date(event.start_date)))

  // Check RSVP status and count
  useEffect(() => {
    if (!event || !auth.user) return
    setChecking(true)
    Promise.all([
      checkRSVP(event.id, auth.user.id),
      getRSVPCount(event.id),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, auth.user?.id])

  const handleRSVP = async () => {
    if (!auth.user || !event) return

    try {
      if (hasRSVPd) {
        await cancelRSVP(event.id, auth.user.id)
        setHasRSVPd(false)
        setRSVPCount((c) => c - 1)
      } else if (hasCustomFields) {
        // Show registration form instead of direct RSVP
        setShowRegForm(true)
      } else {
        await rsvp(event.id, auth.user.id)
        setHasRSVPd(true)
        setRSVPCount((c) => c + 1)
      }
    } catch (error: any) {
      console.error('RSVP error:', error)
    }
  }

  const handleRegistrationSubmit = async (data: Record<string, any>) => {
    if (!auth.user || !event) return
    try {
      await submitRegistration(event.id, auth.user.id, data)
      setHasRSVPd(true)
      setRSVPCount((c) => c + 1)
      setShowRegForm(false)
      toast.success('Registration submitted — a copy is saved in your dashboard.')
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit registration')
    }
  }

  const startDate = event ? new Date(event.start_date) : null
  const endDate = event && event.end_date ? new Date(event.end_date) : null
  const isSingleDay = !startDate || !endDate ? true : isSameDay(startDate, endDate)

  const canRSVP = (() => {
    if (!event) return false
    if (isPastEvent) return false
    if (isOrganizer) return false
    if (!event.capacity) return true
    return rsvpCount < event.capacity
  })()

  const isFull = event?.capacity ? rsvpCount >= event.capacity : false

  if (eventLoading || !event) {
    if (eventLoading) {
      return (
        <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
          <p className="mt-4 text-ktip-sand-600">Loading event...</p>
        </div>
      )
    }
    return (
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CalendarX size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Event Not Found
        </h2>
        <p className="text-gray-500 mb-6">
          This event doesn't exist or has been removed.
        </p>
        <button
          onClick={() => navigate('/events')}
          className="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
        >
          Back to Events
        </button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Event Detail"
        title={event.title}
        image={event.image_url}
        imageSeed={event.id}
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: truncate(event.title, 30) },
        ]}
        actions={
          isOrganizer ? (
            <Link to={`/events/${params.id}/edit`}>
              <button className="px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-semibold rounded-lg hover:bg-ktip-ocean-700 transition-colors flex items-center gap-1.5">
                <Edit size={14} />
                Edit
              </button>
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={EVENT_TYPE_COLORS[event.event_type]}>
            {EVENT_TYPE_LABELS[event.event_type]}
          </Badge>
          {event.status === 'cancelled' && (
            <Badge className={EVENT_STATUS_COLORS['cancelled']}>
              {EVENT_STATUS_LABELS['cancelled']}
            </Badge>
          )}
          {isPastEvent && event.status !== 'cancelled' && (
            <Badge variant="default">Past Event</Badge>
          )}
        </div>
      </PageHero>

      {/* === Past Event Banner === */}
      {isPastEvent && (
        <div className="bg-ktip-sand-50 border-b border-gray-200 py-3">
          <p className="text-gray-700 text-center text-sm">
            This event has already passed
          </p>
        </div>
      )}

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-[calc(50vw+36rem)] mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Event title repeat */}
            <h2 className="text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2">
              {event.title}
            </h2>

            {/* Date line */}
            {startDate && (
              <p className="text-sm text-gray-400 text-center mb-6">
                Date: {format(startDate, 'MMMM dd, yyyy')}
              </p>
            )}

            {/* Event Image */}
            {event.image_url && (
              <img
                src={event.image_url}
                alt={event.title}
                className="w-full max-h-96 object-cover rounded mb-6"
                loading="lazy"
                width={800}
                height={384}
              />
            )}

            {/* Event Details Grid */}
            <div className="grid md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded border border-gray-200">
              {/* Date */}
              <div className="flex items-start gap-3">
                <Calendar size={20} className="text-ktip-ocean-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'EEEE, MMMM d, yyyy')}
                    {!isSingleDay && (
                      <>
                        <br />
                        to {format(endDate!, 'EEEE, MMMM d, yyyy')}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-ktip-ocean-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'h:mm a')}
                    {endDate && (
                      <> - {format(endDate, 'h:mm a')}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-3">
                {event.is_virtual ? (
                  <Video size={20} className="text-ktip-ocean-600 mt-1" />
                ) : (
                  <MapPin size={20} className="text-ktip-ocean-600 mt-1" />
                )}
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="font-medium text-ktip-sand-900">
                    {event.is_virtual ? 'Virtual Event' : event.location}
                  </p>
                </div>
              </div>

              {/* Capacity */}
              {event.capacity && (
                <div className="flex items-start gap-3">
                  <Users size={20} className="text-ktip-ocean-600 mt-1" />
                  <div>
                    <p className="text-sm text-gray-500">Capacity</p>
                    <p className="font-medium text-ktip-sand-900">
                      {rsvpCount} / {event.capacity} attendees
                      {isFull && (
                        <span className="text-red-600 ml-2">(Full)</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Summary lede */}
            {event.summary && (
              <p className="text-lg text-ktip-sand-800 font-medium leading-relaxed mb-6">
                {event.summary}
              </p>
            )}

            {/* Tags */}
            {event.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {event.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-sm font-medium bg-ktip-sand-100 text-ktip-sand-700 border border-ktip-sand-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="mb-6">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  About This Event
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-3">Event description</p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {event.description}
                </div>
              </div>
            )}

            {/* Additional Details */}
            {event.details && event.details.length > 0 && (
              <div className="mb-6">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  Additional Details
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-3">Key facts at a glance</p>
                <DetailsList details={event.details} />
              </div>
            )}

            {/* Engagement row */}
            <div className="border-t border-gray-200 pt-4 mt-6 flex items-center gap-4 mb-6">
              <button
                className="flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  toast.success('Link copied to clipboard!')
                }}
              >
                <Share2 size={16} />
                Share
              </button>
            </div>

            {/* Challenge brief — only once the organizer has switched it on */}
            {event.has_challenge && eventCriteria && eventCriteria.length > 0 && (
              <EventChallengeBrief
                criteria={eventCriteria}
                submissionDeadline={event.submission_deadline}
              />
            )}

            {/* Page Sections */}
            {(pageSections || []).map((section) => (
              <EventPageSectionRenderer key={section.id} section={section} />
            ))}

            {/* Schedule */}
            {scheduleItems && scheduleItems.length > 0 && (
              <EventScheduleTimeline items={scheduleItems} />
            )}

            {/* Speakers */}
            {eventSpeakers && eventSpeakers.length > 0 && (
              <EventSpeakerGrid speakers={eventSpeakers} />
            )}

            {/* Event Updates */}
            {eventUpdates && eventUpdates.length > 0 && (
              <div className="mt-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                  <Megaphone size={18} className="text-ktip-ocean-600" />
                  Updates
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Latest announcements</p>
                <div className="space-y-4">
                  {eventUpdates.map((update) => (
                    <div key={update.id} className="border-l-4 border-ktip-ocean-200 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-ktip-sand-900">{update.title}</span>
                        <Badge size="sm" className={EVENT_UPDATE_TYPE_COLORS[update.update_type] || ''}>
                          {EVENT_UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{update.content}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event Articles */}
            {eventArticles && eventArticles.length > 0 && (
              <div className="mt-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                  <FileText size={18} className="text-ktip-ocean-600" />
                  Articles
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Related reading</p>
                <div className="space-y-6">
                  {eventArticles.map((article) => (
                    <div key={article.id} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-lg font-semibold text-ktip-sand-900">{article.title}</h4>
                        <Badge size="sm" className="bg-gray-100 text-gray-600 border-gray-200">
                          {EVENT_ARTICLE_TYPE_LABELS[article.article_type] || article.article_type}
                        </Badge>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{article.content}</p>
                      <p className="text-xs text-gray-400 mt-3">
                        {format(new Date(article.created_at), 'MMM d, yyyy')}
                        {article.author?.display_name && ` by ${article.author.display_name}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Event Registration */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Event Registration
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">RSVP & sign up</p>

              {checking && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                </div>
              )}

              {!checking && (
                <>
                  {isOrganizer && (
                    <div className="text-center py-4 text-gray-500">
                      <p>You are the organizer of this event</p>
                    </div>
                  )}

                  {!isOrganizer && !isPastEvent && (
                    <>
                      {hasRSVPd && (
                        <div className="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                            <CheckCircle size={20} />
                            <span className="font-medium">You're attending!</span>
                          </div>
                          <p className="text-sm text-ktip-tropical-600">
                            We look forward to seeing you at the event.
                          </p>
                        </div>
                      )}

                      {isFull && !hasRSVPd && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-red-700 mb-2">
                            <XCircle size={20} />
                            <span className="font-medium">Event is full</span>
                          </div>
                          <p className="text-sm text-red-600">
                            This event has reached maximum capacity.
                          </p>
                        </div>
                      )}

                      {showRegForm ? (
                        <EventRegistrationForm
                          fields={event.registration_fields || []}
                          onSubmit={handleRegistrationSubmit}
                          onCancel={() => setShowRegForm(false)}
                          loading={regLoading}
                        />
                      ) : (
                        <Button
                          fullWidth
                          variant={hasRSVPd ? 'outline' : 'primary'}
                          onClick={handleRSVP}
                          loading={rsvpLoading}
                          disabled={!canRSVP && !hasRSVPd}
                        >
                          {hasRSVPd ? 'Cancel RSVP' : hasCustomFields ? 'Register for Event' : 'RSVP to Event'}
                        </Button>
                      )}
                    </>
                  )}

                  {isPastEvent && (
                    <div className="text-center py-4 text-gray-500">
                      <p>This event has already passed</p>
                    </div>
                  )}
                </>
              )}

              {/* Attendee Count */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  {rsvpCount} {rsvpCount === 1 ? 'person' : 'people'} attending
                </p>
              </div>
            </div>

            {/* Widget 2: Organizer */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Organized By
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Event host</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-ktip-ocean-100 rounded-full flex items-center justify-center text-lg font-medium text-ktip-ocean-700">
                  {event.organizer?.display_name?.charAt(0).toUpperCase() || 'O'}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => openMember(event.organizer_id)}
                    className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                  >
                    {event.organizer?.display_name || 'Unknown User'}
                  </button>
                  {event.organizer?.country && (
                    <p className="text-sm text-gray-500">
                      {event.organizer.country}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="outline" fullWidth>
                Contact Organizer
              </Button>
            </div>

            {/* Widget 3: Event Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Event Details
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Key information</p>
              <div className="text-sm divide-y divide-gray-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium text-ktip-sand-900">
                    {EVENT_TYPE_LABELS[event.event_type]}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Time</span>
                  <span className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Format</span>
                  <span className="font-medium text-ktip-sand-900">
                    {event.is_virtual ? 'Virtual' : 'In-Person'}
                  </span>
                </div>
                {event.capacity && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-gray-500">Capacity</span>
                    <span className="font-medium text-ktip-sand-900">
                      {event.capacity}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Widget 4: Share */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Share This Event
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Spread the word</p>
              <Button variant="outline" fullWidth icon={<Share2 size={18} />}>
                Copy Link
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
