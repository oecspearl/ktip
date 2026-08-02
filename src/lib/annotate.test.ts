import { describe, expect, it } from 'vitest'
import {
  arrowHead,
  beginShape,
  ellipseFromPoints,
  extendShape,
  isDegenerate,
  undo,
} from './annotate'

describe('beginShape', () => {
  it('starts with both ends together so a click without a drag still has a shape', () => {
    const s = beginShape('arrow', '#E23D28', { x: 10, y: 20 })
    expect(s.points).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 20 },
    ])
  })
})

describe('extendShape', () => {
  it('accumulates a trail for the pen', () => {
    let s = beginShape('pen', '#E23D28', { x: 0, y: 0 })
    s = extendShape(s, { x: 5, y: 5 })
    s = extendShape(s, { x: 9, y: 9 })
    expect(s.points).toHaveLength(4)
    expect(s.points[3]).toEqual({ x: 9, y: 9 })
  })

  it('keeps only start and current end for an ellipse, so dragging back shrinks it', () => {
    let s = beginShape('ellipse', '#E23D28', { x: 0, y: 0 })
    s = extendShape(s, { x: 100, y: 100 })
    s = extendShape(s, { x: 20, y: 20 })
    expect(s.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ])
  })

  it('does not mutate the shape it was given', () => {
    const s = beginShape('pen', '#E23D28', { x: 0, y: 0 })
    extendShape(s, { x: 5, y: 5 })
    expect(s.points).toHaveLength(2)
  })
})

describe('isDegenerate', () => {
  it('flags a stray click that never moved', () => {
    expect(isDegenerate(beginShape('pen', '#E23D28', { x: 4, y: 4 }))).toBe(true)
  })

  it('accepts a stroke that actually travelled', () => {
    const s = extendShape(beginShape('pen', '#E23D28', { x: 0, y: 0 }), { x: 40, y: 0 })
    expect(isDegenerate(s)).toBe(false)
  })
})

describe('undo', () => {
  const a = beginShape('pen', '#E23D28', { x: 0, y: 0 })
  const b = beginShape('arrow', '#FFC72C', { x: 1, y: 1 })

  it('removes the last shape only', () => {
    expect(undo([a, b])).toEqual([a])
  })

  it('is safe on an empty list', () => {
    expect(undo([])).toEqual([])
  })
})

describe('ellipseFromPoints', () => {
  it('centres between the corners with half-span radii', () => {
    expect(ellipseFromPoints({ x: 0, y: 0 }, { x: 100, y: 40 })).toEqual({
      cx: 50,
      cy: 20,
      rx: 50,
      ry: 20,
    })
  })

  it('handles a drag up-and-left, where the radii would otherwise go negative', () => {
    expect(ellipseFromPoints({ x: 100, y: 40 }, { x: 0, y: 0 })).toEqual({
      cx: 50,
      cy: 20,
      rx: 50,
      ry: 20,
    })
  })
})

describe('arrowHead', () => {
  it('puts both barbs behind the tip, symmetric about the shaft', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 0 }
    const [a, b] = arrowHead(from, to, 4)

    expect(a.x).toBeLessThan(to.x)
    expect(b.x).toBeLessThan(to.x)
    expect(a.y).toBeCloseTo(-b.y, 6)
  })

  it('scales the head with stroke width, so a thick arrow is not pin-tipped', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 400, y: 0 }
    const thin = arrowHead(from, to, 2)[0]
    const thick = arrowHead(from, to, 10)[0]
    expect(to.x - thick.x).toBeGreaterThan(to.x - thin.x)
  })

  it('caps the head at a third of a short shaft, so it is not all head', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 12, y: 0 }
    const [a] = arrowHead(from, to, 10)
    expect(to.x - a.x).toBeLessThanOrEqual(12 / 3 + 0.001)
  })

  it('does not produce NaN when the arrow has no length', () => {
    const [a, b] = arrowHead({ x: 5, y: 5 }, { x: 5, y: 5 }, 4)
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true)
    expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true)
  })
})
