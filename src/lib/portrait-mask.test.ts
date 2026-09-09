import { describe, it, expect } from 'vitest'
import {
  alphaBounds,
  analyseMask,
  coverageIsPlausible,
  frameToPixels,
  remapAnalysis,
  subjectSideOf,
} from './portrait-mask'

/**
 * Paint a synthetic "person": a head circle over a shoulder block, on a w×h
 * mask, with the head centred at (hx, hy) and radius r. Shoulders run from the
 * neck down to the bottom edge — which is exactly what makes the bounding box
 * useless for framing and is the case the head-based crop exists for.
 */
function person(w: number, h: number, hx: number, hy: number, r: number): Float32Array {
  const m = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inHead = (x - hx) ** 2 + (y - hy) ** 2 <= r * r
      const inBody = y > hy + r * 0.8 && Math.abs(x - hx) < r * 2.2 * Math.min(1, (y - hy - r * 0.8) / (r * 1.5) + 0.3)
      m[y * w + x] = inHead || inBody ? 1 : 0
    }
  }
  return m
}

describe('subjectSideOf', () => {
  it('splits the frame into thirds around the centre', () => {
    expect(subjectSideOf(0.2)).toBe('left')
    expect(subjectSideOf(0.5)).toBe('center')
    expect(subjectSideOf(0.8)).toBe('right')
    expect(subjectSideOf(0.42)).toBe('center')
    expect(subjectSideOf(0.58)).toBe('center')
  })
})

describe('analyseMask', () => {
  it('finds the head, not the shoulders, and frames it', () => {
    const W = 200, H = 260
    const a = analyseMask(person(W, H, 100, 60, 30), W, H)
    // Body reaches the bottom edge: bbox is tall but the frame is about the head.
    expect(a.bbox!.h).toBeGreaterThan(0.8)
    expect(a.head.cx).toBeCloseTo(0.5, 1)
    expect(a.head.w * W).toBeGreaterThan(40)
    expect(a.head.w * W).toBeLessThan(70)
    // Head centre lands inside the frame, in its upper half.
    const f = frameToPixels(a.frame, W, H)
    expect(a.head.cx * W).toBeGreaterThan(f.x)
    expect(a.head.cx * W).toBeLessThan(f.x + f.s)
    expect(a.head.cy * H).toBeGreaterThan(f.y)
    expect(a.head.cy * H).toBeLessThan(f.y + f.s * 0.5)
    expect(a.side).toBe('center')
  })

  it('reads an off-centre subject as left or right', () => {
    const W = 300, H = 300
    expect(analyseMask(person(W, H, 60, 80, 28), W, H).side).toBe('left')
    expect(analyseMask(person(W, H, 240, 80, 28), W, H).side).toBe('right')
  })

  it('keeps the frame inside the image for a subject at the edge', () => {
    const W = 300, H = 300
    const a = analyseMask(person(W, H, 20, 40, 30), W, H)
    const f = frameToPixels(a.frame, W, H)
    expect(f.x).toBeGreaterThanOrEqual(0)
    expect(f.y).toBeGreaterThanOrEqual(0)
    expect(f.x + f.s).toBeLessThanOrEqual(W + 1e-6)
    expect(f.y + f.s).toBeLessThanOrEqual(H + 1e-6)
  })

  it('reports coverage and softness', () => {
    const W = 50, H = 50
    const m = new Float32Array(W * H)
    for (let i = 0; i < m.length; i++) m[i] = i < 1000 ? 1 : i < 1250 ? 0.5 : 0
    const a = analyseMask(m, W, H)
    expect(a.coverage).toBeCloseTo(0.4, 5)
    expect(a.softness).toBeCloseTo(0.1, 5)
  })

  it('degrades to a centred frame when nothing is kept', () => {
    const a = analyseMask(new Float32Array(100 * 100), 100, 100)
    expect(a.coverage).toBe(0)
    expect(a.bbox).toBeNull()
    expect(a.side).toBe('center')
    expect(a.frame.s).toBeGreaterThan(0)
  })
})

describe('coverageIsPlausible', () => {
  it('rejects nothing-found and no-background', () => {
    expect(coverageIsPlausible(0.02)).toBe(false)
    expect(coverageIsPlausible(0.98)).toBe(false)
    // Measured range on good cuts in the spike.
    expect(coverageIsPlausible(0.39)).toBe(true)
    expect(coverageIsPlausible(0.92)).toBe(true)
  })
})

describe('alphaBounds', () => {
  it('finds the rectangle of kept pixels, padded and clamped', () => {
    const w = 40
    const h = 30
    const m = new Float32Array(w * h)
    for (let y = 10; y < 20; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 1
    expect(alphaBounds(m, w, h)).toEqual({ x: 5, y: 10, w: 10, h: 10 })
    expect(alphaBounds(m, w, h, 0.02, 3)).toEqual({ x: 2, y: 7, w: 16, h: 16 })
    expect(alphaBounds(m, w, h, 0.02, 100)).toEqual({ x: 0, y: 0, w, h })
  })

  it('keeps a faint fringe that the analysis threshold would drop', () => {
    const w = 10
    const m = new Float32Array(w * 10)
    m[5 * w + 5] = 1
    m[5 * w + 2] = 0.05
    expect(alphaBounds(m, w, 10)).toEqual({ x: 2, y: 5, w: 4, h: 1 })
  })

  it('is null for an empty mask', () => {
    expect(alphaBounds(new Float32Array(16), 4, 4)).toBeNull()
  })
})

describe('remapAnalysis', () => {
  it('moves the head and frame into the crop and keeps the side', () => {
    const w = 200
    const h = 200
    // Person on the right of a wide photo: head at (150, 60).
    const m = person(w, h, 150, 60, 20)
    const a = analyseMask(m, w, h)
    expect(a.side).toBe('right')
    const crop = alphaBounds(m, w, h)
    if (!crop) throw new Error('expected bounds')
    const r = remapAnalysis(a, crop, w, h)
    // The same head, in photo pixels.
    expect(r.head.cx * crop.w + crop.x).toBeCloseTo(a.head.cx * w, 5)
    expect(r.head.cy * crop.h + crop.y).toBeCloseTo(a.head.cy * h, 5)
    expect(r.head.w * crop.w).toBeCloseTo(a.head.w * w, 5)
    // Now roughly centred in its own image.
    expect(r.head.cx).toBeGreaterThan(0.3)
    expect(r.head.cx).toBeLessThan(0.7)
    // The frame still fits inside the (smaller) image.
    const f = frameToPixels(r.frame, crop.w, crop.h)
    expect(f.x).toBeGreaterThanOrEqual(0)
    expect(f.y).toBeGreaterThanOrEqual(0)
    expect(f.x + f.s).toBeLessThanOrEqual(crop.w + 1e-6)
    expect(f.y + f.s).toBeLessThanOrEqual(crop.h + 1e-6)
    // Composition is a fact about the photo, not the crop.
    expect(r.side).toBe('right')
    // Fewer transparent pixels: coverage goes up, never past 1.
    expect(r.coverage).toBeGreaterThan(a.coverage)
    expect(r.coverage).toBeLessThanOrEqual(1)
  })

  it('is the identity for a crop that is the whole image', () => {
    const w = 120
    const h = 100
    const a = analyseMask(person(w, h, 60, 30, 15), w, h)
    const r = remapAnalysis(a, { x: 0, y: 0, w, h }, w, h)
    expect(r.head.cx).toBeCloseTo(a.head.cx, 9)
    expect(r.frame.s).toBeCloseTo(a.frame.s, 9)
    expect(r.coverage).toBeCloseTo(a.coverage, 9)
  })
})
