/**
 * Where an event sits in time: not started, running, or finished.
 *
 * One rule for every surface that labels an event "live". An event without an
 * end date is treated as running for a day after it starts, so a host who only
 * filled in the start still gets a live window instead of an event that is
 * "past" the moment it opens.
 */
export type EventPhase = 'upcoming' | 'live' | 'past'

const DEFAULT_LENGTH_MS = 24 * 60 * 60 * 1000

export interface Timed {
  start_date: string
  end_date?: string | null
}

export function eventEndMs(event: Timed): number {
  const start = Date.parse(event.start_date)
  return event.end_date ? Date.parse(event.end_date) : start + DEFAULT_LENGTH_MS
}

export function eventPhase(event: Timed, now: number = Date.now()): EventPhase {
  const start = Date.parse(event.start_date)
  if (now < start) return 'upcoming'
  return now <= eventEndMs(event) ? 'live' : 'past'
}
