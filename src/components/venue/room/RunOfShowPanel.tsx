import { useEffect, useState } from 'react'
import { useLingui, Trans } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useEventSchedule } from '../../../hooks/useEventSchedule'
import { RoomPanel } from './RoomPanel'

/**
 * The day's agenda, in a room: the time, what is on, where, and a chip on the
 * one happening now.
 *
 * Reads the event's own schedule, the same rows the event page shows, so an
 * organiser keeps one agenda. Renders nothing for an event with no schedule.
 */
export function RunOfShowPanel({ eventId, title }: { eventId: string; title?: string }) {
  const { t, i18n } = useLingui()
  const { schedule } = useEventSchedule(eventId)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (!schedule?.length) return null

  return (
    <RoomPanel title={title || t`Run of show`}>
      <ul className="divide-y divide-ktip-sand-100">
        {schedule.map((item, index) => {
          const start = Date.parse(item.start_time)
          // An item with no end runs until the next one starts.
          const next = schedule[index + 1]
          const end = item.end_time ? Date.parse(item.end_time) : next ? Date.parse(next.start_time) : start + 3_600_000
          const past = end <= now
          const current = start <= now && now < end
          const where = (item as { room?: { name?: string } | null }).room?.name || item.location

          return (
            <li key={item.id} className={cn('flex items-start gap-3 px-4 py-2.5', past && 'opacity-60', current && 'bg-ktip-tropical-50')}>
              <time dateTime={item.start_time} className="w-14 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-ktip-sand-600">
                {i18n.date(new Date(start), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
              </time>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-ktip-sand-900">{item.title}</p>
                {where && <p className="break-words text-xs text-ktip-sand-500">{where}</p>}
              </div>
              {current && (
                <span className="shrink-0 rounded-full bg-ktip-tropical-50 px-2 py-0.5 text-micro font-extrabold text-ktip-tropical-700">
                  <Trans>Now</Trans>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </RoomPanel>
  )
}
