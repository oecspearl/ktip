import { Badge } from '../ui/Badge'
import type { Event } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { EVENT_TYPE_LABELS, EVENT_STATUS_COLORS } from '../../lib/constants'
import { format, isSameDay, isPast } from 'date-fns'

interface EventCardProps {
  event: Event
}

export function EventCard({ event }: EventCardProps) {
  const startDate = new Date(event.start_date)
  const endDate = event.end_date ? new Date(event.end_date) : null
  const isPastEvent = isPast(startDate)
  const isSingleDay = !endDate || isSameDay(startDate, endDate)

  const dateLabel = isSingleDay
    ? format(startDate, 'MMM d, yyyy')
    : `${format(startDate, 'MMM d')} – ${format(endDate!, 'MMM d, yyyy')}`
  const locationLabel = event.is_virtual ? 'Virtual Event' : event.location || 'Location TBA'

  return (
    <BentoCard
      to={`/events/${event.id}`}
      image={event.image_url}
      imageSeed={event.id}
      eyebrow={EVENT_TYPE_LABELS[event.event_type] || 'Event'}
      title={event.title}
      description={event.summary || event.description}
      meta={`${dateLabel} · ${locationLabel}`}
      tags={event.tags}
      cta="View Event"
    >
      <div className="flex items-center gap-2">
        {event.status === 'cancelled' && (
          <Badge className={EVENT_STATUS_COLORS['cancelled']}>Cancelled</Badge>
        )}
        {isPastEvent && event.status !== 'cancelled' && (
          <Badge variant="default" className="bg-white/90 text-gray-700 border-transparent">
            Past Event
          </Badge>
        )}
        {event.is_climate_action && <ClimateBadge />}
      </div>
    </BentoCard>
  )
}
