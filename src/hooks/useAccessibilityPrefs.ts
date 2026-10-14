import { useCallback, useMemo } from 'react'
import { useA11ySettings } from '@a11y-kit'
import { a11yStore } from '../a11y/store'

export interface AccessibilityPrefs {
  /** Multiplier on the root font-size — scales every rem-based length in the app */
  fontScale: number
  /** brightness() multiplier applied to photography via --photo-brightness */
  brightness: number
}

export const A11Y_DEFAULTS: AccessibilityPrefs = { fontScale: 1, brightness: 1 }

/** Bounds and steps, from the accessibility kit's configuration. */
export const A11Y_RANGE = {
  fontScale: a11yStore.config.ranges.fontScale,
  brightness: a11yStore.config.ranges.photoBrightness,
} as const

/**
 * Text size and photo brightness, as the FAB panel, the settings card and the
 * Discover hero have always read them. A view over the accessibility kit's
 * store (src/a11y), which owns clamping, persistence, painting and sync.
 */
export function useAccessibilityPrefs(): [
  AccessibilityPrefs,
  (patch: Partial<AccessibilityPrefs>) => void,
] {
  const { fontScale, photoBrightness } = useA11ySettings(a11yStore)
  const prefs = useMemo(() => ({ fontScale, brightness: photoBrightness }), [fontScale, photoBrightness])
  const update = useCallback((patch: Partial<AccessibilityPrefs>) => {
    a11yStore.patch({
      ...(patch.fontScale !== undefined && { fontScale: patch.fontScale }),
      ...(patch.brightness !== undefined && { photoBrightness: patch.brightness }),
    })
  }, [])
  return [prefs, update]
}
