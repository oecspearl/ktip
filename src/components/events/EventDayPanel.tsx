import { Link } from 'react-router'
import { differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import { ArrowRight, CalendarX, MapPin, Video } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_DOT_COLORS,
  EVENT_TYPE_LABELS,
} from '../../lib/constants'
import { ClimateBadge } from '../ui/ClimateBadge'
import type { Event } from '../../types'

interface EventDayPanelProps {
  date: Date
  events: Event[]
  loading?: boolean
  onJumpToNext?: () => void
}

function EventCompactCard({ event, day }: { event: Event; day: Date }) {
  const start = new Date(event.start_date)
  const end = event.end_date ? new Date(event.end_date) : start
  const isMultiDay = !isSameDay(start, end)

  let timeLabel: string
  if (isMultiDay) {
    const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(start)) + 1
    const totalDays = differenceInCalendarDays(startOfDay(end), startOfDay(start)) + 1
    timeLabel = `Day ${Math.min(Math.max(dayIndex, 1), totalDays)} of ${totalDays}`
  } else {
    timeLabel = format(start, 'h:mm a')
  }

  return (
    <Link
      to={`/events/${event.id}`}
      className={cn(
        'group flex gap-3 rounded-2xl border border-ktip-line bg-ktip-canvas/70 p-3 transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-ktip-ocean-200',
        event.status === 'cancelled' && 'opacity-60'
      )}
    >
      <span
        className={cn(
          'w-1 rounded-full self-stretch shrink-0',
          EVENT_TYPE_DOT_COLORS[event.event_type]
        )}
      />
      <span className="w-16 shrink-0 pt-0.5 text-xs font-bold text-ktip-sand-700">
        {timeLabel}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm text-ktip-ink line-clamp-2 group-hover:text-ktip-ocean-700 transition-colors">
            {event.title}
          </span>
          <ArrowRight
            size={14}
            className="shrink-0 mt-0.5 text-ktip-sand-400 transition-all group-hover:text-ktip-ocean-600 group-hover:translate-x-0.5"
          />
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
              EVENT_TYPE_COLORS[event.event_type]
            )}
          >
            {EVENT_TYPE_LABELS[event.event_type]}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
            {event.is_virtual ? <Video size={12} /> : <MapPin size={12} />}
            <span className="truncate">
              {event.is_virtual ? 'Virtual' : event.location || 'Location TBA'}
            </span>
          </span>
          {event.is_climate_action && <ClimateBadge />}
        </span>
      </span>
    </Link>
  )
}

export function EventDayPanel({ date, events, loading, onJumpToNext }: EventDayPanelProps) {
  return (
    <div
      data-tutorial="events-day-panel"
      className="bg-ktip-cream rounded-2xl border border-ktip-line shadow-card p-4 sm:p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-ktip-ocean-600">
        {format(date, 'EEEE')}
      </p>
      <h2 className="font-display font-bold text-xl text-ktip-sand-900 animate-none">
        {format(date, 'MMMM d, yyyy')}
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {loading
          ? 'Loading…'
          : `${events.length} event${events.length !== 1 ? 's' : ''}`}
      </p>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="animate-pulse bg-ktip-sand-100 rounded-2xl h-20" />
          ))}
        </div>
      ) : events.length > 0 ? (
        <div
          key={format(date, 'yyyy-MM-dd')}
          className="animate-tab-enter stagger-children flex flex-col gap-3"
        >
          {events.map((event) => (
            <EventCompactCard key={event.id} event={event} day={date} />
          ))}
        </div>
      ) : (
        <div key={format(date, 'yyyy-MM-dd')} className="animate-tab-enter text-center py-10">
          <div className="w-12 h-12 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <CalendarX size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-ktip-sand-800 mb-1">No events on this day</p>
          <p className="text-xs text-gray-500 mb-3">Pick another date on the calendar.</p>
          {onJumpToNext && (
            <button
              type="button"
              onClick={onJumpToNext}
              className="text-sm font-semibold text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              Jump to next event →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
