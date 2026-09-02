import { useSyncExternalStore } from 'react'

/**
 * The "has this device seen the welcome panel" flag.
 *
 * Shaped after analytics-consent.ts: a useSyncExternalStore module rather than
 * a read inside the component, so the panel is a pure function of storage and
 * a dismissal in one tab settles every other open tab for free.
 *
 * Every storage access fails CLOSED — a throw is read as "already seen". This
 * is the opposite of the call InstallPrompt makes, and deliberately so: a
 * prompt that cannot remember a refusal is a repeated nudge, but a full-screen
 * overlay that cannot record its own dismissal is an app nobody can get into.
 * Private mode and blocked storage get the app, not a locked door.
 */
const STORAGE_KEY = 'ktip_welcome_seen_v1'
const CHANGE_EVENT = 'ktip:welcome-seen-change'

export function hasSeenWelcome(): boolean {
  if (typeof window === 'undefined') return true

  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Nothing to do — the dismissal still applies to this session, because the
    // component holds its own leaving/unmounted state independently of here.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/**
 * Put the panel back — the home page's "Page tour" action.
 *
 * Home is the one page with no registered walkthrough (see the note on
 * TUTORIAL_IDS), so its tour is this: the panel that greeted the reader on
 * their first visit, played again. Clearing the flag rather than holding a
 * separate "replaying" state means the replay is the genuine article, and a
 * reader who lands here from a shared link gets the same first screen.
 */
export function replayWelcome(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage that cannot be written cannot be cleared, and the same reader
    // never saw the panel in the first place (hasSeenWelcome fails closed), so
    // there is nothing here to put back.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function useHasSeenWelcome(): boolean {
  return useSyncExternalStore(subscribe, hasSeenWelcome, () => true)
}
