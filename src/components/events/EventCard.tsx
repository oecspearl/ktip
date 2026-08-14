import { Badge } from '../ui/Badge'
import type { Event } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { BentoCard } from '../ui/BentoCard'
import { EVENT_TYPE_LABELS, EVENT_STATUS_COLORS } from '../../lib/constants'
import { useTranslatedFields, isMachineTranslated } from '../../hooks/useTranslated'
import { TranslatedMark } from '../legal/TranslatedMark'
import { entityPath } from '../../lib/slug'
import { format, isSameDay, isPast } from 'date-fns'
import { Trans, useLingui } from '@lingui/react/macro'

interface EventCardProps {
  event: Event
}

export function EventCard({ event: source }: EventCardProps) {
    const { t } = useLingui()
  // Member-written copy. `location` is in here on purpose and `title` is not a
  // proper noun: "Rodney Bay Marina" survives (shouldTranslate rejects nothing
  // here, but the provider leaves place names alone), while "Salle de réunion"
  // becomes something a Spanish reader can act on.
  const translated = useTranslatedFields(source, ['title', 'summary', 'description', 'location'])
  const event = translated ?? source
  const startDate = new Date(event.start_date)
  const endDate = event.end_date ? new Date(event.end_date) : null
  const isPastEvent = isPast(endDate || startDate)
  const isSingleDay = !endDate || isSameDay(startDate, endDate)

  const dateLabel = isSingleDay
    ? format(startDate, 'MMM d, yyyy')
    : `${format(startDate, 'MMM d')} – ${format(endDate!, 'MMM d, yyyy')}`
  const locationLabel = event.is_virtual ? t`Virtual Event` : event.location || t`Location TBA`

  return (
    <BentoCard
      to={entityPath('event', event)}
      image={event.image_url}
      imageSeed={event.id}
      eyebrow={EVENT_TYPE_LABELS[event.event_type] || t`Event`}
      title={event.title}
      description={event.summary || event.description}
      meta={`${dateLabel} · ${locationLabel}`}
      tags={event.tags}
      cta={t`View Event`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {event.status === 'cancelled' && (
          <Badge className={EVENT_STATUS_COLORS['cancelled']}><Trans>Cancelled</Trans></Badge>
        )}
        {/* Public lists exclude drafts, so this only ever renders on the
            organizer's own profile — where "why isn't this listed?" is the question */}
        {event.status === 'draft' && (
          <Badge className={EVENT_STATUS_COLORS['draft']}><Trans>Draft</Trans></Badge>
        )}
        {isPastEvent && event.status !== 'cancelled' && (
          <Badge variant="default" className="bg-white/90 text-ktip-ocean-700 dark:text-ktip-ocean-50 border-transparent">
            <Trans>Past Event</Trans>
          </Badge>
        )}
        {event.is_climate_action && <ClimateBadge />}
        {isMachineTranslated(source, translated) && <TranslatedMark />}
      </div>
    </BentoCard>
  )
}
