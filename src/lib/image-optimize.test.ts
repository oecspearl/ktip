import { describe, it, expect } from 'vitest'
import { fitDimensions, renameToWebp, extensionOf, shouldSkipOptimization } from './image-optimize'

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

describe('fitDimensions', () => {
  it('scales the longest edge down to maxDim', () => {
    expect(fitDimensions(4000, 3000, 800)).toEqual({ width: 800, height: 600 })
  })

  it('scales portrait images by their height', () => {
    expect(fitDimensions(3000, 4000, 800)).toEqual({ width: 600, height: 800 })
  })

  it('never upscales', () => {
    expect(fitDimensions(200, 100, 512)).toEqual({ width: 200, height: 100 })
  })

  it('leaves an exactly-sized image alone', () => {
    expect(fitDimensions(512, 512, 512)).toEqual({ width: 512, height: 512 })
  })

  it('keeps a very wide image at least 1px tall', () => {
    expect(fitDimensions(10000, 5, 512).height).toBe(1)
  })

  it('handles zero dimensions without dividing by zero', () => {
    expect(fitDimensions(0, 0, 512)).toEqual({ width: 0, height: 0 })
  })
})

describe('renameToWebp', () => {
  it('replaces the extension', () => {
    expect(renameToWebp('photo.jpg')).toBe('photo.webp')
  })

  it('only replaces the last extension', () => {
    expect(renameToWebp('my.holiday.photo.JPEG')).toBe('my.holiday.photo.webp')
  })

  it('appends when there is no extension', () => {
    expect(renameToWebp('photo')).toBe('photo.webp')
  })

  it('falls back to a name when the file is only an extension', () => {
    expect(renameToWebp('.jpg')).toBe('image.webp')
  })
})

describe('extensionOf', () => {
  it('lowercases the extension', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg')
  })

  it('defaults to webp when there is none', () => {
    expect(extensionOf('photo')).toBe('webp')
  })
})

describe('shouldSkipOptimization', () => {
  it('skips non-images', () => {
    expect(shouldSkipOptimization(fileOf('doc.pdf', 'application/pdf'))).toBe(true)
  })

  it('skips SVG so vectors are not rasterized', () => {
    expect(shouldSkipOptimization(fileOf('logo.svg', 'image/svg+xml'))).toBe(true)
  })

  it('skips GIF so animation is not flattened', () => {
    expect(shouldSkipOptimization(fileOf('loop.gif', 'image/gif'))).toBe(true)
  })

  it('optimizes JPEG and PNG', () => {
    expect(shouldSkipOptimization(fileOf('a.jpg', 'image/jpeg'))).toBe(false)
    expect(shouldSkipOptimization(fileOf('a.png', 'image/png'))).toBe(false)
  })
})
