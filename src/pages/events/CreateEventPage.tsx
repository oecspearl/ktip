import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ModeratedInput, ModeratedTextarea } from '../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../components/moderation/ContentWarningModal'
import { useContentModeration } from '../../hooks/useContentModeration'
import { Stepper } from '../../components/ui/Stepper'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useCreateEvent } from '../../hooks/useEvents'
import { readDraft, useFormDraft } from '../../hooks/useFormDraft'
import { useUploadDocument } from '../../hooks/useEntityDocuments'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { useAgreementGate } from '../../hooks/useAgreementGate'
import { AgreementGateModal, AgreementNotice } from '../../components/legal/AgreementGate'
import { OrgEngagementFields } from '../../components/shared/OrgEngagementFields'
import { useManagedEmployers } from '../../hooks/useEngagement'
import { TagInput } from '../../components/ui/TagInput'
import { CalendarAccentPicker } from '../../components/calendar/CalendarAccentPicker'
import {
  CONTENT_TAG_SUGGESTIONS,
  EVENT_TYPE_LABELS,
  type CalendarAccent,
} from '../../lib/constants'
import { EVENT_TYPE_ICONS } from '../../lib/category-icons'
import {
  EVENT_BLUEPRINTS,
  EVENT_TYPE_ORDER,
  blueprintFor,
  setupSteps,
} from '../../lib/event-blueprints'
import { cn, sanitizeTag } from '../../lib/utils'
import type { DetailEntry } from '../../types'
import { eventSchema } from '../../lib/validation'
import {
  Save,
  Calendar,
  MapPin,
  Video,
  Users,
  Target,
  Trash2,
  FileText,
  Upload,
  ArrowRight,
  UserPlus,
  Timer,
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { analytics } from '../../hooks/useAnalytics'
import { format } from 'date-fns'
import { entityPath } from '../../lib/slug'
import { eventManagePath } from '../../lib/event-slug'
import { Trans, useLingui } from '@lingui/react/macro'

/** Formats accepted by the document scraper (plus plain text). */
const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.rtf'

/** Where the in-progress form lives between visits. See useFormDraft. */
const EVENT_DRAFT_KEY = 'ktip:draft:event-create'

/** The half of the form that can be serialized — everything except the files. */
type EventDraft = {
  title: string
  summary: string
  description: string
  tags: string[]
  eventType: string
  accentColor: CalendarAccent | null
  location: string
  isVirtual: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  capacity: number | undefined
  eventStatus: string
  submissionDate: string
  submissionTime: string
  regCloseDate: string
  regCloseTime: string
  teamSizeMin: number | undefined
  teamSizeMax: number | undefined
  details: DetailEntry[]
  presetIds: string[]
  employerId: string | null
  allowMemberEngagement: boolean | null
}


export default function CreateEventPage() {
    const { t } = useLingui()
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { createEvent, loading } = useCreateEvent()

  // Read once, before the state it seeds. Anything typed here survives leaving
  // the page and comes back until the tab is closed — see useFormDraft.
  const [draftSeed] = useState(() => readDraft<EventDraft>(EVENT_DRAFT_KEY))

  const [title, setTitle] = useState(draftSeed.title ?? '')
  const [summary, setSummary] = useState(draftSeed.summary ?? '')
  const [description, setDescription] = useState(draftSeed.description ?? '')

  const moderation = useContentModeration(
    [
      { name: 'title', value: title, label: t`Event Title` },
      { name: 'summary', value: summary, label: t`Summary` },
      { name: 'description', value: description, label: t`Description`, ai: true },
    ],
    {
      surface: 'event',
      onChange: (field, next) => {
        if (field === 'title') setTitle(next)
        else if (field === 'summary') setSummary(next)
        else setDescription(next)
      },
    }
  )
  const [tags, setTags] = useState<string[]>(draftSeed.tags ?? [])
  // Deliberately blank. The type decides which of the questions below even get
  // asked, so defaulting it to 'meetup' meant most events were created by
  // someone who never made the choice.
  const [eventType, setEventType] = useState(draftSeed.eventType ?? '')
  // null = follow the event type, which is what every event did before 105
  const [accentColor, setAccentColor] = useState<CalendarAccent | null>(
    draftSeed.accentColor ?? null
  )
  const [location, setLocation] = useState(draftSeed.location ?? '')
  const [isVirtual, setIsVirtual] = useState(draftSeed.isVirtual ?? false)
  const [startDate, setStartDate] = useState(draftSeed.startDate ?? '')
  const [startTime, setStartTime] = useState(draftSeed.startTime ?? '')
  const [endDate, setEndDate] = useState(draftSeed.endDate ?? '')
  const [endTime, setEndTime] = useState(draftSeed.endTime ?? '')
  const [capacity, setCapacity] = useState<number | undefined>(draftSeed.capacity)
  const [eventStatus, setEventStatus] = useState(draftSeed.eventStatus ?? 'published')
  const [submissionDate, setSubmissionDate] = useState(draftSeed.submissionDate ?? '')
  const [submissionTime, setSubmissionTime] = useState(draftSeed.submissionTime ?? '')
  const [regCloseDate, setRegCloseDate] = useState(draftSeed.regCloseDate ?? '')
  const [regCloseTime, setRegCloseTime] = useState(draftSeed.regCloseTime ?? '')
  const [teamSizeMin, setTeamSizeMin] = useState<number | undefined>(draftSeed.teamSizeMin)
  const [teamSizeMax, setTeamSizeMax] = useState<number | undefined>(draftSeed.teamSizeMax)
  // Files are the one thing a draft cannot hold — a File cannot be serialized
  // and no browser will hand one back without a fresh picker.
  const [documents, setDocuments] = useState<File[]>([])
  const [finishing, setFinishing] = useState(false)
  const [details, setDetails] = useState<DetailEntry[]>(draftSeed.details ?? [])
  // Which detail rows this page put there, so switching type can take back the
  // ones the user never filled in without touching anything they wrote.
  const [presetIds, setPresetIds] = useState<string[]>(draftSeed.presetIds ?? [])
  const [employerId, setEmployerId] = useState<string | null>(draftSeed.employerId ?? null)
  const [allowMemberEngagement, setAllowMemberEngagement] = useState<boolean | null>(
    draftSeed.allowMemberEngagement ?? null
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const gate = useAgreementGate('publishing')
  const [gateOpen, setGateOpen] = useState(false)
  // Non-null means "resume the create with these once the gate is accepted".
  const pendingDatetimes = useRef<{ startDatetime: string; endDatetime: string | undefined } | null>(
    null
  )

  // Everything above except the files, written back on every change.
  const { clear: clearDraft } = useFormDraft(EVENT_DRAFT_KEY, {
    title,
    summary,
    description,
    tags,
    eventType,
    accentColor,
    location,
    isVirtual,
    startDate,
    startTime,
    endDate,
    endTime,
    capacity,
    eventStatus,
    submissionDate,
    submissionTime,
    regCloseDate,
    regCloseTime,
    teamSizeMin,
    teamSizeMax,
    details,
    presetIds,
    employerId,
    allowMemberEngagement,
  })

  // Controls the draft/published selector. Capability, not slug: the literal
  // 'oecs' test meant an admin created after 063 could not choose a status and
  // silently published everything. (116: was org:manage.)
  const isAdmin = auth.can('event:manage')

  const managedEmployers = useManagedEmployers()

  // Everything type-specific below reads off this. No component compares
  // eventType to a string — that is what put the old branches in three places.
  const blueprint = blueprintFor(eventType)
  const typeChosen = eventType !== ''
  // A challenge has no room to be in, so the toggle is not offered and the
  // answer is fixed.
  const virtual = blueprint.format === 'virtual-only' ? true : isVirtual
  const showLocation = !virtual && blueprint.location !== 'hidden'

  const { uploadDocument } = useUploadDocument()

  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Changing type re-shapes the form under the user, so it also has to reset
   * the answers that no longer have a question, and swap the detail presets.
   */
  const chooseType = (next: string) => {
    const nextBlueprint = EVENT_BLUEPRINTS[next as keyof typeof EVENT_BLUEPRINTS]
    if (!nextBlueprint) return

    setEventType(next)
    setIsVirtual(nextBlueprint.defaultVirtual)
    setErrors({})

    if (nextBlueprint.endDate === 'hidden') {
      setEndDate('')
      setEndTime('')
    }
    if (nextBlueprint.capacity === 'hidden') setCapacity(undefined)
    if (!nextBlueprint.registrationCloses) {
      setRegCloseDate('')
      setRegCloseTime('')
    }
    if (!nextBlueprint.teamSize) {
      setTeamSizeMin(undefined)
      setTeamSizeMax(undefined)
    }
    if (!nextBlueprint.submissionDeadline) {
      setSubmissionDate('')
      setSubmissionTime('')
    }

    // Untouched presets from the old type go; anything the user typed stays.
    setDetails((prev) => {
      const kept = prev.filter(
        (entry) => !presetIds.includes(entry.id) || entry.value?.trim() || entry.items?.length
      )
      const seeded = nextBlueprint.detailPresets.map((label) => ({
        id: crypto.randomUUID(),
        label,
        value: '',
      }))
      setPresetIds(seeded.map((entry) => entry.id))
      return [...kept, ...seeded]
    })
  }

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    setDocuments((prev) => {
      const next = [...prev]
      for (const file of Array.from(list)) {
        // Same file picked twice is a duplicate row, not a second upload
        if (!next.some((f) => f.name === file.name && f.size === file.size)) {
          next.push(file)
        }
      }
      return next
    })
  }

  /** Schema field name → the label the user actually sees on the input. */
  const FIELD_LABELS: Record<string, string> = {
    title: t`Event Title`,
    summary: t`Summary`,
    description: t`Description`,
    tags: t`Tags`,
    event_type: t`Event Type`,
    location: t`Location`,
    start_date: t`Start Date`,
    end_date: t`End Date`,
    capacity: blueprint.capacityLabel || t`Capacity`,
    registration_closes_at: t`Registration closes`,
    team_size: t`Team size`,
  }

  /**
   * Every inline error on this form sits beside its input, and the inputs are
   * roughly 800px above the submit button. Without this, a validation failure
   * is indistinguishable from a dead button — which is exactly how it was
   * reported. So a failure always does two things: names the fields in a banner
   * rendered on both sides of the form, and scrolls back to them.
   */
  const surfaceError = (message: string) => {
    setErrorMessage(message)
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const combineDatetime = (date: string, time: string): string => {
    if (!date) return ''
    const datetime = time ? `${date}T${time}:00` : `${date}T00:00:00`
    return new Date(datetime).toISOString()
  }

  /**
   * The rules zod cannot express, because they depend on the blueprint rather
   * than on the shape of the row. Same error map, so they surface in the same
   * banner as everything else.
   */
  const blueprintErrors = (): Record<string, string> => {
    const found: Record<string, string> = {}

    if (!typeChosen) {
      found.event_type = t`Pick what kind of event this is`
      return found
    }
    if (blueprint.endDate === 'required' && !endDate) {
      found.end_date = t`This event type runs to a finish — say when`
    }
    if (blueprint.capacity === 'required' && !capacity) {
      found.capacity = t`${blueprint.capacityLabel} is required for a ${EVENT_TYPE_LABELS[eventType]}`
    }
    if (blueprint.teamSize && teamSizeMin && teamSizeMax && teamSizeMax < teamSizeMin) {
      found.team_size = t`The largest team cannot be smaller than the smallest`
    }
    // A deadline the event has already started past is a deadline nobody can meet
    if (regCloseDate && startDate && regCloseDate > startDate) {
      found.registration_closes_at = t`Registration cannot close after the event starts`
    }
    return found
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const startDatetime = combineDatetime(startDate, startTime)
    const endDatetime =
      blueprint.endDate !== 'hidden' && endDate ? combineDatetime(endDate, endTime) : undefined

    // Validate form
    const result = eventSchema.safeParse({
      title,
      description,
      event_type: eventType,
      location: virtual ? 'Virtual' : location,
      is_virtual: virtual,
      start_date: startDatetime,
      end_date: endDatetime,
      capacity,
    })

    const fieldErrors: Record<string, string> = {}
    if (!result.success) {
      result.error.issues.forEach((error: any) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as string] = error.message
        }
      })
    }
    Object.assign(fieldErrors, blueprintErrors())

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)

      const named = Object.keys(fieldErrors).map((key) => FIELD_LABELS[key] || key)
      const fieldCount = named.length
      const fieldMessage = fieldErrors[Object.keys(fieldErrors)[0]]
      const fieldList = named.join(', ')
      surfaceError(
        fieldCount === 1
          ? t`${named[0]}: ${fieldMessage}`
          : t`Please fix ${fieldCount} fields before creating this event: ${fieldList}.`
      )
      return
    }

    const moderationResult = await moderation.checkBeforeSubmit()
    if (!moderationResult.ok) {
      setErrors((prev) => ({ ...prev, ...moderationResult.errors }))
      return
    }

    // Only after every field error is resolved. This form is long enough that
    // opening a licensing agreement over a failed validation would be actively
    // hostile.
    if (gate.needsAgreement) {
      // The validated datetimes are held rather than recomputed after the modal
      // closes: the member could not have edited the form while it was open, and
      // recomputing would silently re-derive them from state that the resume
      // path has no reason to trust more than the values that just passed
      // validation.
      pendingDatetimes.current = { startDatetime, endDatetime }
      setGateOpen(true)
      return
    }

    await createEventNow(startDatetime, endDatetime)
  }

  const createEventNow = async (startDatetime: string, endDatetime: string | undefined) => {
    try {
      const event = await createEvent({
        title,
        summary: summary.trim() || null,
        tags: tags.map(sanitizeTag).filter(Boolean),
        description,
        event_type: eventType,
        accent_color: accentColor,
        location: virtual ? 'Virtual' : location,
        is_virtual: virtual,
        start_date: startDatetime,
        end_date: endDatetime,
        capacity,
        organizer_id: auth.user!.id,
        // The flags the type implies — a hackathon always has a venue, and
        // anything that takes submissions needs the criteria machinery.
        ...blueprint.onCreate,
        submission_deadline:
          blueprint.submissionDeadline && submissionDate
            ? combineDatetime(submissionDate, submissionTime)
            : null,
        registration_closes_at:
          blueprint.registrationCloses && regCloseDate
            ? combineDatetime(regCloseDate, regCloseTime)
            : null,
        team_size_min: blueprint.teamSize ? (teamSizeMin ?? null) : null,
        team_size_max: blueprint.teamSize ? (teamSizeMax ?? null) : null,
        details: cleanDetails(details),
        employer_id: employerId,
        allow_member_engagement: employerId ? allowMemberEngagement : null,
        ...(isAdmin ? { status: eventStatus } : {}),
      })

      // The event exists from here on. Documents are attachments — a failure
      // downgrades to a warning (they can be added from the event page), it
      // never strands the user on the form with a created event behind it.
      setFinishing(true)
      const attachmentErrors: string[] = []

      for (const file of documents) {
        try {
          await uploadDocument({
            entityType: 'event',
            entityId: event.id,
            ownerId: auth.user!.id,
            file,
            title: file.name.replace(/\.[^.]+$/, ''),
            visibility: 'public',
            // No AI field extraction for events — the file itself is the point
            skipExtraction: true,
          })
        } catch {
          attachmentErrors.push(file.name)
        }
      }

      // The event is real now, so the draft is not a draft any more. Left
      // behind, it would repopulate the form the next time someone creates one.
      clearDraft()

      analytics.feature('event', 'created')
      if (attachmentErrors.length > 0) {
        const failedNames = attachmentErrors.join(', ')
        toast.error(
          t`Event created, but some attachments failed: ${failedNames}. You can add them from the event page.`
        )
      } else {
        toast.success(t`Event created successfully!`)
      }
      // Most types are a two-step job: the listing, then the thing that makes
      // the listing worth reading. Step two is the management console opened
      // in setup mode on the first tab this type needs — the same console the
      // host will run the event from, so there is no second place to learn.
      const steps = setupSteps(event.event_type)
      navigate(
        steps[1]?.tab
          ? eventManagePath(event, { tab: steps[1].tab, setup: true })
          : entityPath('event', event)
      )
    } catch (error: any) {
      // A row-level-security refusal or a missing column arrives here. The toast
      // dismisses itself after 4s, so the banner is the durable copy.
      toast.error(error.message || t`Failed to create event`)
      surfaceError(error.message || t`Failed to create event`)
    } finally {
      setFinishing(false)
    }
  }

  // Set default date to today
  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <>
      <PageHero
        eyebrow={t`Create New Event`}
        title={t`New Event`}
        imageSeed="events"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Events`, href: '/events' },
          { label: t`Create` },
        ]}
      />

      {/* Form Area */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-tight mx-auto px-4">
          {/* Only drawn once the type is known and that type has a step two —
              a one-step stepper is just a label. */}
          {blueprint.setup && typeChosen && (
            <Stepper
              steps={setupSteps(eventType).map((step) => step.label)}
              currentStep={0}
              className="mb-8"
            />
          )}

          <form data-tutorial="event-form" ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
              >
                {errorMessage}
              </div>
            )}

            {/* Event Type — first, because it decides which of the questions
                below are even asked. */}
            <div data-tutorial="event-form-type">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                <Trans>What kind of event is this?</Trans> <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-ktip-sand-500 mb-3">
                <Trans>This decides what else we ask you for, and what you set up next.</Trans>
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {EVENT_TYPE_ORDER.map((type) => {
                  const option = EVENT_BLUEPRINTS[type]
                  const Icon = EVENT_TYPE_ICONS[type]
                  const selected = eventType === type

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => chooseType(type)}
                      aria-pressed={selected}
                      className={cn(
                        'rounded-xl border-2 p-4 text-left transition-colors',
                        selected
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
                          : 'border-ktip-sand-200 bg-ktip-cream hover:border-ktip-ocean-300'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            size={18}
                            className={selected ? 'text-ktip-ocean-600' : 'text-ktip-sand-500'}
                          />
                        )}
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            selected ? 'text-ktip-ocean-700' : 'text-ktip-sand-800'
                          )}
                        >
                          {EVENT_TYPE_LABELS[type]}
                        </span>
                      </span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-ktip-sand-500">
                        {option.tagline}
                      </span>
                    </button>
                  )
                })}
              </div>
              {errors.event_type && (
                <p className="mt-2 text-sm text-red-600">{errors.event_type}</p>
              )}
              {blueprint.setup && typeChosen && (
                <p className="mt-2 text-xs text-ktip-sand-500">
                  <Trans>After you create it, the next screen is where you {blueprint.setup.label}.</Trans>{' '}
                  {blueprint.setup.blurb}
                </p>
              )}
            </div>

            {/* Title */}
            <ModeratedInput
              label={t`Event Title`}
              placeholder={t`e.g., Caribbean Tech Summit 2025`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              moderation={moderation.fields.title}
              fullWidth
              required
            />

            {/* Summary */}
            <Input
              label={t`Summary`}
              placeholder={t`One short sentence shown on the homepage hero (optional)`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              fullWidth
            />

            {/* Description */}
            <ModeratedTextarea
              label={t`Description`}
              placeholder={t`Describe your event, agenda, and what participants can expect...`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              moderation={moderation.fields.description}
              fullWidth
            />

            <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />

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

            <OrgEngagementFields
              options={managedEmployers}
              employerId={employerId}
              onEmployerChange={setEmployerId}
              override={allowMemberEngagement}
              onOverrideChange={setAllowMemberEngagement}
              itemNoun={t`event`}
            />

            {/* Event Status (Admin only) */}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                  <Trans>Event Status</Trans>
                </label>
                <select
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                >
                  <option value="draft"><Trans>Draft - Not visible to public</Trans></option>
                  <option value="published"><Trans>Published - Visible to everyone</Trans></option>
                </select>
                <p className="mt-1 text-xs text-ktip-sand-500">
                  <Trans>Draft events are only visible to administrators</Trans>
                </p>
              </div>
            )}

            {/* Virtual Toggle — not offered for a type that can only be virtual */}
            {blueprint.format === 'choice' && (
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
            )}

            {/* Location (if not virtual) */}
            {showLocation && (
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
                    min={today}
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

            {/* End Date and Time — hidden for a type with no run time */}
            {blueprint.endDate !== 'hidden' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                    <Trans>End Date</Trans>{' '}
                    {blueprint.endDate === 'required' ? (
                      <span className="text-red-500">*</span>
                    ) : (
                      t`(Optional)`
                    )}
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
                      min={startDate || today}
                      className="w-full pl-10 pr-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                    />
                  </div>
                  {errors.end_date && (
                    <p className="mt-1 text-sm text-red-600">{errors.end_date}</p>
                  )}
                </div>

                <Input
                  label={t`End Time (Optional)`}
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  fullWidth
                />
              </div>
            )}

            {/* Registration deadline — almost never the moment the event starts */}
            {blueprint.registrationCloses && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                    <Trans>Registration Closes (Optional)</Trans>
                  </label>
                  <div className="relative">
                    <Timer
                      size={20}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400 pointer-events-none"
                    />
                    <input
                      type="date"
                      value={regCloseDate}
                      onChange={(e) => setRegCloseDate(e.target.value)}
                      min={today}
                      max={startDate || undefined}
                      className="w-full pl-10 pr-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                    />
                  </div>
                  {errors.registration_closes_at && (
                    <p className="mt-1 text-sm text-red-600">{errors.registration_closes_at}</p>
                  )}
                  <p className="mt-1 text-xs text-ktip-sand-500">
                    <Trans>Sign-ups are refused after this. Leave empty to stay open until it starts.</Trans>
                  </p>
                </div>

                <Input
                  label={t`Closing Time (Optional)`}
                  type="time"
                  value={regCloseTime}
                  onChange={(e) => setRegCloseTime(e.target.value)}
                  fullWidth
                />
              </div>
            )}

            {/* Capacity — named for the type, and required where it matters */}
            {blueprint.capacity !== 'hidden' && (
              <Input
                label={blueprint.capacityLabel}
                type="number"
                min={1}
                placeholder={t`Maximum number of attendees`}
                value={capacity?.toString() || ''}
                onChange={(e) =>
                  setCapacity(
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                error={errors.capacity}
                icon={<Users size={20} />}
                helperText={blueprint.capacityHelp}
                required={blueprint.capacity === 'required'}
                fullWidth
              />
            )}

            {/* Team size — for the types that are entered by teams, not people */}
            {blueprint.teamSize && (
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                  <Trans>Team Size (Optional)</Trans>
                </label>
                <p className="text-xs text-ktip-sand-500 mb-2">
                  <Trans>Leave both empty if people can enter on their own.</Trans>
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    label={t`Smallest team`}
                    type="number"
                    min={1}
                    placeholder={t`e.g. 2`}
                    value={teamSizeMin?.toString() || ''}
                    onChange={(e) =>
                      setTeamSizeMin(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    icon={<UserPlus size={20} />}
                    fullWidth
                  />
                  <Input
                    label={t`Largest team`}
                    type="number"
                    min={1}
                    placeholder={t`e.g. 5`}
                    value={teamSizeMax?.toString() || ''}
                    onChange={(e) =>
                      setTeamSizeMax(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    icon={<UserPlus size={20} />}
                    fullWidth
                  />
                </div>
                {errors.team_size && (
                  <p className="mt-1 text-sm text-red-600">{errors.team_size}</p>
                )}
              </div>
            )}

            {/* Submissions — for every type where something gets handed in */}
            {blueprint.submissionDeadline && (
              <div
                data-tutorial="event-form-challenge"
                className="border-2 border-ktip-sand-200 rounded-xl p-4 space-y-4"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
                  <Target size={18} className="text-ktip-sand-600" />
                  <Trans>Submissions</Trans>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
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
                        min={today}
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

                <p className="text-xs text-ktip-sand-500">
                  <Trans>Participants submit their work — with their own supporting files — from the event page, up until the deadline above.</Trans>
                </p>
              </div>
            )}

            {/* Documents */}
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                <Trans>Documents (Optional)</Trans>
              </label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                <Trans>Briefs, rules, datasets or any other files attendees should have. Uploaded once the event is created.</Trans>
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={DOCUMENT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />

              {documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {documents.map((file, index) => {
                    const sizeMb = (file.size / 1024 / 1024).toFixed(1)
                    return (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-3 border border-ktip-sand-200 rounded-xl px-3 py-2"
                    >
                      <FileText size={18} className="flex-shrink-0 text-ktip-sand-500" />
                      <span className="flex-1 min-w-0 truncate text-sm text-ktip-sand-800">
                        {file.name}
                      </span>
                      <span className="flex-shrink-0 text-xs text-ktip-sand-500">
                        {t`${sizeMb} MB`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== index))}
                        className="p-1 text-ktip-sand-400 hover:text-red-600 transition-colors"
                        title={t`Remove file`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-ktip-sand-300 rounded-xl text-sm text-ktip-sand-600 hover:border-ktip-ocean-400 hover:text-ktip-ocean-600 transition-colors"
              >
                <Upload size={16} />
                <Trans>Add document files</Trans>
              </button>
            </div>

            {/*
              Second copy of the banner, next to the button. The first one is at
              the top of a form this long, which is nowhere near where the user
              is looking when they click submit.
            */}
            {errorMessage && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
              >
                {errorMessage}
              </div>
            )}

            {/* Submit Button — most types are a two-step create, so the button
                says where it is going rather than pretending this is the end. */}
            <AgreementNotice bundle="publishing" />

            <div className="flex items-center gap-4">
              <Button
                type="submit"
                loading={loading || finishing}
                icon={blueprint.setup ? <ArrowRight size={20} /> : <Save size={20} />}
                fullWidth
              >
                {finishing
                  ? t`Uploading attachments…`
                  : blueprint.setup && typeChosen
                    ? t`Next: ${blueprint.setup.label}`
                    : t`Create Event`}
              </Button>
              {/* Cancel is the one exit that means "I am not making this",
                  so it is also the one that throws the draft away. Navigating
                  anywhere else keeps it. */}
              <button
                type="button"
                onClick={() => {
                  clearDraft()
                  navigate('/events')
                }}
                disabled={loading || finishing}
                className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
              >
                <Trans>Cancel</Trans>
              </button>
            </div>
          </form>
        </div>
      </div>

      <AgreementGateModal
        gate={gate}
        bundle="publishing"
        open={gateOpen}
        context="event"
        onClose={() => {
          setGateOpen(false)
          pendingDatetimes.current = null
        }}
        onAccepted={async () => {
          setGateOpen(false)
          const pending = pendingDatetimes.current
          pendingDatetimes.current = null
          if (pending) {
            await createEventNow(pending.startDatetime, pending.endDatetime)
          }
        }}
      />
    </>
  )
}
