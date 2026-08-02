import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useCreateEvent } from '../../hooks/useEvents'
import { useUploadDocument } from '../../hooks/useEntityDocuments'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { TagInput } from '../../components/ui/TagInput'
import { CONTENT_TAG_SUGGESTIONS } from '../../lib/constants'
import { sanitizeTag } from '../../lib/utils'
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
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { analytics } from '../../hooks/useAnalytics'
import { format } from 'date-fns'
import { entityPath } from '../../lib/slug'

/** Formats accepted by the document scraper (plus plain text). */
const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.rtf'

export default function CreateEventPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { createEvent, loading } = useCreateEvent()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [eventType, setEventType] = useState('meetup')
  const [location, setLocation] = useState('')
  const [isVirtual, setIsVirtual] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [capacity, setCapacity] = useState<number | undefined>(undefined)
  const [eventStatus, setEventStatus] = useState('published')
  const [submissionDate, setSubmissionDate] = useState('')
  const [submissionTime, setSubmissionTime] = useState('')
  const [documents, setDocuments] = useState<File[]>([])
  const [finishing, setFinishing] = useState(false)
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  // Controls the draft/published selector. Capability, not slug: the literal
  // 'oecs' test meant an admin created after 063 could not choose a status and
  // silently published everything.
  const isAdmin = auth.can('org:manage')

  // The old "sets a challenge" checkbox is gone — picking the Challenge event
  // type is what switches the brief on.
  const isChallengeEvent = eventType === 'challenge'

  const { uploadDocument } = useUploadDocument()

  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    title: 'Event Title',
    description: 'Description',
    event_type: 'Event Type',
    location: 'Location',
    start_date: 'Start Date',
    end_date: 'End Date',
    capacity: 'Capacity',
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setErrorMessage('')

    const startDatetime = combineDatetime(startDate, startTime)
    const endDatetime = endDate
      ? combineDatetime(endDate, endTime)
      : undefined

    // Validate form
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
      surfaceError(
        named.length === 1
          ? `${named[0]}: ${fieldErrors[Object.keys(fieldErrors)[0]]}`
          : `Please fix ${named.length} fields before creating this event: ${named.join(', ')}.`
      )
      return
    }

    try {
      const event = await createEvent({
        title,
        summary: summary.trim() || null,
        tags: tags.map(sanitizeTag).filter(Boolean),
        description,
        event_type: eventType as any,
        location: isVirtual ? 'Virtual' : location,
        is_virtual: isVirtual,
        start_date: startDatetime,
        end_date: endDatetime,
        capacity,
        organizer_id: auth.user!.id,
        has_challenge: isChallengeEvent,
        submission_deadline:
          isChallengeEvent && submissionDate
            ? combineDatetime(submissionDate, submissionTime)
            : null,
        details: cleanDetails(details),
        ...(isAdmin ? { status: eventStatus } : {}),
      } as any)

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

      analytics.feature('event', 'created')
      if (attachmentErrors.length > 0) {
        toast.error(
          `Event created, but some attachments failed: ${attachmentErrors.join(', ')}. You can add them from the event page.`
        )
      } else {
        toast.success('Event created successfully!')
      }
      navigate(entityPath('event', event))
    } catch (error: any) {
      // A row-level-security refusal or a missing column arrives here. The toast
      // dismisses itself after 4s, so the banner is the durable copy.
      toast.error(error.message || 'Failed to create event')
      surfaceError(error.message || 'Failed to create event')
    } finally {
      setFinishing(false)
    }
  }

  // Set default date to today
  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <>
      <PageHero
        eyebrow="Create New Event"
        title="New Event"
        imageSeed="events"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Create' },
        ]}
      />

      {/* Form Area */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-[calc(50vw+24rem)] mx-auto px-4">
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
              label="Event Title"
              placeholder="e.g., Caribbean Tech Summit 2025"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              fullWidth
              required
            />

            {/* Summary */}
            <Input
              label="Summary"
              placeholder="One short sentence shown on the homepage hero (optional)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={180}
              fullWidth
            />

            {/* Description */}
            <Textarea
              label="Description"
              placeholder="Describe your event, agenda, and what participants can expect..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              rows={6}
              fullWidth
            />

            {/* Tags */}
            <TagInput
              label="Tags"
              description="Topics attendees can filter and search by."
              values={tags}
              onChange={setTags}
              suggestions={CONTENT_TAG_SUGGESTIONS}
              max={10}
            />

            {/* Additional Details */}
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Additional Details
              </label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                Optional extra metadata shown under the description — add standalone fields or groups of items
              </p>
              <DetailsEditor value={details} onChange={setDetails} />
            </div>

            {/* Event Type */}
            <div data-tutorial="event-form-type">
              <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                Event Type <span className="text-red-500">*</span>
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              >
                <option value="hackathon">Hackathon</option>
                <option value="workshop">Workshop</option>
                <option value="meetup">Meetup</option>
                <option value="conference">Conference</option>
                <option value="demo_day">Demo Day</option>
                <option value="challenge">Challenge</option>
              </select>
              {isChallengeEvent && (
                <p className="mt-1 text-xs text-ktip-sand-500">
                  Attendees are given a goal to accomplish and submit their solutions on the event
                  page. Objectives, constraints, deliverables and judging criteria are added from
                  the event's Challenge tab after creating it.
                </p>
              )}
            </div>

            {/* Event Status (Admin only) */}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                  Event Status
                </label>
                <select
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-ktip-sand-200 rounded-xl focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
                >
                  <option value="draft">Draft - Not visible to public</option>
                  <option value="published">Published - Visible to everyone</option>
                </select>
                <p className="mt-1 text-xs text-ktip-sand-500">
                  Draft events are only visible to administrators
                </p>
              </div>
            )}

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
                    This is a virtual event
                  </span>
                </div>
              </label>
            </div>

            {/* Location (if not virtual) */}
            {!isVirtual && (
              <Input
                label="Location"
                placeholder="e.g., Innovation Hub, Kingston, Jamaica"
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
                  Start Date <span className="text-red-500">*</span>
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
                label="Start Time"
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
                  End Date (Optional)
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
              </div>

              <Input
                label="End Time (Optional)"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                fullWidth
              />
            </div>

            {/* Capacity */}
            <Input
              label="Capacity (Optional)"
              type="number"
              placeholder="Maximum number of attendees"
              value={capacity?.toString() || ''}
              onChange={(e) =>
                setCapacity(
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              error={errors.capacity}
              icon={<Users size={20} />}
              helperText="Leave empty for unlimited capacity"
              fullWidth
            />

            {/* Challenge — appears when the Challenge event type is picked */}
            {isChallengeEvent && (
              <div
                data-tutorial="event-form-challenge"
                className="border-2 border-ktip-sand-200 rounded-xl p-4 space-y-4"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
                  <Target size={18} className="text-ktip-sand-600" />
                  Challenge Details
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                      Submission Deadline (Optional)
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
                    label="Deadline Time (Optional)"
                    type="time"
                    value={submissionTime}
                    onChange={(e) => setSubmissionTime(e.target.value)}
                    fullWidth
                  />
                </div>

                <p className="text-xs text-ktip-sand-500">
                  Participants submit their solutions — with their own supporting files — from the
                  event page, up until the deadline above.
                </p>
              </div>
            )}

            {/* Documents */}
            <div>
              <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
                Documents (Optional)
              </label>
              <p className="text-xs text-ktip-sand-500 mb-2">
                Briefs, rules, datasets or any other files attendees should have. Uploaded once the
                event is created.
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
                  {documents.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-3 border border-ktip-sand-200 rounded-xl px-3 py-2"
                    >
                      <FileText size={18} className="flex-shrink-0 text-ktip-sand-500" />
                      <span className="flex-1 min-w-0 truncate text-sm text-ktip-sand-800">
                        {file.name}
                      </span>
                      <span className="flex-shrink-0 text-xs text-ktip-sand-500">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== index))}
                        className="p-1 text-ktip-sand-400 hover:text-red-600 transition-colors"
                        title="Remove file"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-ktip-sand-300 rounded-xl text-sm text-ktip-sand-600 hover:border-ktip-ocean-400 hover:text-ktip-ocean-600 transition-colors"
              >
                <Upload size={16} />
                Add document files
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

            {/* Submit Button */}
            <div className="flex items-center gap-4">
              <Button type="submit" loading={loading || finishing} icon={<Save size={20} />} fullWidth>
                {finishing ? 'Uploading attachments…' : 'Create Event'}
              </Button>
              <button
                type="button"
                onClick={() => navigate('/events')}
                disabled={loading || finishing}
                className="text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
