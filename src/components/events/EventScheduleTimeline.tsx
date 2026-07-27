import { Show, For } from 'solid-js'
import { type EventScheduleItem } from '../../types'
import { Badge } from '../ui/Badge'
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS } from '../../lib/constants'
import { format } from 'date-fns'
import { Clock, MapPin } from 'lucide-solid'

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

function getSpeakerInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function EventScheduleTimeline(props: EventScheduleTimelineProps) {
  const grouped = () => groupItemsByDate(props.items)
  const dateKeys = () => Object.keys(grouped()).sort()

  return (
    <div class="bg-white rounded-xl border border-ktip-sand-200 shadow-card p-6">
      <div class="flex items-center gap-2 mb-4">
        <Clock class="w-5 h-5 text-ktip-ocean-600" />
        <h2 class="text-xl font-display font-bold text-ktip-sand-900">Schedule</h2>
      </div>

      <Show
        when={props.items.length > 0}
        fallback={
          <div class="text-center py-8">
            <Clock class="w-10 h-10 text-ktip-sand-300 mx-auto mb-3" />
            <p class="text-ktip-sand-500">Schedule will be announced soon.</p>
          </div>
        }
      >
        <For each={dateKeys()}>
          {(dateKey, index) => (
            <div>
              <Show when={dateKeys().length > 1}>
                <h3
                  class="text-lg font-semibold text-ktip-sand-800 mb-3"
                  classList={{ 'mt-6': index() > 0 }}
                >
                  {format(new Date(dateKey), 'EEEE, MMMM d')}
                </h3>
              </Show>

              <For each={grouped()[dateKey]}>
                {(item) => (
                  <div
                    class="flex gap-4 py-3 border-b border-ktip-sand-100 last:border-0"
                    classList={{
                      'bg-ktip-sand-50 rounded-lg px-4 -mx-2': item.schedule_type === 'break',
                    }}
                  >
                    <div class="w-32 flex-shrink-0 text-sm font-medium text-ktip-ocean-600">
                      {formatTimeRange(item.start_time, item.end_time)}
                    </div>

                    <div class="flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span
                          class="font-medium"
                          classList={{
                            'text-ktip-sand-500': item.schedule_type === 'break',
                            'text-ktip-sand-900': item.schedule_type !== 'break',
                          }}
                        >
                          {item.title}
                        </span>
                        <Badge
                          size="sm"
                          class={SCHEDULE_TYPE_COLORS[item.schedule_type] ?? ''}
                        >
                          {SCHEDULE_TYPE_LABELS[item.schedule_type] ?? item.schedule_type}
                        </Badge>
                      </div>

                      <Show when={item.description}>
                        <p
                          class="text-sm mt-1"
                          classList={{
                            'text-ktip-sand-400': item.schedule_type === 'break',
                            'text-ktip-sand-600': item.schedule_type !== 'break',
                          }}
                        >
                          {item.description}
                        </p>
                      </Show>

                      <Show when={item.speaker}>
                        <div class="flex items-center gap-2 mt-1">
                          <Show
                            when={item.speaker!.photo_url}
                            fallback={
                              <div class="w-5 h-5 rounded-full bg-ktip-ocean-100 text-ktip-ocean-700 flex items-center justify-center text-[10px] font-medium">
                                {getSpeakerInitials(item.speaker!.name)}
                              </div>
                            }
                          >
                            <img
                              src={item.speaker!.photo_url!}
                              alt={item.speaker!.name}
                              class="w-5 h-5 rounded-full object-cover"
                            />
                          </Show>
                          <span class="text-sm text-ktip-sand-600">
                            {item.speaker!.name}
                            <Show when={item.speaker!.title}>
                              <span class="text-ktip-sand-400"> - {item.speaker!.title}</span>
                            </Show>
                          </span>
                        </div>
                      </Show>

                      <Show when={item.location}>
                        <div class="flex items-center gap-1 mt-1">
                          <MapPin class="w-3.5 h-3.5 text-ktip-sand-400" />
                          <span class="text-sm text-ktip-sand-500">{item.location}</span>
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
