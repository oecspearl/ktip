import { useSyncExternalStore } from 'react'

/**
 * Which inline disclaimers this device has been told to stop showing.
 *
 * Copies the shape of analytics-consent.ts deliberately — localStorage plus a
 * custom event plus useSyncExternalStore — so there is one way this codebase
 * remembers a per-device UI decision rather than two.
 *
 * Per VARIANT, never per instance. Dismissing the AI caveat once means the
 * member has understood that AI output can be wrong; making them dismiss it
 * again on the next panel would teach them to dismiss without reading, which is
 * the opposite of what a disclaimer is for.
 *
 * Only ever offered on `inline`. A `block` or `footer` disclaimer you can switch
 * off is not a disclaimer.
 */
export type DisclaimerVariant = 'ai' | 'translation' | 'funding' | 'advice' | 'safeguarding'

const STORAGE_KEY = 'ktip_disclaimer_dismissed_v1'
const CHANGE_EVENT = 'ktip:disclaimer-dismissal-change'

function read(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(STORAGE_KEY) ?? ''
}

export function getDismissed(): DisclaimerVariant[] {
  return read()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as DisclaimerVariant[]
}

export function dismissDisclaimer(variant: DisclaimerVariant): void {
  const next = new Set(getDismissed())
  next.add(variant)
  window.localStorage.setItem(STORAGE_KEY, Array.from(next).join(','))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Used by the Settings tab, so a member can put the caveats back. */
export function restoreDisclaimers(): void {
  window.localStorage.removeItem(STORAGE_KEY)
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

/**
 * Subscribes to the raw string rather than a parsed array: useSyncExternalStore
 * compares snapshots by identity, and a fresh array every call would loop.
 */
export function useDisclaimerDismissals(): DisclaimerVariant[] {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as DisclaimerVariant[]
}

export function useIsDisclaimerDismissed(variant: DisclaimerVariant): boolean {
  return useDisclaimerDismissals().includes(variant)
}
