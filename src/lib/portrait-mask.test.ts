import { describe, it, expect } from 'vitest'
import {
  analyseMask,
  coverageIsPlausible,
  frameToPixels,
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
