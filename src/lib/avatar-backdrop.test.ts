import { describe, it, expect } from 'vitest'
import {
  AVATAR_BACKDROPS,
  avatarBackdropImage,
  avatarKeys,
  isCutoutStyle,
  parseAvatarStyle,
} from './avatar-backdrop'

const frame = { x: 0.2, y: 0.05, s: 0.6 }
const good = {
  kind: 'backdrop',
  id: AVATAR_BACKDROPS[0].id,
  cutout: 'https://x.supabase.co/storage/v1/object/public/avatars/u/avatar-cutout.webp?v=1',
  side: 'right',
  frame,
}

describe('parseAvatarStyle', () => {
  it('treats null, garbage and unknown kinds as the plain photo', () => {
    for (const v of [null, undefined, 'x', 7, [], {}, { kind: 'hologram' }, { kind: 'photo', extra: 1 }]) {
      expect(parseAvatarStyle(v)).toEqual({ kind: 'photo' })
    }
  })

  it('accepts a complete backdrop spec and drops unknown fields', () => {
    const s = parseAvatarStyle({ ...good, animated: true, junk: 'no' })
    expect(s).toEqual({ kind: 'backdrop', id: good.id, cutout: good.cutout, side: 'right', frame, animated: true })
    expect(isCutoutStyle(s)).toBe(true)
    expect(avatarBackdropImage(s)).toBe(AVATAR_BACKDROPS[0].url)
  })

  it('degrades a half-written cut-out to the photo — the hero must never draw a cut-out it lacks', () => {
    expect(parseAvatarStyle({ ...good, cutout: '' })).toEqual({ kind: 'photo' })
    expect(parseAvatarStyle({ ...good, side: 'up' })).toEqual({ kind: 'photo' })
    expect(parseAvatarStyle({ ...good, frame: { x: 0.2, y: 0.1 } })).toEqual({ kind: 'photo' })
    expect(parseAvatarStyle({ ...good, frame: { x: -1, y: 0.1, s: 0.5 } })).toEqual({ kind: 'photo' })
    expect(parseAvatarStyle({ ...good, id: 'banner-99' })).toEqual({ kind: 'photo' })
  })

  it('validates gradient colours', () => {
    const g = { ...good, kind: 'gradient', id: undefined, colors: ['#2A5788', '#97D700'], seed: 3 }
    expect(parseAvatarStyle(g)).toMatchObject({ kind: 'gradient', colors: ['#2A5788', '#97D700'], seed: 3 })
    expect(parseAvatarStyle({ ...g, colors: ['#2A5788'] })).toEqual({ kind: 'photo' })
    expect(parseAvatarStyle({ ...g, colors: ['red', 'blue'] })).toEqual({ kind: 'photo' })
    expect(parseAvatarStyle({ ...g, colors: ['#1', '#2', '#3', '#4', '#5'] })).toEqual({ kind: 'photo' })
  })

  it('animated is only ever true or absent', () => {
    expect(parseAvatarStyle({ ...good, animated: 'yes' })).not.toHaveProperty('animated', 'yes')
    expect((parseAvatarStyle({ ...good, animated: false }) as any).animated).toBeUndefined()
  })
})

describe('avatarKeys', () => {
  it('keeps all three objects in the member folder the 006 policies cover', () => {
    const k = avatarKeys('abc')
    expect(k.source).toBe('abc/avatar-source')
    expect(k.cutout).toBe('abc/avatar-cutout')
    expect(k.avatar).toBe('abc/avatar')
  })
})
