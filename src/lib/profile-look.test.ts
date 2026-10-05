import { describe, it, expect } from 'vitest'
import {
  ACCENT_PRESETS,
  DEFAULT_LOOK,
  accentOnDark,
  contrastRatio,
  lookAttributes,
  parseProfileLook,
  resolveAlign,
} from './profile-look'
import { PHOTO_STYLE, type AvatarStyle } from './avatar-backdrop'

const cutout = (side: 'left' | 'center' | 'right'): AvatarStyle => ({
  kind: 'backdrop',
  id: 'banner-01',
  cutout: 'https://x.test/avatar-cutout.webp',
  side,
  frame: { x: 0.2, y: 0.05, s: 0.6 },
})

describe('parseProfileLook', () => {
  it('treats null, arrays and garbage as the default look', () => {
    expect(parseProfileLook(null)).toEqual(DEFAULT_LOOK)
    expect(parseProfileLook([])).toEqual(DEFAULT_LOOK)
    expect(parseProfileLook('bw')).toEqual(DEFAULT_LOOK)
  })

  it('keeps each valid field and drops each invalid one on its own', () => {
    expect(parseProfileLook({ photo: 'bw', tone: 'colour', accent: '#5e7a8c', align: 'left' })).toEqual({
      photo: 'bw',
      tone: 'colour',
      accent: '#5E7A8C',
      align: 'left',
    })
    expect(parseProfileLook({ photo: 'sepia', tone: 'loud', accent: 'red', align: 'top' })).toEqual(DEFAULT_LOOK)
    expect(parseProfileLook({ photo: 'bw' }).photo).toBe('bw')
  })
})

describe('resolveAlign', () => {
  it('lets an explicit choice win', () => {
    expect(resolveAlign({ ...DEFAULT_LOOK, align: 'center' }, cutout('left'))).toBe('center')
  })

  it('follows the cut-out on auto, and stands a plain photo on the right', () => {
    expect(resolveAlign(DEFAULT_LOOK, cutout('left'))).toBe('left')
    expect(resolveAlign(DEFAULT_LOOK, PHOTO_STYLE)).toBe('right')
  })
})

describe('accentOnDark', () => {
  it('leaves every preset readable on the darkest card', () => {
    for (const { hex } of ACCENT_PRESETS) {
      expect(contrastRatio(accentOnDark(hex), '#2A2A27')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves a colour that already reads alone', () => {
    expect(accentOnDark('#97D700')).toBe('#97D700')
  })

  it('lifts navy toward white rather than replacing it', () => {
    const lifted = accentOnDark('#041E42')
    expect(lifted).not.toBe('#041E42')
    expect(lifted).not.toBe('#FFFFFF')
  })
})

describe('lookAttributes', () => {
  it('hands the stylesheet its attributes and both accents', () => {
    const attrs = lookAttributes({ ...DEFAULT_LOOK, photo: 'bw' })
    expect(attrs['data-photo']).toBe('bw')
    expect(attrs['data-tone']).toBe('mono')
    expect(attrs.style['--accent']).toBe(DEFAULT_LOOK.accent)
    expect(attrs.style['--accent-dark']).toMatch(/^#[0-9A-F]{6}$/)
  })
})
