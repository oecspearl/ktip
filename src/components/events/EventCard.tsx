import { Badge } from '../ui/Badge'
import type { Event } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { EVENT_TYPE_LABELS, EVENT_STATUS_COLORS } from '../../lib/constants'
import { entityPath } from '../../lib/slug'
import { format, isSameDay, isPast } from 'date-fns'

interface EventCardProps {
  event: Event
}

export function EventCard({ event }: EventCardProps) {
  const startDate = new Date(event.start_date)
  const endDate = event.end_date ? new Date(event.end_date) : null
  const isPastEvent = isPast(endDate || startDate)
  const isSingleDay = !endDate || isSameDay(startDate, endDate)

  const dateLabel = isSingleDay
    ? format(startDate, 'MMM d, yyyy')
    : `${format(startDate, 'MMM d')} – ${format(endDate!, 'MMM d, yyyy')}`
  const locationLabel = event.is_virtual ? 'Virtual Event' : event.location || 'Location TBA'

  return (
    <BentoCard
      to={entityPath('event', event)}
      image={event.image_url}
      imageSeed={event.id}
      eyebrow={EVENT_TYPE_LABELS[event.event_type] || 'Event'}
      title={event.title}
      description={event.summary || event.description}
      meta={`${dateLabel} · ${locationLabel}`}
      tags={event.tags}
      cta="View Event"
    >
      <div className="flex flex-wrap items-center gap-2">
        {event.status === 'cancelled' && (
          <Badge className={EVENT_STATUS_COLORS['cancelled']}>Cancelled</Badge>
        )}
        {/* Public lists exclude drafts, so this only ever renders on the
            organizer's own profile — where "why isn't this listed?" is the question */}
        {event.status === 'draft' && (
          <Badge className={EVENT_STATUS_COLORS['draft']}>Draft</Badge>
        )}
        {isPastEvent && event.status !== 'cancelled' && (
          <Badge variant="default" className="bg-white/90 text-ktip-ocean-700 dark:text-ktip-ocean-50 border-transparent">
            Past Event
          </Badge>
        )}
        {event.is_climate_action && <ClimateBadge />}
      </div>
    </BentoCard>
  )
}
