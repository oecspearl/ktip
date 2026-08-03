import { describe, expect, it } from 'vitest'
import {
  EMPTY_MANIFEST,
  IMG_BASE,
  LADDERS,
  capLadder,
  settingsHash,
  srcKeyParts,
  variantPath,
} from './image-variants'
import { lookupManifest } from './image-manifest'

describe('capLadder', () => {
  it('never upscales past the source', () => {
    // Mirrors sharp's withoutEnlargement: a rung above the source would be a
    // blurrier copy of it, not a larger one.
    expect(capLadder(1600, LADDERS.hero)).toEqual([640, 960, 1280, 1600])
    expect(capLadder(1920, LADDERS.hero)).toEqual([640, 960, 1280, 1920])
  })

  it('keeps the source width as a rung when it falls between steps', () => {
    // ktiphero.webp is 1748 wide. Without this it would top out at 1280 and a
    // full-bleed backdrop would be upscaled on every desktop.
    expect(capLadder(1748, LADDERS.hero)).toEqual([640, 960, 1280, 1748])
  })

  it('does not duplicate a source width that is already a rung', () => {
    expect(capLadder(960, LADDERS.hero)).toEqual([640, 960])
  })

  it('returns the source alone when it is smaller than every rung', () => {
    expect(capLadder(285, LADDERS.pages)).toEqual([285])
  })

  it('returns nothing for a source with no width', () => {
    expect(capLadder(0, LADDERS.hero)).toEqual([])
  })
})

describe('variantPath', () => {
  it('round-trips the exact filename the generator writes', () => {
    // This is THE contract: the generator and the browser build this string
    // independently, and a mismatch is a 404 that nothing catches at build time.
    expect(variantPath('hero', 'hero-1', 1280, '4f3a9c21', 'avif')).toBe(
      '/_img/hero/hero-1-1280.4f3a9c21.avif'
    )
  })

  it('puts the hash before the extension so the file is content-addressed', () => {
    // A query string would not survive the immutable Cache-Control in
    // vercel.json the way a distinct filename does.
    const path = variantPath('grants', 'grant-nature', 640, 'deadbeef', 'webp')
    expect(path.endsWith('.deadbeef.webp')).toBe(true)
    expect(path).not.toContain('?')
  })

  it('is rooted at the base the manifest advertises', () => {
    expect(variantPath('pages', 'page-help', 960, 'abc12345', 'avif').startsWith(IMG_BASE)).toBe(
      true
    )
  })
})

describe('srcKeyParts', () => {
  it('splits a nested source key', () => {
    expect(srcKeyParts('/hero/hero-1.webp')).toEqual({ dir: 'hero', name: 'hero-1' })
  })

  it('files a root-level source under root so variants stay one level deep', () => {
    expect(srcKeyParts('/ktiphero.webp')).toEqual({ dir: 'root', name: 'ktiphero' })
  })

  it('keeps dots inside the basename', () => {
    expect(srcKeyParts('/pages/page-v1.2.webp')).toEqual({ dir: 'pages', name: 'page-v1.2' })
  })
})

describe('settingsHash', () => {
  it('changes when any encoder value changes', () => {
    // Without this a quality edit would leave every cached variant in place:
    // the source bytes did not change, so nothing else would notice.
    const before = settingsHash({ avif: { quality: 50 } })
    expect(settingsHash({ avif: { quality: 51 } })).not.toBe(before)
  })

  it('is stable for equal settings', () => {
    expect(settingsHash({ a: 1, b: [2, 3] })).toBe(settingsHash({ a: 1, b: [2, 3] }))
  })

  it('is eight hex characters', () => {
    expect(settingsHash({ anything: true })).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('lookupManifest', () => {
  const images = {
    '/hero/hero-1.webp': { w: 1920, h: 1280, hash: 'aaaaaaaa', widths: [640, 1920] },
  }

  it('finds a plain key', () => {
    expect(lookupManifest(images, '/hero/hero-1.webp')?.w).toBe(1920)
  })

  it('finds a key carrying the ?v= cache-buster storage-upload.ts appends', () => {
    expect(lookupManifest(images, '/hero/hero-1.webp?v=1738000000')?.hash).toBe('aaaaaaaa')
  })

  it('misses cleanly for a remote URL', () => {
    expect(lookupManifest(images, 'https://images.unsplash.com/photo-1?w=800')).toBeUndefined()
  })

  it('misses cleanly for an empty src', () => {
    expect(lookupManifest(images, '')).toBeUndefined()
  })

  it('misses every lookup against the empty manifest', () => {
    // The degraded path: no generator run means no srcset, not a broken page.
    expect(lookupManifest(EMPTY_MANIFEST.images, '/hero/hero-1.webp')).toBeUndefined()
  })
})
