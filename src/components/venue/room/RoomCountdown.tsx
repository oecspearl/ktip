import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Clock } from 'lucide-react'
import { RoomPanel } from './RoomPanel'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Time left to submit.
 *
 * Renders nothing when the event has no submission deadline — a countdown to
 * nothing is worse than no countdown. Ticks once a minute rather than once a
 * second: this is a room panel, not a launch clock, and a per-second interval
 * on every open room page is a re-render nobody asked for.
 */
export function RoomCountdown({ deadline }: { deadline: string | null | undefined }) {
  const { t } = useLingui()
  const target = deadline ? new Date(deadline).getTime() : NaN
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!Number.isFinite(target)) return
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [target])

  if (!Number.isFinite(target)) return null

  const left = target - now
  const passed = left <= 0

  return (
    <RoomPanel title={t`Submissions`}>
      <div className="px-4 py-4">
        <p
          className={`font-display text-2xl font-bold ${
            passed ? 'text-ktip-sand-500' : 'text-ktip-sand-900'
          }`}
        >
          {passed ? t`Closed` : remaining(left)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ktip-sand-500">
          <Clock size={12} aria-hidden="true" />
          {passed ? (
            <Trans>Closed {format(target, 'MMM d · h:mm a')}</Trans>
          ) : (
            <Trans>Closes {format(target, 'MMM d · h:mm a')}</Trans>
          )}
        </p>
      </div>
    </RoomPanel>
  )
}

/** Two units, largest first — "3d 4h", "4h 20m", "12m". */
function remaining(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}
