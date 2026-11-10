import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { ReportInfringementLink } from '../../components/legal/ReportInfringementLink'
import { Button } from '../../components/ui/Button'
import { useEvent, useRSVP, useDeleteEvent } from '../../hooks/useEvents'
// Lives in the admin hook file but the RLS policy is organizer-scoped, so an
// event's own host can flip it out of draft from here.
import { useEventStatusUpdate } from '../../hooks/useAdminEvents'
import { useSubmitRegistration } from '../../hooks/useEventRegistrationForm'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { AgreementGateModal } from '../../components/legal/AgreementGate'
import { usePublishedEventUpdates } from '../../hooks/useEventUpdates'
import { usePublishedEventArticles } from '../../hooks/useEventArticles'
import { usePublicEventSections } from '../../hooks/useEventPageSections'
import { useEventSchedule } from '../../hooks/useEventSchedule'
import { useEventSpeakers } from '../../hooks/useEventSpeakers'
import { useEventCriteria } from '../../hooks/useEventCriteria'
import { useEntityDocuments } from '../../hooks/useEntityDocuments'
import { useEngagementGate } from '../../hooks/useEngagement'
import { EngagementNotice } from '../../components/shared/EngagementNotice'
import { useAuth } from '../../contexts/AuthContext'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useToast } from '../../contexts/ToastContext'
import { DetailsList } from '../../components/shared/DetailsList'
import { EventRegistrationForm } from '../../components/events/EventRegistrationForm'
import { AttendanceChoiceDialog } from '../../components/events/AttendanceChoiceDialog'
import { EventPageSectionRenderer } from '../../components/events/EventPageSectionRenderer'
import { EventScheduleTimeline } from '../../components/events/EventScheduleTimeline'
import { EventSpeakerGrid } from '../../components/events/EventSpeakerGrid'
import { EventChallengeBrief } from '../../components/events/EventChallengeBrief'
import { EventSolutionsPanel } from '../../components/events/EventSolutionsPanel'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { describeEventDeletion } from '../../lib/delete-guard'
import { eventManagePath, venuePath } from '../../lib/event-slug'
import { eventEndMs, eventPhase } from '../../lib/event-timing'
import { entityPath } from '../../lib/slug'
import { FactStrip } from '../../components/detail/FactStrip'
import { eventTarget } from '../../lib/share/targets'
import { cardImageFor } from '../../lib/hero-images'
import { EventActionCard } from '../../components/events/EventActionCard'
import { VerificationNotice } from '../../components/verification/VerificationNotice'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import {
  Clock,
  Edit,
  CheckCircle,
  XCircle,
  Megaphone,
  FileText,
  CalendarX,
  Send,
  ArrowLeft,
  MessageSquare,
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
import { format, isSameDay } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { useRecordView } from '../../hooks/useRecordView'
import { useTranslatedFields, isMachineTranslated } from '../../hooks/useTranslated'
import { TranslatedMark } from '../../components/legal/TranslatedMark'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { useEventTrail } from '../../hooks/useCategoryTrail'

export default function EventDetailPage() {
    const { t, i18n } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const { openMember } = useMemberPanel()
  const { openPanel: openMessages } = useMessagingPanel()
  // The setup run's last step sends the host here to look at what they built,
  // and this is the only page in the flow that is not the console — so it has
  // to offer the way back itself.
  const [searchParams] = useSearchParams()
  const fromSetup = searchParams.get('from') === 'setup'

  const { event, loading: eventLoading } = useEvent(params.id)
  useCanonicalSlug(params.id, event)
  useRecordView('event', event?.id)
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
  const breadcrumb = useEventTrail(event, translatedEvent?.title)
  usePageTitle(translatedEvent?.title)
  const toast = useToast()
  const { rsvp, cancelRSVP, checkRSVP, getRSVPCount, loading: rsvpLoading } = useRSVP()
  const { submitRegistration, loading: regLoading } = useSubmitRegistration()
  const { deleteEvent } = useDeleteEvent()
  const { updateStatus, loading: publishing } = useEventStatusUpdate()
  // Keyed on the resolved row's uuid, never the route param: the URL carries
  // the slug, and every one of these tables has a uuid event_id.
  const { updates: eventUpdates } = usePublishedEventUpdates(event?.id)
  const { articles: eventArticles } = usePublishedEventArticles(event?.id)
  const { sections: pageSections } = usePublicEventSections(event?.id)
  const { schedule: scheduleItems } = useEventSchedule(event?.id)
  const { speakers: eventSpeakers } = useEventSpeakers(event?.id)
  const { criteria: eventCriteria } = useEventCriteria(event?.id)
  const { documents: eventDocuments } = useEntityDocuments('event', event?.id)

  const [myRsvp, setMyRsvp] = useState<{
    status: RSVPStatus
    attendance_type: AttendanceType
  } | null>(null)
  const [rsvpCount, setRSVPCount] = useState(0)
  const [checking, setChecking] = useState(true)
  const [showRegForm, setShowRegForm] = useState(false)
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('participant')
  const [choiceOpen, setChoiceOpen] = useState(false)
  // Competition IP applies the first time a member enters a hackathon, not
  // only when they submit a solution. Registering to compete in an event with
  // a challenge is entering; registering to watch is not.
  const entryGate = useAgreementGate('competition')
  const [entryGateOpen, setEntryGateOpen] = useState(false)

  const hasCustomFields = (event?.registration_fields || []).length > 0

  // A row exists — but "registered" and "waiting to be let in" are different
  // things to say, so the two are kept apart everywhere below.
  const hasRSVPd = !!myRsvp && myRsvp.status !== 'declined'
  const isPending = myRsvp?.status === 'pending'

  // Asked on every type with an audience (blueprint), venue or not: an
  // in-person demo day has spectators too. It used to also need a venue and
  // spectators_enabled, so most registrants were filed as participants without
  // being asked. A viewer RSVP becomes a venue spectator in join_venue() (096)
  // whatever the flag says; the flag only decides whether members who never
  // registered may drop in.
  const offersViewing = !!event && blueprintFor(event.event_type).allowViewers

  const isOrganizer = event?.organizer_id === auth.user?.id
  // An event is only past once it has finished: multi-day events stay active
  // until end_date, and one with no end date gets the same day-long window the
  // Hackathons page uses to call it live.
  const phase = event ? eventPhase(event) : 'upcoming'
  const isPastEvent = phase === 'past'
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

  // Set by any RSVP action. The initial check must not overwrite a choice the
  // member made while it was still in flight.
  const rsvpTouchedRef = useRef(false)

  // Check RSVP status and count
  useEffect(() => {
    if (!event || !auth.user) return
    // Navigating between events, or signing out, while the check is in flight
    // used to land the previous event's answer on this one.
    let ignore = false
    rsvpTouchedRef.current = false
    setChecking(true)
    Promise.all([
      checkRSVP(event.id, auth.user.id),
      getRSVPCount(event.id),
    ])
      .then(([mine, count]) => {
        if (ignore || rsvpTouchedRef.current) return
        setMyRsvp(mine)
        if (mine) setAttendanceType(mine.attendance_type)
        setRSVPCount(count)
      })
      .catch((error) => {
        if (!ignore) console.error('Error checking RSVP:', error)
      })
      .finally(() => {
        if (!ignore) setChecking(false)
      })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, auth.user?.id])

  const registrantName = auth.profile?.display_name || t`Someone`

  // `chosen` comes from the attendance dialog. Without it, a new registration
  // on a type with an audience opens the dialog instead of registering.
  const handleRSVP = async (chosen?: AttendanceType) => {
    if (!event) return
    // AccountRoute keeps signed-out visitors off this page; this covers a
    // session that ended while it was open, where the button used to do nothing.
    if (!auth.user) {
      navigate('/login', { state: { from: location } })
      return
    }
    const asking = !myRsvp || myRsvp.status === 'declined'
    if (asking && offersViewing && !chosen) {
      setChoiceOpen(true)
      return
    }
    setChoiceOpen(false)
    // Passed down explicitly: the state update has not landed yet. Set anyway
    // because the IP gate and the registration form read it later.
    const type: AttendanceType = chosen ?? 'participant'
    if (asking) setAttendanceType(type)
    const entering = asking && !!event.has_challenge && type === 'participant'
    if (entering && entryGate.needsAgreement) {
      setEntryGateOpen(true)
      return
    }
    await proceedRSVP(type)
  }

  const proceedRSVP = async (attendanceType: AttendanceType) => {
    if (!auth.user || !event) return
    rsvpTouchedRef.current = true

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
    rsvpTouchedRef.current = true
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

  // Migration 111 — the registrant's own organisation may have switched
  // engagement off, or this event may be closed to the organiser's own staff.
  const gate = useEngagementGate(event)

  const canRSVP = (() => {
    if (!event) return false
    if (isPastEvent) return false
    if (isOrganizer) return false
    if (!gate.allowed) return false
    // A full event with an audience still opens the dialog, where spectating
    // is the one option left.
    if (offersViewing) return true
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

  // The canonical address, not window.location: the page may have been reached
  // by uuid or with ?from=setup, and neither belongs in a link someone shares.
  // Published (or finished) and not suspended is the same rule api/share.ts
  // applies; title and summary in the reader's language, dates from the row.
  const shareTarget =
    (event.status === 'published' || event.status === 'completed') &&
    (event.moderation_status ?? 'active') === 'active'
      ? eventTarget(
          {
            ...event,
            title: display.title,
            summary: display.summary,
            // The preview card shows the same picture as the hero (and the listing card).
            image_url: cardImageFor(event.image_url, event.id),
          },
          `${window.location.origin}${entityPath('event', event)}`
        )
      : null

  // Host tools live in the action card rather than the hero, so the hero keeps
  // its text layout and the page has one place to act from.
  const organizerTools = isOrganizer ? (
    <>
      {fromSetup && (
        <Link to={eventManagePath(event, { tab: 'overview', setup: true })}>
          <button className="px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 border border-ktip-sand-200 bg-ktip-cream text-ktip-sand-700 shadow-medium hover:bg-ktip-sand-50 transition-colors">
            <ArrowLeft size={14} />
            <Trans>Back to setup</Trans>
          </button>
        </Link>
      )}
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
      <Link to={`/events/${params.id}/manage`}>
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

  return (
    <>
      <PageHero
        eyebrow={t`Event Detail`}
        title={display.title}
        image={cardImageFor(event.image_url, event.id)}
        imageSeed={event.id}
        breadcrumb={breadcrumb}
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
          {/* Marks the title, summary and description above as machine output.
              Reference inequality is exact here: useTranslatedFields returns the
              original object untouched when nothing was replaced. */}
          {isMachineTranslated(event, translatedEvent) && <TranslatedMark source={event.title} />}
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
          <div className="min-w-0 lg:col-span-2">
            {/* Key facts. The hero already carries the title and photo, so the
                body opens on what a visitor checks first: when, where, room. */}
            <FactStrip
              facts={[
                {
                  key: 'dates',
                  label: <Trans>Dates</Trans>,
                  value: isSingleDay
                    ? format(startDate!, 'MMM d, yyyy')
                    : `${format(startDate!, 'MMM d')} – ${format(endDate!, 'MMM d, yyyy')}`,
                  sub: isSingleDay
                    ? format(startDate!, 'EEEE')
                    : `${format(startDate!, 'EEE')} – ${format(endDate!, 'EEE')}`,
                },
                {
                  key: 'time',
                  label: <Trans>Time</Trans>,
                  value: format(startDate!, 'h:mm a'),
                  sub: endDate && isSingleDay ? <Trans>until {format(endDate, 'h:mm a')}</Trans> : undefined,
                },
                {
                  key: 'where',
                  label: <Trans>Where</Trans>,
                  value: event.is_virtual ? t`Virtual` : display.location || t`In-Person`,
                  sub: event.has_venue ? <Trans>Virtual venue</Trans> : undefined,
                },
                {
                  key: 'places',
                  label: <Trans>Places</Trans>,
                  value: event.capacity ? `${rsvpCount} / ${event.capacity}` : rsvpCount,
                  sub: isFull ? <span className="text-red-600"><Trans>Full</Trans></span> : <Trans>participants</Trans>,
                  extra: event.capacity ? (
                    <span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded bg-ktip-sand-100">
                      <span
                        className="block h-full bg-ktip-tropical-500"
                        style={{ width: `${Math.min(100, (rsvpCount / event.capacity) * 100)}%` }}
                      />
                    </span>
                  ) : undefined,
                },
              ]}
            />

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

          {/* === Sidebar ===
              Wide screens: one column pinned beside the content, so the venue
              door and registration stay in reach while reading. Phones: the
              wrappers dissolve (display: contents) and the action card is
              ordered above the content, with the organizer card after it. */}
          <div className="contents lg:block lg:col-span-1">
            <div className="contents lg:block lg:sticky lg:top-[calc(var(--nav-offset)+1rem)] lg:max-h-[calc(100dvh-var(--nav-offset)-2rem)] lg:overflow-y-auto lg:space-y-8 lg:pb-2">
            <div className="order-first lg:order-none">
            <EventActionCard
              phase={phase}
              cancelled={event.status === 'cancelled'}
              start={startDate!}
              end={endDate ?? new Date(eventEndMs(event))}
              venueHref={event.has_venue ? venuePath(event) : null}
              approved={hasRSVPd && !isPending}
              isOrganizer={isOrganizer}
              shareTarget={shareTarget}
              organizerTools={organizerTools}
              attendeeLine={
                <Plural value={rsvpCount} one="# person attending" other="# people attending" />
              }
              registration={
            <>
              {checking && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                </div>
              )}

              {!checking && (
                <>
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
                              You asked to attend as a {i18n._(ATTENDANCE_TYPE_LABELS[myRsvp!.attendance_type])}. You'll be
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

                      {!gate.allowed && !myRsvp && (
                        <div className="mb-4">
                          <EngagementNotice verdict={gate} />
                        </div>
                      )}

                      {isFull && !myRsvp && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 text-red-700 mb-2">
                            <XCircle size={20} />
                            <span className="font-medium"><Trans>Event is full</Trans></span>
                          </div>
                          <p className="text-sm text-red-600">
                            <Trans>Every participant place has been taken.</Trans>
                            {offersViewing && <Trans> You can still register as a spectator.</Trans>}
                          </p>
                        </div>
                      )}

                      {/* 205: an unverified account reads the event but cannot
                          register, so it gets the reason instead of a button
                          RLS would refuse. A registration made before 205 can
                          still be withdrawn, so the button stays for that. */}
                      {auth.user && !auth.verified && !myRsvp ? (
                        <VerificationNotice action={t`register for events`} />
                      ) : (
                      <>
                      {/* The dialog asked before the form, not inside it: it
                          decides what you are registering as, which the form's
                          answers are then about. */}
                      {showRegForm && offersViewing && (
                        <p className="mb-3 text-sm text-ktip-sand-600">
                          <Trans>Registering as a {i18n._(ATTENDANCE_TYPE_LABELS[attendanceType])}.</Trans>{' '}
                          <button
                            type="button"
                            onClick={() => setChoiceOpen(true)}
                            disabled={regLoading}
                            className="font-medium text-ktip-ocean-600 hover:underline"
                          >
                            <Trans>Change</Trans>
                          </button>
                        </p>
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
                          onClick={() => handleRSVP()}
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
                    </>
                  )}
                </>
              )}
            </>
              }
            />
            </div>

            {/* Organizer */}
            <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5">
              <h3 className="font-display font-bold text-ktip-sand-600 uppercase text-xs tracking-wider mb-3">
                <Trans>Organized By</Trans>
              </h3>
              <div className="flex items-center gap-3">
                <DiamondAvatar
                  src={event.organizer?.avatar_url}
                  name={event.organizer?.display_name || t`Organizer`}
                  size={48}
                />
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openMember(event.organizer_id)}
                    className="font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors text-left break-words"
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
              {!isOrganizer && (
                <Button
                  variant="outline"
                  fullWidth
                  className="mt-4"
                  icon={<MessageSquare size={16} />}
                  onClick={() => openMessages({ userId: event.organizer_id })}
                >
                  <Trans>Contact Organizer</Trans>
                </Button>
              )}
            </div>

            <ReportInfringementLink targetType="event" targetId={event.id} />
            </div>
          </div>
        </div>
      </div>

      <AgreementGateModal
        gate={entryGate}
        bundle="competition"
        open={entryGateOpen}
        context="event_entry"
        onClose={() => setEntryGateOpen(false)}
        onAccepted={async () => {
          setEntryGateOpen(false)
          await proceedRSVP(attendanceType)
        }}
      />

      <AttendanceChoiceDialog
        open={choiceOpen}
        onClose={() => setChoiceOpen(false)}
        onConfirm={(type) => {
          // "Change" from beside the open form only swaps the answer; the
          // form is still the thing that registers. Unless the switch is to
          // competing, which has to pass the IP gate first; handleRSVP runs
          // it and reopens the form.
          const needsGate =
            type === 'participant' && !!event.has_challenge && entryGate.needsAgreement
          if (showRegForm && !needsGate) {
            setAttendanceType(type)
            setChoiceOpen(false)
            return
          }
          setShowRegForm(false)
          void handleRSVP(type)
        }}
        participantFull={isFull}
        hasChallenge={!!event.has_challenge}
        initial={attendanceType}
        loading={rsvpLoading}
      />
    </>
  )
}
