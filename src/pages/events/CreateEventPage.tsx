import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useCreateEvent } from '../../hooks/useEvents'
import { DetailsEditor, cleanDetails } from '../../components/shared/DetailsEditor'
import { TagInput } from '../../components/ui/TagInput'
import { CONTENT_TAG_SUGGESTIONS } from '../../lib/constants'
import { sanitizeTag } from '../../lib/utils'
import type { DetailEntry } from '../../types'
import { eventSchema } from '../../lib/validation'
import { Save, Calendar, MapPin, Video, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { analytics } from '../../hooks/useAnalytics'
import { format } from 'date-fns'

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
  const [isClimateAction, setIsClimateAction] = useState(false)
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')

  const isAdmin = auth.profile?.roles?.includes('oecs')

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
        is_climate_action: isClimateAction,
        details: cleanDetails(details),
        ...(isAdmin ? { status: eventStatus } : {}),
      } as any)

      analytics.feature('event', 'created')
      toast.success('Event created successfully!')
      navigate(`/events/${event.id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create event')
      setErrorMessage(error.message || 'Failed to create event')
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
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
            <div>
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
              </select>
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
            <div className="flex items-center gap-3">
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

            {/* Climate Action */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isClimateAction}
                  onChange={(e) => setIsClimateAction(e.target.checked)}
                  className="w-5 h-5 text-ktip-tropical-700 border-ktip-sand-300 rounded focus:ring-ktip-tropical-500"
                />
                <span className="text-sm text-ktip-sand-700">
                  This event focuses on climate change solutions
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-4">
              <Button type="submit" loading={loading} icon={<Save size={20} />} fullWidth>
                Create Event
              </Button>
              <button
                type="button"
                onClick={() => navigate('/events')}
                disabled={loading}
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
