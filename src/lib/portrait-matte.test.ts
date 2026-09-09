import { describe, expect, it } from 'vitest'
import { boxMean, greyGuide, guidedFilter, refineMatte } from './portrait-matte'

/** A mask with a filled rectangle of 1s. */
function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Float32Array {
  const m = new Float32Array(w * h)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1
  return m
}

describe('refineMatte — islands', () => {
  it('drops a detached blob and keeps the body', () => {
    const w = 40
    const h = 40
    const mask = rect(w, h, 5, 5, 24, 34) // the person: 20 × 30
    // A leak in the far corner, well under 20% of the body.
    for (let y = 1; y <= 4; y++) for (let x = 32; x <= 36; x++) mask[y * w + x] = 1

    const out = refineMatte(mask, w, h, { radius: 0 })

    expect(out.droppedComponents).toBe(1)
    expect(out.droppedPixels).toBe(20)
    expect(out.mask[2 * w + 34]).toBe(0)
    expect(out.mask[20 * w + 15]).toBe(1)
  })

  it('keeps a detached piece that is substantial — a raised hand, an elbow', () => {
    const w = 40
    const h = 40
    const mask = rect(w, h, 5, 5, 20, 30)
    // Half the body's area, detached: not a leak, and deleting it would take
    // a limb off a member.
    for (let y = 5; y <= 20; y++) for (let x = 26; x <= 37; x++) mask[y * w + x] = 1

    const out = refineMatte(mask, w, h, { radius: 0 })

    expect(out.droppedComponents).toBe(0)
    expect(out.mask[10 * w + 30]).toBe(1)
  })

  it('clears the soft fringe around a dropped island, not just its core', () => {
    const w = 30
    const h = 30
    const mask = rect(w, h, 2, 2, 20, 27)
    for (let y = 2; y <= 4; y++) for (let x = 25; x <= 27; x++) mask[y * w + x] = 1
    // The half-confident halo the model puts around its own leak.
    mask[1 * 30 + 25] = 0.4
    mask[5 * 30 + 26] = 0.45

    const out = refineMatte(mask, w, h, { radius: 0 })

    expect(out.mask[1 * 30 + 25]).toBe(0)
    expect(out.mask[5 * 30 + 26]).toBe(0)
  })

  it('leaves a single-component mask untouched', () => {
    const w = 20
    const h = 20
    const mask = rect(w, h, 4, 4, 15, 15)
    const out = refineMatte(mask, w, h, { radius: 0 })
    expect(out.droppedComponents).toBe(0)
    expect(out.droppedPixels).toBe(0)
    expect(Array.from(out.mask)).toEqual(Array.from(mask))
  })

  it('joins a diagonal hair strand rather than snipping it off', () => {
    const w = 24
    const h = 24
    const mask = rect(w, h, 4, 10, 19, 22)
    // A one-pixel diagonal running up out of the head.
    for (let i = 0; i < 6; i++) mask[(9 - i) * w + (10 + i)] = 1

    const out = refineMatte(mask, w, h, { radius: 0 })

    expect(out.droppedComponents).toBe(0)
    expect(out.mask[4 * w + 15]).toBe(1)
  })
})

describe('refineMatte — holes', () => {
  it('fills a small enclosed hole', () => {
    const w = 40
    const h = 40
    const mask = rect(w, h, 4, 4, 35, 35)
    // 3 × 3 gap in the middle of the subject: 9 px, well under 2% of 1600.
    for (let y = 18; y <= 20; y++) for (let x = 18; x <= 20; x++) mask[y * w + x] = 0

    const out = refineMatte(mask, w, h, { radius: 0 })

    expect(out.filledHoles).toBe(1)
    expect(out.filledPixels).toBe(9)
    expect(out.mask[19 * w + 19]).toBe(1)
  })

  it('leaves a large enclosed gap alone — an arm on a hip is not a mistake', () => {
    const w = 40
    const h = 40
    const mask = rect(w, h, 2, 2, 37, 37)
    // 12 × 12 = 144 px = 9% of the frame, past the 2% cap.
    for (let y = 12; y <= 23; y++) for (let x = 12; x <= 23; x++) mask[y * w + x] = 0

    const out = refineMatte(mask, w, h, { radius: 0 })

    expect(out.filledHoles).toBe(0)
    expect(out.mask[18 * w + 18]).toBe(0)
  })

  it('does not fill the background that touches the frame', () => {
    const w = 30
    const h = 30
    const mask = rect(w, h, 10, 10, 20, 20)
    const out = refineMatte(mask, w, h, { radius: 0 })
    expect(out.filledHoles).toBe(0)
    expect(out.mask[0]).toBe(0)
  })
})

