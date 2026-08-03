import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useEvent, useRSVP, useDeleteEvent } from '../../hooks/useEvents'
// Lives in the admin hook file but the RLS policy is organizer-scoped, so an
// event's own host can flip it out of draft from here.
import { useEventStatusUpdate } from '../../hooks/useAdminEvents'
import { useSubmitRegistration } from '../../hooks/useEventRegistrationForm'
import { usePublishedEventUpdates } from '../../hooks/useEventUpdates'
import { usePublishedEventArticles } from '../../hooks/useEventArticles'
import { usePublicEventSections } from '../../hooks/useEventPageSections'
import { useEventSchedule } from '../../hooks/useEventSchedule'
import { useEventSpeakers } from '../../hooks/useEventSpeakers'
import { useEventCriteria } from '../../hooks/useEventCriteria'
import { useEntityDocuments } from '../../hooks/useEntityDocuments'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import { DetailsList } from '../../components/shared/DetailsList'
import { EventRegistrationForm } from '../../components/events/EventRegistrationForm'
import { AttendanceTypePicker } from '../../components/events/AttendanceTypePicker'
import { EventPageSectionRenderer } from '../../components/events/EventPageSectionRenderer'
import { EventScheduleTimeline } from '../../components/events/EventScheduleTimeline'
import { EventSpeakerGrid } from '../../components/events/EventSpeakerGrid'
import { EventChallengeBrief } from '../../components/events/EventChallengeBrief'
import { EventSolutionsPanel } from '../../components/events/EventSolutionsPanel'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { describeEventDeletion } from '../../lib/delete-guard'
import { venuePath } from '../../lib/event-slug'
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
  Send,
  Map as MapIcon,
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
  ATTENDANCE_TYPE_LABELS,
} from '../../lib/constants'
import { blueprintFor } from '../../lib/event-blueprints'
import type { AttendanceType, RSVPStatus } from '../../types'
import { format, isPast, isSameDay } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { useTranslatedFields } from '../../hooks/useTranslated'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { truncate } from '../../lib/utils'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'

