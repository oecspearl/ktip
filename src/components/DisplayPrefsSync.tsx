import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useThemeMode } from '../hooks/useThemeMode'
import { useReadableMode } from '../hooks/useReadableMode'
import { useAccessibilityPrefs } from '../hooks/useAccessibilityPrefs'
import { useReducedMotionPref } from '../hooks/useReducedMotion'
import type { DisplayPrefs } from '../types'

/**
 * Carries the display preferences between the device and the profile, both
 * ways (migration 155). Modelled on LanguageProfileSync.
 *
 * profile -> device: once per session, the moment the profile first arrives.
 * The device's own storage has already painted the first frame (index.html);
 * if the profile disagrees, the profile wins, because it is what the member
 * chose most recently on SOME device and the one in front of them may simply
 * be new. After that first adoption the device is authoritative for the
 * session, so a stale profile query cannot fight a toggle the member just
 * pressed.
 *
 * device -> profile: any change after adoption is written back, coalesced
 * and fire-and-forget. Failing it must never toast — the change has already
 * applied here and localStorage has already remembered it.
 */
export function DisplayPrefsSync() {
  const { profile, updateProfile } = useAuth()
  const [dark, setDark] = useThemeMode()
  const [readable, setReadable] = useReadableMode()
  const [a11y, setA11y] = useAccessibilityPrefs()
  const [reducedMotion, setReducedMotion] = useReducedMotionPref()

  const adopted = useRef<string | null>(null)
  const written = useRef<string | null>(null)

  const current: DisplayPrefs = {
    theme: dark ? 'dark' : 'light',
    readable,
    fontScale: a11y.fontScale,
    brightness: a11y.brightness,
    reducedMotion,
  }
  const currentKey = JSON.stringify(current)

  // ---- profile -> device, once per signed-in profile -----------------------
  useEffect(() => {
    if (!profile) {
      adopted.current = null
      return
    }
    if (adopted.current === profile.id) return
    adopted.current = profile.id
    const saved = profile.display_prefs
    if (!saved) return
    if (saved.theme && (saved.theme === 'dark') !== dark) setDark(saved.theme === 'dark')
    if (typeof saved.readable === 'boolean' && saved.readable !== readable) setReadable(saved.readable)
    if (typeof saved.reducedMotion === 'boolean' && saved.reducedMotion !== reducedMotion) {
      setReducedMotion(saved.reducedMotion)
    }
    const patch: Partial<typeof a11y> = {}
    if (typeof saved.fontScale === 'number' && saved.fontScale !== a11y.fontScale) patch.fontScale = saved.fontScale
    if (typeof saved.brightness === 'number' && saved.brightness !== a11y.brightness) patch.brightness = saved.brightness
    if (Object.keys(patch).length) setA11y(patch)
    // Mark the adopted state as already written so the write-back effect below
    // does not immediately echo the profile back to itself.
    written.current = JSON.stringify({ ...current, ...saved })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.display_prefs])

  // ---- device -> profile ---------------------------------------------------
  useEffect(() => {
    if (!profile || adopted.current !== profile.id) return
    if (written.current === currentKey) return
    const savedKey = profile.display_prefs ? JSON.stringify({ ...current, ...profile.display_prefs }) : null
    if (savedKey === currentKey && written.current === null) {
      written.current = currentKey
      return
    }
    written.current = currentKey
    const handle = window.setTimeout(() => {
      void updateProfile({ display_prefs: current } as never).catch(() => {
        written.current = null
      })
    }, 600)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, profile?.id])

  return null
}
