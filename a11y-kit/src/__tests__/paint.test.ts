import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, resolveConfig } from '../core/config'
import { paint, readStored, sanitize } from '../core/paint'

const cfg = resolveConfig({
  storageKey: 'test_a11y',
  classes: { reduceMotion: 'reduce-motion' },
  fonts: [{ id: 'atkinson', label: 'Atkinson Hyperlegible', className: 'readable', href: 'https://fonts.example/a.css' }],
  legacy: {
    fields: { brightness: 'photoBrightness' },
    keys: [
      { key: 'old_readable', equals: 'true', set: { font: 'atkinson' } },
      { key: 'old_motion', equals: 'true', set: { reduceMotion: true } },
    ],
  },
})

const memory = (entries: Record<string, string>) => ({ getItem: (k: string) => entries[k] ?? null })
const noMedia = { matchMedia: undefined } as unknown as Window

describe('sanitize', () => {
  it('defaults everything for garbage input', () => {
    expect(sanitize(null, cfg)).toEqual(DEFAULT_SETTINGS)
    expect(sanitize('nope', cfg)).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps and snaps numbers without float dust', () => {
    const s = sanitize({ fontScale: 9, pageBrightness: 0.1, photoBrightness: 1.1500001, ttsRate: '1.23' }, cfg)
    expect(s.fontScale).toBe(1.5)
    expect(s.pageBrightness).toBe(0.5)
    expect(s.photoBrightness).toBe(1.2)
    expect(s.ttsRate).toBe(1.2)
  })

  it('rejects unknown enum values and fonts the host does not offer', () => {
    const s = sanitize({ contrast: 'neon', font: 'comic-sans', spacing: 7, shortcuts: 'all' }, cfg)
    expect(s.contrast).toBe('auto')
    expect(s.font).toBe('default')
    expect(s.spacing).toBe(0)
    expect(s.shortcuts).toBe('all')
  })

  it('keeps a well-formed setup record and drops a malformed one', () => {
    expect(sanitize({ setup: { status: 'kept', at: '2026-10-11T00:00:00Z' } }, cfg).setup).toEqual({
      status: 'kept',
      at: '2026-10-11T00:00:00Z',
    })
    expect(sanitize({ setup: { status: 'maybe', at: 1 } }, cfg).setup).toBeNull()
  })
})

describe('readStored', () => {
  it('migrates the pre-kit object and legacy keys once', () => {
    const state = readStored(
      memory({ test_a11y: JSON.stringify({ fontScale: 1.2, brightness: 0.8 }), old_readable: 'true', old_motion: 'true' }),
      cfg
    )
    expect(state.v).toBe(2)
    expect(state.updatedAt).toBe(0)
    expect(state.settings.fontScale).toBe(1.2)
    expect(state.settings.photoBrightness).toBe(0.8)
    expect(state.settings.font).toBe('atkinson')
    expect(state.settings.reduceMotion).toBe(true)
  })

  it('ignores legacy keys once versioned state exists', () => {
    const stored = { v: 2, updatedAt: 5, owner: 'u1', settings: { fontScale: 1.1 }, device: { needs: ['lowVision', 3] } }
    const state = readStored(memory({ test_a11y: JSON.stringify(stored), old_readable: 'true' }), cfg)
    expect(state.settings.font).toBe('default')
    expect(state.updatedAt).toBe(5)
    expect(state.owner).toBe('u1')
    expect(state.device.needs).toEqual(['lowVision'])
  })

  it('survives unparseable storage and storage that throws', () => {
    expect(readStored(memory({ test_a11y: '{oops' }), cfg).settings).toEqual(DEFAULT_SETTINGS)
    const throwing = { getItem: () => { throw new Error('blocked') } }
    expect(readStored(throwing, cfg).settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('paint', () => {
  it('writes and clears every mode on the root', () => {
    const root = document.createElement('html')
    root.appendChild(document.createElement('head'))
    const on = sanitize(
      {
        fontScale: 1.25,
        pageBrightness: 0.8,
        saturation: 0.5,
        contrast: 'more',
        underlineLinks: true,
        cursor: 'large',
        focusRing: 'strong',
        reduceMotion: true,
        spacing: 2,
        font: 'atkinson',
      },
      cfg
    )
    paint(on, cfg, root, noMedia)
    expect(root.style.fontSize).toBe('125%')
    expect(root.style.filter).toBe('brightness(0.8) saturate(0.5)')
    expect(root.classList.contains('a11y-contrast-more')).toBe(true)
    expect(root.classList.contains('a11y-underline')).toBe(true)
    expect(root.classList.contains('a11y-cursor')).toBe(true)
    expect(root.classList.contains('a11y-focus')).toBe(true)
    expect(root.classList.contains('reduce-motion')).toBe(true)
    expect(root.classList.contains('readable')).toBe(true)
    expect(root.getAttribute('data-a11y-spacing')).toBe('2')

    paint(DEFAULT_SETTINGS, cfg, root, noMedia)
    expect(root.style.fontSize).toBe('')
    expect(root.style.filter).toBe('')
    expect(root.className).toBe('')
    expect(root.hasAttribute('data-a11y-spacing')).toBe(false)
  })

  it('follows the OS contrast setting only in auto', () => {
    const root = document.createElement('html')
    const osMore = { matchMedia: () => ({ matches: true }) } as unknown as Window
    paint(DEFAULT_SETTINGS, cfg, root, osMore)
    expect(root.classList.contains('a11y-contrast-more')).toBe(true)
    paint({ ...DEFAULT_SETTINGS, contrast: 'standard' }, cfg, root, osMore)
    expect(root.classList.contains('a11y-contrast-more')).toBe(false)
  })
})