describe('boxMean', () => {
  it('averages a constant field to itself', () => {
    const src = new Float32Array(64).fill(0.25)
    const out = boxMean(src, 8, 8, 2)
    for (const v of out) expect(v).toBeCloseTo(0.25, 6)
  })

  it('shrinks the window at the edges instead of counting missing pixels', () => {
    // One hot pixel at the corner: the 3×3 window there covers 4 real pixels.
    const src = new Float32Array(16)
    src[0] = 1
    const out = boxMean(src, 4, 4, 1)
    expect(out[0]).toBeCloseTo(1 / 4, 6)
  })

  it('stays exact over an area far larger than a Float32 mantissa', () => {
    // 1200² ones: a Float32 running sum drifts here, a Float64 table does not.
    const w = 1200
    const h = 1200
    const src = new Float32Array(w * h).fill(1)
    const out = boxMean(src, w, h, 3)
    expect(out[w * h - 1]).toBeCloseTo(1, 6)
    expect(out[(h - 1) * w + w - 1]).toBeCloseTo(1, 6)
  })
})

describe('guidedFilter', () => {
  it('snaps a blurred mask edge back onto the photo edge', () => {
    // A guide that is black on the left half and white on the right; a mask
    // whose edge is smeared twenty pixels across that boundary.
    const w = 32
    const h = 32
    const guide = new Float32Array(w * h)
    const mask = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        guide[y * w + x] = x < 16 ? 0 : 1
        mask[y * w + x] = Math.max(0, Math.min(1, (x - 6) / 20))
      }
    }
    const row = 16 * w
    const inside = mask[row + 20]
    const outside = mask[row + 12]
    const across = mask[row + 16] - mask[row + 15]

    guidedFilter(mask, guide, w, h, 6, 1e-4)

    // The mask now falls where the photo does. Measured as contrast: the
    // subject side rises, the background side drops, and the step lands ON
    // the boundary instead of being spread over twenty pixels.
    expect(mask[row + 20]).toBeGreaterThan(inside)
    expect(mask[row + 12]).toBeLessThan(outside)
    // 0.40 across those two points before the filter; the step is now steeper
    // AND centred on the boundary rather than spread either side of it.
    expect(mask[row + 20] - mask[row + 12]).toBeGreaterThan(0.5)
    expect(mask[row + 16] - mask[row + 15]).toBeGreaterThan(across * 5)
  })

  it('is a no-op on a flat guide beyond smoothing', () => {
    const w = 16
    const h = 16
    const guide = new Float32Array(w * h).fill(0.5)
    const mask = new Float32Array(w * h).fill(0.3)
    guidedFilter(mask, guide, w, h, 3, 1e-3)
    for (const v of mask) expect(v).toBeCloseTo(0.3, 4)
  })
})

describe('greyGuide', () => {
  it('reads luma out of RGBA bytes', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
    const grey = greyGuide(rgba)
    expect(grey[0]).toBeCloseTo(1, 5)
    expect(grey[1]).toBeCloseTo(0, 5)
  })
})

describe('refineMatte — contract', () => {
  it('refuses a mask whose length does not match the frame', () => {
    expect(() => refineMatte(new Float32Array(10), 4, 4)).toThrow(/length/)
  })

  it('never returns a value outside 0..1', () => {
    const w = 24
    const h = 24
    const guide = new Float32Array(w * h)
    const mask = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) {
      guide[i] = (i % w) / w
      mask[i] = i % 3 === 0 ? 1 : 0.2
    }
    const out = refineMatte(mask, w, h, { guide, radius: 4 })
    for (const v of out.mask) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
