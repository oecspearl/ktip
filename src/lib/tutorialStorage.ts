/**
 * Tutorial completion state. localStorage only — matches the house style for
 * one-time UI (`events:view`, `ktip_theme`, the ForYouRail prompt) and keeps
 * working for signed-out visitors, who can reach /events.
 *
 * Two keys on purpose:
 *  - `completed`   — the user reached the last step. Drives the FAB's dot.
 *  - `autostarted` — the tour fired itself once, however it ended. Stops us
 *    re-ambushing someone who exited early on every subsequent visit.
 */
const COMPLETED_KEY = 'ktip:tutorials:completed'
const AUTOSTARTED_KEY = 'ktip:tutorials:autostarted'

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function appendTo(key: string, id: string): string[] {
  const list = readList(key)
  if (list.includes(id)) return list
  const next = [...list, id]
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // Private mode / quota — completion just won't persist
  }
  return next
}

export function getCompletedTutorials(): string[] {
  return readList(COMPLETED_KEY)
}

export function markTutorialComplete(id: string): string[] {
  return appendTo(COMPLETED_KEY, id)
}

export function hasAutoStarted(id: string): boolean {
  return readList(AUTOSTARTED_KEY).includes(id)
}

export function markAutoStarted(id: string): void {
  appendTo(AUTOSTARTED_KEY, id)
}
