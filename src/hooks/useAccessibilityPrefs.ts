import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ktip_a11y'
const SYNC_EVENT = 'ktip-a11y-change'

export interface AccessibilityPrefs {
  /** Multiplier on the root font-size — scales every rem-based length in the app */
  fontScale: number
  /** brightness() multiplier applied to photography via --photo-brightness */
  brightness: number
}

export const A11Y_DEFAULTS: AccessibilityPrefs = { fontScale: 1, brightness: 1 }

/**
 * Bounds, not suggestions — a stored value outside them is clamped on read, so
 * a hand-edited localStorage entry cannot render the app unusable.
 */
export const A11Y_RANGE = {
  fontScale: { min: 0.9, max: 1.4, step: 0.05 },
  brightness: { min: 0.6, max: 1.6, step: 0.1 },
} as const

const clamp = (v: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, v))

/** Round to the nearest step so repeated +/- cannot accumulate float drift */
const snap = (v: number, step: number) => Math.round(v / step) * step

function read(): AccessibilityPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return A11Y_DEFAULTS
    const saved = JSON.parse(raw) as Partial<AccessibilityPrefs>
    return {
      fontScale: clamp(Number(saved.fontScale) || 1, A11Y_RANGE.fontScale),
      brightness: clamp(Number(saved.brightness) || 1, A11Y_RANGE.brightness),
    }
  } catch {
    // Unreadable or malformed storage — fall back rather than throw on boot
    return A11Y_DEFAULTS
  }
}

export function applyAccessibilityPrefs(prefs: AccessibilityPrefs) {
  const root = document.documentElement
  // Cleared rather than set to 16px at 1×, so the browser's own font-size
  // setting keeps working for anyone who has changed it
  root.style.fontSize = prefs.fontScale === 1 ? '' : `${16 * prefs.fontScale}px`
  root.style.setProperty('--photo-brightness', String(prefs.brightness))
}

/**
 * Reader-comfort preferences: text size and photo brightness.
 *
 * Same shape as useThemeMode — localStorage for persistence, a CustomEvent so
 * every mounted instance stays in sync (the FAB panel sets it; the Discover
 * hero reads it, because that hero drives its own px font-size from JS and so
 * is immune to the root font-size this otherwise works through).
 */
export function useAccessibilityPrefs(): [
  AccessibilityPrefs,
  (patch: Partial<AccessibilityPrefs>) => void,
] {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(read)

  // Applied from an effect rather than at module scope so a stored preference
  // survives a reload without the module needing to be imported for its side
  // effect somewhere in the boot path
  useEffect(() => {
    applyAccessibilityPrefs(prefs)
  }, [prefs])

  useEffect(() => {
    const onSync = (e: Event) => setPrefs((e as CustomEvent<AccessibilityPrefs>).detail)
    window.addEventListener(SYNC_EVENT, onSync)
    return () => window.removeEventListener(SYNC_EVENT, onSync)
  }, [])

  const update = (patch: Partial<AccessibilityPrefs>) => {
    const next: AccessibilityPrefs = {
      fontScale: clamp(
        snap(patch.fontScale ?? prefs.fontScale, A11Y_RANGE.fontScale.step),
        A11Y_RANGE.fontScale,
      ),
      brightness: clamp(
        snap(patch.brightness ?? prefs.brightness, A11Y_RANGE.brightness.step),
        A11Y_RANGE.brightness,
      ),
    }
    applyAccessibilityPrefs(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // localStorage unavailable — the preference still applies for this session
    }
    setPrefs(next)
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }))
  }

  return [prefs, update]
}