export default function EventDetailPage() {
    const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const { openMember } = useMemberPanel()

  const { event, loading: eventLoading } = useEvent(params.id)
  useCanonicalSlug(params.id, event)
  /**
   * The reader's copy of the same row.
   *
   * Deliberately a SECOND value rather than a rename, because two things on this
   * page must keep the original: `useCanonicalSlug` above derives the URL from
   * the title, and the delete confirmation asks the organiser to type the title
   * back. Translating either would produce a canonical redirect loop and an
   * unpassable confirmation dialog respectively.
   */
  const translatedEvent = useTranslatedFields(event, ['title', 'summary', 'description', 'location'])
  usePageTitle(translatedEvent?.title)
  const toast = useToast()
  const { rsvp, cancelRSVP, checkRSVP, getRSVPCount, loading: rsvpLoading } = useRSVP()
  const { submitRegistration, loading: regLoading } = useSubmitRegistration()
  const { deleteEvent } = useDeleteEvent()
  const { updateStatus, loading: publishing } = useEventStatusUpdate()
  const { updates: eventUpdates } = usePublishedEventUpdates(params.id)
  const { articles: eventArticles } = usePublishedEventArticles(params.id)
  const { sections: pageSections } = usePublicEventSections(params.id)
  const { schedule: scheduleItems } = useEventSchedule(params.id)
  const { speakers: eventSpeakers } = useEventSpeakers(params.id)
  const { criteria: eventCriteria } = useEventCriteria(params.id)
  const { documents: eventDocuments } = useEntityDocuments('event', params.id)

  const [myRsvp, setMyRsvp] = useState<{
    status: RSVPStatus
    attendance_type: AttendanceType
  } | null>(null)
  const [rsvpCount, setRSVPCount] = useState(0)
  const [checking, setChecking] = useState(true)
  const [showRegForm, setShowRegForm] = useState(false)
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('participant')

  const hasCustomFields = (event?.registration_fields || []).length > 0

  // A row exists — but "registered" and "waiting to be let in" are different
  // things to say, so the two are kept apart everywhere below.
  const hasRSVPd = !!myRsvp && myRsvp.status !== 'declined'
  const isPending = myRsvp?.status === 'pending'

  // The choice is only offered where it means something: a type with an
  // audience (blueprint) that has actually switched spectators on (event).
  const offersViewing = !!event && blueprintFor(event.event_type).allowViewers && event.spectators_enabled

  const isOrganizer = event?.organizer_id === auth.user?.id
  // An event is only past once it has finished — multi-day events stay active until end_date
  const isPastEvent = !!(event && isPast(new Date(event.end_date || event.start_date)))
  // Events are created as drafts, and a draft is invisible everywhere except to
  // its own organizer — so the organizer is the one who has to be told.
  const isDraft = event?.status === 'draft'

  const handlePublish = async () => {
    if (!event) return
    try {
      await updateStatus(event.id, 'published')
      toast.success(t`Event published — it now shows in public listings`)
    } catch (error: any) {
      toast.error(error?.message || t`Failed to publish event`)
    }
  }

  // Check RSVP status and count
  useEffect(() => {
    if (!event || !auth.user) return
    setChecking(true)
    Promise.all([
      checkRSVP(event.id, auth.user.id),
      getRSVPCount(event.id),
    ])
      .then(([mine, count]) => {
        setMyRsvp(mine)
        if (mine) setAttendanceType(mine.attendance_type)
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

  const registrantName = auth.profile?.display_name || t`Someone`

  const handleRSVP = async () => {
    if (!auth.user || !event) return

    try {
      if (myRsvp?.status === 'declined') {
        // A declined row is terminal, and the unique-per-event row is the
        // registrant's to delete — so asking again is delete-then-insert, done
        // in one click rather than making them press the button twice.
        await cancelRSVP(event.id, auth.user.id)
        await rsvp(event.id, auth.user.id, attendanceType, event, registrantName)
        setMyRsvp({ status: 'pending', attendance_type: attendanceType })
        toast.success(t`Registration sent — the organizer will approve it.`)
      } else if (myRsvp) {
        await cancelRSVP(event.id, auth.user.id)
        // Only a confirmed registration was ever counted, so a pending one
        // being withdrawn must not decrement the tally.
        if (myRsvp.status !== 'pending') setRSVPCount((c) => c - 1)
        setMyRsvp(null)
      } else if (hasCustomFields) {
        // Show registration form instead of direct RSVP
        setShowRegForm(true)
      } else {
        await rsvp(event.id, auth.user.id, attendanceType, event, registrantName)
        setMyRsvp({ status: 'pending', attendance_type: attendanceType })
        toast.success(t`Registration sent — the organizer will approve it.`)
      }
    } catch (error: any) {
      toast.error(error?.message || t`Failed to register`)
    }
  }

  const handleRegistrationSubmit = async (data: Record<string, any>) => {
    if (!auth.user || !event) return
    try {
      await submitRegistration(event.id, auth.user.id, data, attendanceType, event, registrantName)
      setMyRsvp({ status: 'pending', attendance_type: attendanceType })
      setShowRegForm(false)
      toast.success(t`Registration sent — the organizer will approve it.`)
    } catch (error: any) {
      toast.error(error.message || t`Failed to submit registration`)
    }
  }

  const startDate = event ? new Date(event.start_date) : null
  const endDate = event && event.end_date ? new Date(event.end_date) : null
  const isSingleDay = !startDate || !endDate ? true : isSameDay(startDate, endDate)

  // rsvpCount is the confirmed *participant* count (096), so the cap only ever
  // closes the door on someone registering to compete. A viewer can still ask.
  const isFull = event?.capacity ? rsvpCount >= event.capacity : false

  const canRSVP = (() => {
    if (!event) return false
    if (isPastEvent) return false
    if (isOrganizer) return false
    if (attendanceType === 'viewer') return true
    return !isFull
  })()

  if (eventLoading || !event) {
    if (eventLoading) {
      return (
        <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
          <p className="mt-4 text-ktip-sand-600"><Trans>Loading event...</Trans></p>
        </div>
      )
    }
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CalendarX size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Event Not Found</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This event doesn't exist or has been removed.</Trans>
        </p>
        <button
          onClick={() => navigate('/events')}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg"
        >
          <Trans>Back to Events</Trans>
        </button>
      </div>
    )
  }

  // Resolved after the guard rather than beside the hook, so it inherits the
  // narrowing that proves `event` is non-null and every render site below stays
  // free of optional chaining.
  const display = translatedEvent ?? event

  return (
    <>
      <PageHero
        eyebrow={t`Event Detail`}
        title={display.title}
        image={event.image_url}
        imageSeed={event.id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Events`, href: '/events' },
          { label: truncate(display.title, 30) },
        ]}
        actions={
          isOrganizer ? (
            <>
              {isDraft && (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="px-4 py-2 btn-brand text-sm font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send size={14} />
                  {publishing ? t`Publishing…` : t`Publish`}
                </button>
              )}
              <Link to={`/events/${params.id}/edit`}>
                {/* Publish takes the brand fill on a draft, so Edit steps back */}
                <button
                  className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 ${
                    isDraft
                      ? 'border border-ktip-sand-200 bg-ktip-cream text-ktip-sand-700 shadow-medium hover:bg-ktip-sand-50 transition-colors'
                      : 'btn-brand'
                  }`}
                >
                  <Edit size={14} />
                  <Trans>Edit</Trans>
                </button>
              </Link>
              {/* `checking` still true means the RSVP count has not landed; the
                  guard reads null as "might not be zero" rather than as zero. */}
              <DeleteEntityControl
                noun="event"
                title={event.title}
                impact={describeEventDeletion({
                  status: event.status,
                  rsvpCount: checking ? null : rsvpCount,
                  hasVenue: !!event.has_venue,
                  hasChallenge: !!event.has_challenge,
                })}
                onDelete={() => deleteEvent(event.id)}
                redirectTo="/events"
              />
            </>
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
          {isDraft && (
            <Badge className={EVENT_STATUS_COLORS['draft']}>
              {EVENT_STATUS_LABELS['draft']}
            </Badge>
          )}
          {isPastEvent && event.status !== 'cancelled' && (
            <Badge variant="default"><Trans>Past Event</Trans></Badge>
          )}
        </div>
      </PageHero>

      {/* === Draft Banner === */}
      {isDraft && (
        <div className="bg-ktip-sun-50 border-b border-ktip-sun-200 py-3">
          <p className="text-center text-sm text-ktip-sand-800">
            {isOrganizer
              ? t`This event is a draft — only you can see it. Publish it to list it on Events and the hackathon pages.`
              : t`This event is a draft and is not published yet.`}
          </p>
        </div>
      )}

      {/* === Past Event Banner === */}
      {isPastEvent && (
        <div className="bg-ktip-sand-50 border-b border-ktip-sand-200 py-3">
          <p className="text-gray-700 text-center text-sm">
            <Trans>This event has already passed</Trans>
          </p>
        </div>
      )}

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Event title repeat */}
            <h2 className="text-xl font-bold uppercase text-center text-ktip-sand-900 mb-2">
              {display.title}
            </h2>

            {/* Date line */}
            {startDate && (
              <p className="text-sm text-gray-400 text-center mb-6">
                <Trans>Date: {format(startDate, 'MMMM dd, yyyy')}</Trans>
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
            <div
              id="key-details"
              data-spy="Key details"
              className="scroll-mt-24 grid md:grid-cols-2 gap-4 mb-6 p-4 bg-ktip-sand-50 rounded border border-ktip-sand-200"
            >
              {/* Date */}
              <div className="flex items-start gap-3">
                <Calendar size={20} className="text-ktip-ocean-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-500"><Trans>Date</Trans></p>
                  <p className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'EEEE, MMMM d, yyyy')}
                    {!isSingleDay && (
                      <>
                        <br />
                        <Trans>to {format(endDate!, 'EEEE, MMMM d, yyyy')}</Trans>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-ktip-ocean-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-500"><Trans>Time</Trans></p>
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
                  <p className="text-sm text-gray-500"><Trans>Location</Trans></p>
                  <p className="font-medium text-ktip-sand-900">
                    {event.is_virtual ? t`Virtual Event` : event.location}
                  </p>
                </div>
              </div>

              {/* Capacity */}
              {event.capacity && (
                <div className="flex items-start gap-3">
                  <Users size={20} className="text-ktip-ocean-600 mt-1" />
                  <div>
                    <p className="text-sm text-gray-500"><Trans>Capacity</Trans></p>
                    <p className="font-medium text-ktip-sand-900">
                      <Trans>{rsvpCount} / {event.capacity} attendees</Trans>
                      {isFull && (
                        <span className="text-red-600 ml-2"><Trans>(Full)</Trans></span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Summary lede */}
            {event.summary && (
              <p className="text-lg text-ktip-sand-800 font-medium leading-relaxed mb-6">
                {display.summary}
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
              <div id="about" data-spy="About" className="scroll-mt-24 mb-6">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>About This Event</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-3"><Trans>Event description</Trans></p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {display.description}
                </div>
              </div>
            )}

            {/* Additional Details */}
            {event.details && event.details.length > 0 && (
              <div className="mb-6">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>Additional Details</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-3"><Trans>Key facts at a glance</Trans></p>
                <DetailsList details={event.details} />
              </div>
            )}

            {/* Engagement row */}
            <div className="border-t border-ktip-sand-200 pt-4 mt-6 flex items-center gap-4 mb-6">
              <button
                className="flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  toast.success(t`Link copied to clipboard!`)
                }}
              >
                <Share2 size={16} />
                <Trans>Share</Trans>
              </button>
            </div>

            {/*
              Venue door. Above the brief on purpose: during a live event the
              one thing an attendee is looking for is the way in.
            */}
            {event.has_venue && (
              <div
                data-tutorial="event-venue-door"
                className="mb-8 flex flex-col gap-3 rounded-2xl border border-ktip-ocean-200 bg-ktip-ocean-50 p-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-ktip-ocean-800">
                    <Trans>This event has a live virtual venue</Trans>
                  </h2>
                  <p className="mt-1 text-sm text-ktip-ocean-700">
                    <Trans>Rooms, open audio and everyone who is online right now. Registered attendees can walk straight in.</Trans>
                  </p>
                </div>
                <Link to={venuePath(event)} className="shrink-0">
                  <Button icon={<MapIcon size={16} />}><Trans>Enter the venue</Trans></Button>
                </Link>
              </div>
            )}

            {/* Challenge brief — only once the organizer has switched it on */}
            {event.has_challenge && eventCriteria && eventCriteria.length > 0 && (
              <EventChallengeBrief
                criteria={eventCriteria}
                submissionDeadline={event.submission_deadline}
              />
            )}

            {/* Documents the organizer attached (briefs, rules, datasets) — part
                of the ask, so they sit with the brief. An empty panel is only
                useful to the person who can fill it. */}
            {(isOrganizer || (eventDocuments && eventDocuments.length > 0)) && (
              <div id="documents" data-spy="Documents" className="scroll-mt-24 mt-10">
                <DocumentsPanel
                  entityType="event"
                  entityId={event.id}
                  canEditEntity={isOrganizer}
                  entity={event}
                />
              </div>
            )}

            {/* What participants submitted back: the ask, then the answers. */}
            {event.has_challenge && (
              <div id="solutions" data-spy="Solutions" className="scroll-mt-24">
                <EventSolutionsPanel
                  eventId={event.id}
                  eventStatus={event.status}
                  submissionDeadline={event.submission_deadline}
                  isOrganizer={isOrganizer}
                />
              </div>
            )}

            {/* Page Sections */}
            {(pageSections || []).map((section) => (
              <EventPageSectionRenderer key={section.id} section={section} />
            ))}

            {/* Schedule */}
            {scheduleItems && scheduleItems.length > 0 && (
              <div id="schedule" data-spy="Schedule" className="scroll-mt-24">
                <EventScheduleTimeline items={scheduleItems} />
              </div>
            )}

            {/* Speakers */}
            {eventSpeakers && eventSpeakers.length > 0 && (
              <div id="speakers" data-spy="Speakers" className="scroll-mt-24">
                <EventSpeakerGrid speakers={eventSpeakers} />
              </div>
            )}

            {/* Event Updates */}
            {eventUpdates && eventUpdates.length > 0 && (
              <div id="updates" data-spy="Updates" className="scroll-mt-24 mt-10">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                  <Megaphone size={18} className="text-ktip-ocean-600" />
                  <Trans>Updates</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Latest announcements</Trans></p>
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
                  <Trans>Articles</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Related reading</Trans></p>
                <div className="space-y-6">
                  {eventArticles.map((article) => (
                    <div key={article.id} className="border-b border-ktip-sand-200 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-lg font-semibold text-ktip-sand-900">{article.title}</h4>
                        <Badge size="sm" className="bg-ktip-sand-100 text-gray-600 border-ktip-sand-200">
                          {EVENT_ARTICLE_TYPE_LABELS[article.article_type] || article.article_type}
                        </Badge>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{article.content}</p>
                      <p className="text-xs text-gray-400 mt-3">
                        {format(new Date(article.created_at), 'MMM d, yyyy')}
                        {article.author?.display_name && t` by ${article.author.display_name}`}
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
            <div data-tutorial="event-registration" className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Event Registration</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>RSVP & sign up</Trans></p>

              {checking && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                </div>
              )}

              {!checking && (
                <>
                  {isOrganizer && (
                    <div className="text-center py-4 text-gray-500">
                      <p><Trans>You are the organizer of this event</Trans></p>
                    </div>
                  )}

                  {!isOrganizer && !isPastEvent && (
                    <>
                      {isPending && (
                        <div className="bg-ktip-sun-50 border border-ktip-sun-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-ktip-sun-800 mb-2">
                            <Clock size={20} />
                            <span className="font-medium"><Trans>Waiting on the organizer</Trans></span>
                          </div>
                          <p className="text-sm text-ktip-sun-700">
                            <Trans>
                              You asked to attend as a {ATTENDANCE_TYPE_LABELS[myRsvp!.attendance_type]}. You'll be
                              notified once it is approved.
                            </Trans>
                          </p>
                        </div>
                      )}

                      {hasRSVPd && !isPending && (
                        <div className="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                            <CheckCircle size={20} />
                            <span className="font-medium"><Trans>You're attending!</Trans></span>
                          </div>
                          <p className="text-sm text-ktip-tropical-600">
                            <Trans>We look forward to seeing you at the event.</Trans>
                          </p>
                        </div>
                      )}

                      {myRsvp?.status === 'declined' && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-red-700 mb-2">
                            <XCircle size={20} />
                            <span className="font-medium"><Trans>Registration declined</Trans></span>
                          </div>
                          <p className="text-sm text-red-600">
                            <Trans>The organizer did not approve this registration.</Trans>
                          </p>
                        </div>
                      )}

                      {isFull && !myRsvp && attendanceType === 'participant' && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-red-700 mb-2">
                            <XCircle size={20} />
                            <span className="font-medium"><Trans>Event is full</Trans></span>
                          </div>
                          <p className="text-sm text-red-600">
                            <Trans>Every participant place has been taken.</Trans>
                            {offersViewing && <Trans> You can still register as a viewer.</Trans>}
                          </p>
                        </div>
                      )}

                      {/* Asked before the form, not inside it: it decides what
                          you are registering as, which the form's answers are
                          then about. */}
                      {offersViewing && !myRsvp && (
                        <AttendanceTypePicker
                          value={attendanceType}
                          onChange={setAttendanceType}
                          disabled={rsvpLoading || regLoading}
                        />
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
                          variant={myRsvp ? 'outline' : 'primary'}
                          onClick={handleRSVP}
                          loading={rsvpLoading}
                          disabled={!canRSVP && !myRsvp}
                        >
                          {isPending
                            ? t`Withdraw registration`
                            : myRsvp?.status === 'declined'
                              ? t`Ask again`
                              : myRsvp
                                ? t`Cancel RSVP`
                                : hasCustomFields
                                  ? t`Register for Event`
                                  : t`Request to attend`}
                        </Button>
                      )}
                    </>
                  )}

                  {isPastEvent && (
                    <div className="text-center py-4 text-gray-500">
                      <p><Trans>This event has already passed</Trans></p>
                    </div>
                  )}
                </>
              )}

              {/* Attendee Count */}
              <div className="mt-4 pt-4 border-t border-ktip-sand-200">
                <p className="text-sm text-gray-500">
                  <Plural value={rsvpCount} one="# person attending" other="# people attending" />
                </p>
              </div>
            </div>

            {/* Widget 2: Organizer */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Organized By</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Event host</Trans></p>
              <div className="flex items-center gap-3 mb-4">
                <DiamondAvatar
                  src={event.organizer?.avatar_url}
                  name={event.organizer?.display_name || t`Organizer`}
                  size={48}
                />
                <div>
                  <button
                    type="button"
                    onClick={() => openMember(event.organizer_id)}
                    className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                  >
                    {event.organizer?.display_name || t`Unknown User`}
                  </button>
                  {event.organizer?.country && (
                    <p className="text-sm text-gray-500">
                      {event.organizer.country}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="outline" fullWidth>
                <Trans>Contact Organizer</Trans>
              </Button>
            </div>

            {/* Widget 3: Event Details */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Event Details</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Key information</Trans></p>
              <div className="text-sm divide-y divide-ktip-sand-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Type</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {EVENT_TYPE_LABELS[event.event_type]}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Date</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Time</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {format(startDate!, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Format</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {event.is_virtual ? t`Virtual` : t`In-Person`}
                  </span>
                </div>
                {event.capacity && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-gray-500"><Trans>Capacity</Trans></span>
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
                <Trans>Share This Event</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Spread the word</Trans></p>
              <Button variant="outline" fullWidth icon={<Share2 size={18} />}>
                <Trans>Copy Link</Trans>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
