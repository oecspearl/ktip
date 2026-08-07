import { type EventScheduleItem } from '../../types'
import { Badge } from '../ui/Badge'
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS } from '../../lib/constants'
import { format } from 'date-fns'
import { Clock, MapPin } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans } from '@lingui/react/macro'

interface EventScheduleTimelineProps {
  items: EventScheduleItem[]
}

function groupItemsByDate(items: EventScheduleItem[]): Record<string, EventScheduleItem[]> {
  const groups: Record<string, EventScheduleItem[]> = {}

  const sorted = [...items].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  for (const item of sorted) {
    const dateKey = format(new Date(item.start_time), 'yyyy-MM-dd')
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(item)
  }

  return groups
}

function formatTimeRange(startTime: string, endTime: string | null): string {
  const start = format(new Date(startTime), 'h:mm a')
  if (!endTime) return start
  const end = format(new Date(endTime), 'h:mm a')
  return `${start} - ${end}`
}

export function EventScheduleTimeline({ items }: EventScheduleTimelineProps) {
  const grouped = groupItemsByDate(items)
  const dateKeys = Object.keys(grouped).sort()

  return (
    <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-ktip-ocean-600" />
        <h2 className="text-xl font-display font-bold text-ktip-sand-900"><Trans>Schedule</Trans></h2>
      </div>

      {items.length > 0 ? (
        dateKeys.map((dateKey, index) => (
          <div key={dateKey}>
            {dateKeys.length > 1 && (
              <h3
                className={cn('text-lg font-semibold text-ktip-sand-800 mb-3', index > 0 && 'mt-6')}
              >
                {format(new Date(dateKey), 'EEEE, MMMM d')}
              </h3>
            )}

            {grouped[dateKey].map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex gap-4 py-3 border-b border-ktip-sand-100 last:border-0',
                  item.schedule_type === 'break' && 'bg-ktip-sand-50 rounded-lg px-4 -mx-2'
                )}
              >
                <div className="w-32 flex-shrink-0 text-sm font-medium text-ktip-ocean-600">
                  {formatTimeRange(item.start_time, item.end_time)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'font-medium',
                        item.schedule_type === 'break' ? 'text-ktip-sand-500' : 'text-ktip-sand-900'
                      )}
                    >
                      {item.title}
                    </span>
                    <Badge
                      size="sm"
                      className={SCHEDULE_TYPE_COLORS[item.schedule_type] ?? ''}
                    >
                      {SCHEDULE_TYPE_LABELS[item.schedule_type] ?? item.schedule_type}
                    </Badge>
                  </div>

                  {item.description && (
                    <p
                      className={cn(
                        'text-sm mt-1',
                        item.schedule_type === 'break' ? 'text-ktip-sand-400' : 'text-ktip-sand-600'
                      )}
                    >
                      {item.description}
                    </p>
                  )}

                  {item.speaker && (
                    <div className="flex items-center gap-2 mt-1">
                      <DiamondAvatar
                        src={item.speaker.photo_url}
                        name={item.speaker.name}
                        size={20}
                      />
                      <span className="text-sm text-ktip-sand-600">
                        {item.speaker.name}
                        {item.speaker.title && (
                          <span className="text-ktip-sand-400"> - {item.speaker.title}</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* A room of the drawn venue names itself; `location` is the
                      free-text fallback an event without a venue still uses. */}
                  {(item.room?.name || item.location) && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-ktip-sand-400" />
                      <span className="text-sm text-ktip-sand-500">
                        {item.room?.name || item.location}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      ) : (
        <div className="text-center py-8">
          <Clock className="w-10 h-10 text-ktip-sand-300 mx-auto mb-3" />
          <p className="text-ktip-sand-500"><Trans>Schedule will be announced soon.</Trans></p>
        </div>
      )}
    </div>
  )
}
