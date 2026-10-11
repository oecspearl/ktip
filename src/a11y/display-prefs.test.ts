import { describe, expect, it } from 'vitest'
import type { SyncedBlob } from './viridion'
import { blobFromDisplayPrefs, displayPrefsFromBlob } from './display-prefs'

describe('display_prefs <-> service blob', () => {
  it('reads nothing from an empty column', () => {
    expect(blobFromDisplayPrefs(null)).toBeNull()
    expect(blobFromDisplayPrefs({})).toBeNull()
  })

  it('reads the five pre-kit keys as the oldest possible blob', () => {
    const blob = blobFromDisplayPrefs({ theme: 'dark', readable: true, fontScale: 1.2, brightness: 0.8, reducedMotion: true })
    expect(blob).toEqual({
      v: 2,
      updatedAt: 1,
      theme: 'dark',
      settings: { font: 'atkinson', fontScale: 1.2, photoBrightness: 0.8, reduceMotion: true },
    })
  })

  it('prefers the service blob, with the top-level theme', () => {
    const a11y: SyncedBlob = { v: 2, updatedAt: 500, settings: { fontScale: 1.4 } }
    expect(blobFromDisplayPrefs({ theme: 'light', fontScale: 1, a11y })).toEqual({ ...a11y, theme: 'light' })
  })

  it('writes the blob plus flat keys older builds can read', () => {
    const blob: SyncedBlob = {
      v: 2,
      updatedAt: 9,
      theme: 'dark',
      settings: { font: 'atkinson', fontScale: 1.3, photoBrightness: 0.9, reduceMotion: true },
    }
    const prefs = displayPrefsFromBlob(blob)
    expect(prefs).toMatchObject({ theme: 'dark', readable: true, fontScale: 1.3, brightness: 0.9, reducedMotion: true })
    expect(blobFromDisplayPrefs(prefs)).toEqual(blob)
  })
})
