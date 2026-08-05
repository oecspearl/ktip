import { useRef, useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useEvent, useUpdateEvent, useDeleteEvent } from '../../hooks/useEvents'
import { DeleteEntityControl } from '../../components/shared/DeleteEntityControl'
import { describeEventDeletion } from '../../lib/delete-guard'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { TagInput } from '../../components/ui/TagInput'
import { CalendarAccentPicker } from '../../components/calendar/CalendarAccentPicker'
import { CONTENT_TAG_SUGGESTIONS, type CalendarAccent } from '../../lib/constants'
import { sanitizeTag } from '../../lib/utils'
import type { DetailEntry } from '../../types'
import { eventSchema } from '../../lib/validation'
import { Save, Calendar, MapPin, Video, Users, Target } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'

export default function EditEventPage() {
    const { t } = useLingui()
  const params = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { event, loading: eventLoading } = useEvent(params.id)
  const { updateEvent, loading: updating } = useUpdateEvent()
  const { deleteEvent } = useDeleteEvent()

  usePageTitle(event?.title ? t`Edit: ${event.title}` : t`Edit Event`)

  const [initialized, setInitialized] = useState(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [eventType, setEventType] = useState('meetup')
  // null = follow the event type, which is what every event did before 105
  const [accentColor, setAccentColor] = useState<CalendarAccent | null>(null)
  const [location, setLocation] = useState('')
  const [isVirtual, setIsVirtual] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [capacity, setCapacity] = useState<number | undefined>(undefined)
  const [hasChallenge, setHasChallenge] = useState(false)
  const [submissionDate, setSubmissionDate] = useState('')
  const [submissionTime, setSubmissionTime] = useState('')
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const formRef = useRef<HTMLFormElement>(null)

  // The Challenge event type always runs a brief; other types can still opt in
  // via the checkbox (existing hackathons/workshops keep their challenges).
  const isChallengeEvent = eventType === 'challenge'
  const challengeOn = isChallengeEvent || hasChallenge

  /** Schema field name -> the label the user actually sees on the input. */
  const FIELD_LABELS: Record<string, string> = {
    title: t`Event Title`,
    description: t`Description`,
    event_type: t`Event Type`,
    location: t`Location`,
    start_date: t`Start Date`,
    end_date: t`End Date`,
    capacity: t`Capacity`,
  }

  /**
   * Inline errors sit beside their inputs, hundreds of pixels above the submit
   * button on a form this long, so a failure reads as a dead button. Every
   * failure names its fields in a banner rendered at both ends of the form and
   * scrolls back to them.
   */
  const surfaceError = (message: string) => {
    setErrorMessage(message)
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  useEffect(() => {
    if (event && !initialized) {
      setTitle(event.title || '')
      setSummary(event.summary || '')
      setDescription(event.description || '')
      setTags(event.tags || [])
      setEventType(event.event_type || 'meetup')
      setAccentColor(event.accent_color ?? null)
      setLocation(event.location || '')
      setIsVirtual(event.is_virtual ?? false)
      setCapacity(event.capacity ?? undefined)
      setHasChallenge(event.has_challenge ?? false)
      setDetails(event.details || [])

      if (event.submission_deadline) {
        const d = new Date(event.submission_deadline)
        setSubmissionDate(d.toISOString().split('T')[0])
        setSubmissionTime(d.toTimeString().slice(0, 5))
      }

      if (event.start_date) {
        const d = new Date(event.start_date)
        setStartDate(d.toISOString().split('T')[0])
        setStartTime(d.toTimeString().slice(0, 5))
      }

      if (event.end_date) {
        const d = new Date(event.end_date)
        setEndDate(d.toISOString().split('T')[0])
        setEndTime(d.toTimeString().slice(0, 5))
      }

      setInitialized(true)
    }
  }, [event, initialized])

  const isOwner = event?.organizer_id === auth.user?.id

  const combineDatetime = (date: string, time: string): string => {
    if (!date) return ''
    const datetime = time ? `${date}T${time}:00` : `${date}T00:00:00`
    return new Date(datetime).toISOString()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const startDatetime = combineDatetime(startDate, startTime)
    const endDatetime = endDate
      ? combineDatetime(endDate, endTime)
      : undefined

    const result = eventSchema.safeParse({
      title,
      description,
      event_type: eventType,
      location: isVirtual ? 'Virtual' : location,
      is_virtual: isVirtual,
      start_date: startDatetime,
      end_date: endDatetime,
      capacity,
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((error: any) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as string] = error.message
        }
      })
      setErrors(fieldErrors)

      const named = Object.keys(fieldErrors).map((key) => FIELD_LABELS[key] || key)
      const fieldCount = named.length
      const fieldMessage = fieldErrors[Object.keys(fieldErrors)[0]]
      const fieldList = named.join(', ')
      surfaceError(
        fieldCount === 1
          ? t`${named[0]}: ${fieldMessage}`
          : t`Please fix ${fieldCount} fields before saving: ${fieldList}.`
      )
      return
    }

    try {
      await updateEvent(params.id!, {
        title,
        summary: summary.trim() || null,
        tags: tags.map(sanitizeTag).filter(Boolean),
        description,
        event_type: eventType as any,
        accent_color: accentColor,
        location: isVirtual ? 'Virtual' : location,
        is_virtual: isVirtual,
        start_date: startDatetime,
        end_date: endDatetime,
        capacity,
        has_challenge: challengeOn,
        submission_deadline:
          challengeOn && submissionDate
            ? combineDatetime(submissionDate, submissionTime)
            : null,
        details: cleanDetails(details),
      } as any)

      toast.success(t`Event updated successfully!`)
      navigate(`/events/${params.id}`)
    } catch (error: any) {
      // A row-level-security refusal arrives here. The toast dismisses itself
      // after 4s, so the banner is the durable copy.
      toast.error(error.message || t`Failed to update event`)
      surfaceError(error.message || t`Failed to update event`)
    }
  }

  if (eventLoading || !event) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
        <p className="mt-4 text-ktip-sand-600"><Trans>Loading event...</Trans></p>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
          <Trans>Not authorized</Trans>
        </h2>
        <p className="text-ktip-sand-600 mb-6"><Trans>You can only edit your own events.</Trans></p>
        <Button onClick={() => navigate(`/events/${params.id}`)}>
          <Trans>Back to Event</Trans>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Event Workspace`}
        title={t`Edit Event`}
        imageSeed="events"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Events`, href: '/events' },
          { label: t`Edit` },
        ]}
      />

      {/* Form Area */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          <form data-tutorial="event-form" ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
              >
                {errorMessage}
              </div>
            )}

            {/* Title */}
            <Input
              label={t`Event Title`}
              placeholder={t`e.g., Caribbean Tech Summit 2025`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              fullWidth
              required
            />

            {/* Description */}
            <Input
              label={t`Summary`}
              placeholder={t`One short sentence shown on the homepage hero (optional)`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              fullWidth
            />

            <Textarea
              label={t`Description`}
              placeholder={t`Describe your event, agenda, and what participants can expect...`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              fullWidth
            />

            {/* Tags */}
            <TagInput
              label={t`Tags`}
              description={t`Topics attendees can filter and search by.`}
              values={tags}
              onChange={setTags}
              suggestions={CONTENT_TAG_SUGGESTIONS}
              max={10}
            />

            {/* Calendar colour */}
            <div>
              <label className="mb-1 block text-sm font-medium text-ktip-sand-700">
                <Trans>Calendar colour</Trans>
              </label>
              <p className="mb-2 text-sm text-ktip-sand-600">
                <Trans>
                  How this event is coloured on the calendar. Leave it on Auto to follow the event
                  type.
                </Trans>
              </p>
              <CalendarAccentPicker value={accentColor} onChange={setAccentColor} allowClear />
            </div>

            {/* Additional Details */}
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                <Trans>Additional Details</Trans>
              </label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                <Trans>Optional extra metadata shown under the description — add standalone fields or groups of items</Trans>
              </p>
              <DetailsEditor value={details} onChange={setDetails} />
            </div>

            {/* Event Type */}
            <div data-tutorial="event-form-type">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                <Trans>Event Type</Trans> <span className="text-red-500">*</span>
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              >
                <option value="hackathon"><Trans>Hackathon</Trans></option>
                <option value="workshop"><Trans>Workshop</Trans></option>
                <option value="meetup"><Trans>Meetup</Trans></option>
                <option value="conference"><Trans>Conference</Trans></option>
                <option value="demo_day"><Trans>Demo Day</Trans></option>
                <option value="challenge"><Trans>Challenge</Trans></option>
              </select>
            </div>

            {/* Virtual Toggle */}
            <div data-tutorial="event-form-venue" className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVirtual}
                  onChange={(e) => setIsVirtual(e.target.checked)}
                  className="w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
                />
                <div className="flex items-center gap-2">
                  <Video size={18} className="text-ktip-sand-600" />
                  <span className="text-sm text-ktip-sand-700">
                    <Trans>This is a virtual event</Trans>
                  </span>
                </div>
              </label>
            </div>

            {/* Location (if not virtual) */}
            {!isVirtual && (
              <Input
                label={t`Location`}
                placeholder={t`e.g., Innovation Hub, Kingston, Jamaica`}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                error={errors.location}
                icon={<MapPin size={20} />}
                fullWidth
                required
              />
            )}

            {/* Date and Time */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                  <Trans>Start Date</Trans> <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar
                    size={20}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400 pointer-events-none"
                  />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                    required
                  />
                </div>
                {errors.start_date && (
                  <p className="mt-1 text-sm text-red-600">{errors.start_date}</p>
                )}
              </div>

              {/* Start Time */}
              <Input
                label={t`Start Time`}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                fullWidth
                required
              />
            </div>

            {/* End Date and Time (Optional) */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                  <Trans>End Date (Optional)</Trans>
                </label>
                <div className="relative">
                  <Calendar
                    size={20}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400 pointer-events-none"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="w-full pl-10 pr-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <Input
                label={t`End Time (Optional)`}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                fullWidth
              />
            </div>

            {/* Capacity */}
            <Input
              label={t`Capacity (Optional)`}
              type="number"
              placeholder={t`Maximum number of attendees`}
              value={capacity?.toString() || ''}
              onChange={(e) =>
                setCapacity(
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              error={errors.capacity}
              icon={<Users size={20} />}
              helperText={t`Leave empty for unlimited capacity`}
              fullWidth
            />

            {/* Challenge */}
            <div data-tutorial="event-form-challenge" className="border-2 border-ktip-sand-200 rounded-xl p-4 space-y-4">
              {isChallengeEvent ? (
                <div>
                  <span className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
                    <Target size={18} className="text-ktip-sand-600" />
                    <Trans>Challenge Details</Trans>
                  </span>
                  <span className="block text-xs text-ktip-sand-500 mt-0.5">
                    <Trans>Challenge events always set a goal for attendees. Solutions, objectives, constraints, deliverables and judging criteria are managed from the event's Challenge tab.</Trans>
                  </span>
                </div>
              ) : (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasChallenge}
                    onChange={(e) => setHasChallenge(e.target.checked)}
                    className="mt-0.5 w-5 h-5 text-ktip-ocean-600 border-ktip-sand-300 rounded focus:ring-ktip-ocean-500"
                  />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
                      <Target size={18} className="text-ktip-sand-600" />
                      <Trans>This event sets a challenge</Trans>
                    </span>
                    <span className="block text-xs text-ktip-sand-500 mt-0.5">
                      <Trans>Attendees are given a goal to accomplish. Objectives, constraints, deliverables and judging criteria are managed from the event's Challenge tab.</Trans>
                    </span>
                  </span>
                </label>
              )}

              {challengeOn && (
                <div className="grid md:grid-cols-2 gap-4 pl-8">
                  <div>
                    <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                      <Trans>Submission Deadline (Optional)</Trans>
                    </label>
                    <div className="relative">
                      <Calendar
                        size={20}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400 pointer-events-none"
                      />
                      <input
                        type="date"
                        value={submissionDate}
                        onChange={(e) => setSubmissionDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <Input
                    label={t`Deadline Time (Optional)`}
                    type="time"
                    value={submissionTime}
                    onChange={(e) => setSubmissionTime(e.target.value)}
                    fullWidth
                  />
                </div>
              )}
            </div>

            {/* Second copy, next to the button — where the user is looking. */}
            {errorMessage && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
              >
                {errorMessage}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center gap-4">
              <Button type="submit" loading={updating} icon={<Save size={20} />} fullWidth>
                <Trans>Save Changes</Trans>
              </Button>
              <button
                type="button"
                onClick={() => navigate(`/events/${params.id}`)}
                disabled={updating}
                className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
              >
                <Trans>Cancel</Trans>
              </button>
            </div>
          </form>

          {/* Outside the form so Enter in a text field can never reach it.
              The RSVP count is not loaded on this page, so the guard gets null
              and falls back to the event's publication status. */}
          <div className="mt-10">
            <DeleteEntityControl
              variant="zone"
              noun="event"
              title={event.title}
              impact={describeEventDeletion({
                status: event.status,
                rsvpCount: null,
                hasVenue: !!event.has_venue,
                hasChallenge: !!event.has_challenge,
              })}
              onDelete={() => deleteEvent(event.id)}
              redirectTo="/events"
            />
          </div>
        </div>
      </div>
    </>
  )
}
