import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { Badge } from '../ui/Badge'
import type { Event } from '../../types'
import { ClimateBadge } from '../ui/ClimateBadge'
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, EVENT_STATUS_COLORS } from '../../lib/constants'
import { formatRelativeTime, truncate } from '../../lib/utils'
import { format, isSameDay, isPast } from 'date-fns'

interface EventCardProps {
  event: Event
}

export function EventCard(props: EventCardProps) {
  const startDate = () => new Date(props.event.start_date)
  const endDate = () =>
    props.event.end_date ? new Date(props.event.end_date) : null
  const isPastEvent = () => isPast(startDate())
  const isSingleDay = () =>
    !endDate() || isSameDay(startDate(), endDate()!)

  const durationDays = () => {
    if (!endDate() || isSameDay(startDate(), endDate()!)) return 1
    const msPerDay = 86400000
    return Math.max(Math.ceil((endDate()!.getTime() - startDate().getTime()) / msPerDay), 1)
  }

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
    <A href={`/events/${props.event.id}`} class="block flex flex-col md:flex-row border-b border-gray-200 pb-10 mb-10 group">
      {/* Left: Image */}
      <div class="w-full md:w-5/12 relative shrink-0">
        <Show
          when={props.event.image_url}
          fallback={
            <div class="w-full h-64 bg-gradient-to-br from-ktip-ocean-100 to-ktip-tropical-100 flex items-center justify-center text-6xl">
              {getEventIcon(props.event.event_type)}
            </div>
          }
        >
          <img
            src={props.event.image_url!}
            alt={props.event.title}
            class="w-full h-64 object-cover"
            classList={{ 'opacity-60': isPastEvent() }}
            loading="lazy"
            width={400}
            height={256}
          />
        </Show>

        {/* Status overlay badges */}
        <Show when={props.event.status === 'cancelled'}>
          <div class="absolute top-4 left-4 z-10">
            <Badge class={EVENT_STATUS_COLORS['cancelled']}>
              Cancelled
            </Badge>
          </div>
        </Show>
        <Show when={isPastEvent() && props.event.status !== 'cancelled'}>
          <div class="absolute top-4 left-4 z-10">
            <Badge variant="default" class="bg-gray-100 text-gray-600">
              Past Event
            </Badge>
          </div>
        </Show>
      </div>

      {/* Right: Content */}
      <div class="w-full md:w-7/12 md:pl-8 flex flex-col justify-center pt-5 md:pt-0">
        {/* Duration badge */}
        <div>
          <span class="bg-gray-700 text-white text-xs px-3 py-1 rounded">
            {durationDays()} Day{durationDays() > 1 ? 's' : ''} Event
          </span>
        </div>

        {/* Title */}
        <h3 class="text-xl font-bold uppercase text-gray-900 mt-3 mb-2 group-hover:text-ktip-ocean-600 transition-colors">
          {props.event.title}
        </h3>

        {/* Description */}
        <Show when={props.event.description}>
          <p class="text-gray-600 text-sm leading-relaxed mb-4">
            {truncate(props.event.description!, 150)}
          </p>
        </Show>

        {/* Date & Location pills */}
        <div class="flex flex-wrap gap-3 mb-3">
          <span class="border border-ktip-ocean-500 rounded px-3 py-1 text-sm">
            <span class="font-bold text-ktip-ocean-600">Date:</span>{' '}
            <span class="text-gray-700">
              {format(startDate(), 'MMM d, yyyy')}
              <Show when={!isSingleDay()}>
                {' '}- {format(endDate()!, 'MMM d, yyyy')}
              </Show>
            </span>
          </span>
          <span class="border border-ktip-ocean-500 rounded px-3 py-1 text-sm">
            <span class="font-bold text-ktip-ocean-600">Location:</span>{' '}
            <span class="text-gray-700">
              {props.event.is_virtual ? 'Virtual Event' : (props.event.location || 'Location TBA')}
            </span>
          </span>
        </div>

        {/* Type badge + Climate */}
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <Badge class={EVENT_TYPE_COLORS[props.event.event_type]}>
            {EVENT_TYPE_LABELS[props.event.event_type]}
          </Badge>
          <Show when={props.event.is_climate_action}>
            <ClimateBadge />
          </Show>
        </div>

        {/* Organizer + relative time */}
        <p class="text-xs text-gray-400">
          By {props.event.organizer?.display_name || 'Unknown'}
          <Show when={!isPastEvent()}>
            {' '}&middot; {formatRelativeTime(props.event.start_date)}
          </Show>
        </p>
      </div>
    </A>
  )
}
