import { useCallback, useMemo } from 'react'
import { setA11ySettings, useA11ySettings } from '../a11y/viridion'

export interface AccessibilityPrefs {
  /** Multiplier on the root font-size — scales every rem-based length in the app */
  fontScale: number
  /** brightness() multiplier applied to photography via --photo-brightness */
  brightness: number
}

export const A11Y_DEFAULTS: AccessibilityPrefs = { fontScale: 1, brightness: 1 }

/**
 * Text size and photo brightness, as the Discover hero reads them. A view over
 * the hosted accessibility service, which owns clamping, storage, painting
 * and sync.
 */
export function useAccessibilityPrefs(): [
  AccessibilityPrefs,
  (patch: Partial<AccessibilityPrefs>) => void,
] {
  const { fontScale, photoBrightness } = useA11ySettings()
  const prefs = useMemo(() => ({ fontScale, brightness: photoBrightness }), [fontScale, photoBrightness])
  const update = useCallback((patch: Partial<AccessibilityPrefs>) => {
    setA11ySettings({
      ...(patch.fontScale !== undefined && { fontScale: patch.fontScale }),
      ...(patch.brightness !== undefined && { photoBrightness: patch.brightness }),
    })
  }, [])
  return [prefs, update]
}
