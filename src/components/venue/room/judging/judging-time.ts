import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every 30 seconds. Enough for a deadline shown to
 * the minute, without a per-second render on every open room.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * The current time, every second, until `endMs` passes; then it stops, so a
 * closed deadline costs nothing. For a clock shown to the second: keep the
 * component that calls it small, since it re-renders on every tick.
 */
export function useNowUntil(endMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!Number.isFinite(endMs) || Date.now() >= endMs) return
    const id = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      if (at >= endMs) window.clearInterval(id)
    }, 1_000)
    return () => window.clearInterval(id)
  }, [endMs])
  return now
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * A ticking clock for a deadline: "18:41:24", or "3d 04:12:09" once more than
 * 48 hours remain. Under that the hours run past 24 ("41:12:09"), which reads
 * better than "1d 17:12:09" for a deadline that is tomorrow.
 */
export function clockLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (total > 48 * 3600) {
    return `${Math.floor(hours / 24)}d ${pad2(hours % 24)}:${pad2(minutes)}:${pad2(seconds)}`
  }
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

/** Two units, largest first: "3d 4h", "4h 20m", "12m". Same shape as RoomCountdown. */
export function timeLeft(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}
