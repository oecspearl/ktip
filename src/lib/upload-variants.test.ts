import { describe, expect, it } from 'vitest'
import {
  AVATAR_VARIANT_WIDTH,
  COVER_VARIANT_WIDTH,
  isVariantKey,
  variantKey,
  variantKeyFor,
  variantUrl,
} from './upload-variants'

const BASE = 'https://abc.supabase.co/storage/v1/object/public'

describe('variantKey', () => {
  it('writes the sibling beside the original, always as WebP', () => {
    // The uploader and the backfill both build this string; the browser
    // derives it from the URL. A mismatch is a 404 on every image.
    expect(variantKey('u1/avatar', 128)).toBe('u1/avatar-128.webp')
    expect(variantKey('u1/banner', 640)).toBe('u1/banner-640.webp')
  })
})

describe('variantKeyFor', () => {
  it('swaps any re-encodable extension for the sized WebP name', () => {
    expect(variantKeyFor('u1/avatar.webp', 128)).toBe('u1/avatar-128.webp')
    expect(variantKeyFor('u1/banner.JPG', 640)).toBe('u1/banner-640.webp')
    expect(variantKeyFor('u1/banner.jpeg', 640)).toBe('u1/banner-640.webp')
    expect(variantKeyFor('u1/employer-logo.png', 128)).toBe('u1/employer-logo-128.webp')
  })

  it('refuses formats the uploader never re-encodes', () => {
    expect(variantKeyFor('u1/avatar.gif', 128)).toBeNull()
    expect(variantKeyFor('u1/avatar.svg', 128)).toBeNull()
    expect(variantKeyFor('u1/avatar', 128)).toBeNull()
  })

  it('never gives a sibling a sibling of its own', () => {
    expect(variantKeyFor('u1/avatar-128.webp', 128)).toBeNull()
    expect(variantKeyFor('u1/banner-640.webp', 640)).toBeNull()
  })
})

describe('isVariantKey', () => {
  it('recognises only the widths a sibling is written at', () => {
    expect(isVariantKey('u1/avatar-128.webp')).toBe(true)
    expect(isVariantKey('u1/banner-640.webp')).toBe(true)
    // A name that merely ends in digits is an original, not a sibling.
    expect(isVariantKey('u1/portfolio-2024.webp')).toBe(false)
    expect(isVariantKey('u1/avatar-source.webp')).toBe(false)
  })
})

describe('variantUrl', () => {
  it('points at the sibling and keeps the cache-bust query', () => {
    expect(variantUrl(`${BASE}/avatars/u1/avatar.webp?v=1700000000000`, AVATAR_VARIANT_WIDTH)).toBe(
      `${BASE}/avatars/u1/avatar-128.webp?v=1700000000000`
    )
    expect(variantUrl(`${BASE}/avatars/u1/banner.webp`, COVER_VARIANT_WIDTH)).toBe(
      `${BASE}/avatars/u1/banner-640.webp`
    )
  })

  it('handles covers in any public bucket', () => {
    expect(variantUrl(`${BASE}/project-images/p1/cover.jpg`, 640)).toBe(
      `${BASE}/project-images/p1/cover-640.webp`
    )
  })

  it('returns null for anything that is not one of our uploads', () => {
    expect(variantUrl(null, 128)).toBeNull()
    expect(variantUrl(undefined, 128)).toBeNull()
    expect(variantUrl('', 128)).toBeNull()
    // Bundled photography has the build-time ladder instead.
    expect(variantUrl('/photos/cohort-1.webp', 640)).toBeNull()
    // Seeded stock photos and OAuth avatars live on other hosts.
    expect(variantUrl('https://images.unsplash.com/photo-1?w=800', 640)).toBeNull()
    expect(variantUrl('https://lh3.googleusercontent.com/a/abc=s96-c', 128)).toBeNull()
    // Signed URLs are private objects; nothing writes siblings for those.
    expect(variantUrl(`https://abc.supabase.co/storage/v1/object/sign/docs/a.webp?token=x`, 640)).toBeNull()
  })

  it('returns null for formats that never get a sibling, and for siblings', () => {
    expect(variantUrl(`${BASE}/avatars/u1/avatar.gif`, 128)).toBeNull()
    expect(variantUrl(`${BASE}/avatars/u1/avatar-128.webp`, 128)).toBeNull()
  })
})
