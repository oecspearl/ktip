import { isSyncedBlob, type A11ySettings, type SyncedBlob } from '@a11y-kit'
import type { DisplayPrefs } from '../types'

/**
 * profiles.display_prefs (155) as the kit's synced blob.
 *
 * Builds from before the kit wrote five flat keys and nothing else. Those are
 * read as a blob older than any change a device has made since, which is what
 * the old "profile wins once" rule amounted to.
 */
export function blobFromDisplayPrefs(prefs: DisplayPrefs | null | undefined): SyncedBlob | null {
  if (!prefs) return null
  if (isSyncedBlob(prefs.a11y)) return { ...prefs.a11y, ...(prefs.theme && { theme: prefs.theme }) }

  const settings: Partial<A11ySettings> = {}
  if (typeof prefs.readable === 'boolean') settings.font = prefs.readable ? 'atkinson' : 'default'
  if (typeof prefs.fontScale === 'number') settings.fontScale = prefs.fontScale
  if (typeof prefs.brightness === 'number') settings.photoBrightness = prefs.brightness
  if (typeof prefs.reducedMotion === 'boolean') settings.reduceMotion = prefs.reducedMotion
  if (!Object.keys(settings).length && !prefs.theme) return null
  return { v: 2, updatedAt: 1, settings, ...(prefs.theme && { theme: prefs.theme }) }
}

/**
 * The blob, plus the five flat keys for any build from before the kit still
 * open in a tab or an installed PWA, so it keeps reading sensible values.
 */
export function displayPrefsFromBlob(blob: SyncedBlob): DisplayPrefs {
  const s = blob.settings
  return {
    ...(blob.theme && { theme: blob.theme }),
    readable: s.font === 'atkinson',
    fontScale: s.fontScale,
    brightness: s.photoBrightness,
    reducedMotion: s.reduceMotion,
    a11y: blob,
  }
}
