import { Link } from 'react-router'
import { Badge } from '../ui/Badge'
import type { Event } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, EVENT_STATUS_COLORS } from '../../lib/constants'
import { formatRelativeTime, truncate, cn } from '../../lib/utils'
import { format, isSameDay, isPast } from 'date-fns'

interface EventCardProps {
  event: Event
}

export function EventCard({ event }: EventCardProps) {
  const startDate = new Date(event.start_date)
  const endDate = event.end_date ? new Date(event.end_date) : null
  const isPastEvent = isPast(startDate)
  const isSingleDay = !endDate || isSameDay(startDate, endDate)

  const durationDays = (() => {
    if (!endDate || isSameDay(startDate, endDate)) return 1
    const msPerDay = 86400000
    return Math.max(Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay), 1)
  })()

  const getEventIcon = (type: string) => {
    const icons: Record<string, string> = {
      hackathon: '💻',
      workshop: '🛠️',
      meetup: '🤝',
      conference: '🎤',
      demo_day: '🚀',
    }
    return icons[type] || '📅'
  }

  return (
    <Link to={`/events/${event.id}`} className="block flex flex-col md:flex-row border-b border-gray-200 pb-10 mb-10 group">
      {/* Left: Image */}
      <div className="w-full md:w-5/12 relative shrink-0">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className={cn('w-full h-64 object-cover', isPastEvent && 'opacity-60')}
            loading="lazy"
            width={400}
            height={256}
          />
        ) : (
          <div className="w-full h-64 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 flex items-center justify-center text-6xl">
            {getEventIcon(event.event_type)}
          </div>
        )}

        {/* Status overlay badges */}
        {event.status === 'cancelled' && (
          <div className="absolute top-4 left-4 z-10">
            <Badge className={EVENT_STATUS_COLORS['cancelled']}>
              Cancelled
            </Badge>
          </div>
        )}
        {isPastEvent && event.status !== 'cancelled' && (
          <div className="absolute top-4 left-4 z-10">
            <Badge variant="default" className="bg-gray-100 text-gray-600">
              Past Event
            </Badge>
          </div>
        )}
      </div>

      {/* Right: Content */}
      <div className="w-full md:w-7/12 md:pl-8 flex flex-col justify-center pt-5 md:pt-0">
        {/* Duration badge */}
        <div>
          <span className="bg-gray-700 text-white text-xs px-3 py-1 rounded">
            {durationDays} Day{durationDays > 1 ? 's' : ''} Event
          </span>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold uppercase text-gray-900 mt-3 mb-2 group-hover:text-ktip-ocean-600 transition-colors">
          {event.title}
        </h3>

        {/* Description */}
        {event.description && (
          <p className="text-gray-600 text-sm leading-relaxed mb-4">
            {truncate(event.description, 150)}
          </p>
        )}

        {/* Date & Location pills */}
        <div className="flex flex-wrap gap-3 mb-3">
          <span className="border border-ktip-ocean-500 rounded px-3 py-1 text-sm">
            <span className="font-bold text-ktip-ocean-600">Date:</span>{' '}
            <span className="text-gray-700">
              {format(startDate, 'MMM d, yyyy')}
              {!isSingleDay && (
                <> - {format(endDate!, 'MMM d, yyyy')}</>
              )}
            </span>
          </span>
          <span className="border border-ktip-ocean-500 rounded px-3 py-1 text-sm">
            <span className="font-bold text-ktip-ocean-600">Location:</span>{' '}
            <span className="text-gray-700">
              {event.is_virtual ? 'Virtual Event' : (event.location || 'Location TBA')}
            </span>
          </span>
        </div>

        {/* Type badge + Climate */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge className={EVENT_TYPE_COLORS[event.event_type]}>
            {EVENT_TYPE_LABELS[event.event_type]}
          </Badge>
          {event.is_climate_action && <ClimateBadge />}
        </div>

        {/* Organizer + relative time */}
        <p className="text-xs text-gray-400">
          By {event.organizer?.display_name || 'Unknown'}
          {!isPastEvent && (
            <> &middot; {formatRelativeTime(event.start_date)}</>
          )}
        </p>
      </div>
    </Link>
  )
}
