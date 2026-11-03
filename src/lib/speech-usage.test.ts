import { describe, expect, it } from 'vitest'
import { MAX_SEGMENT_SECONDS, createUsageMeter, segmentSeconds } from './speech-usage'

describe('createUsageMeter', () => {
  it('adds up and sends the rounded total once', () => {
    const sent: number[] = []
    const meter = createUsageMeter((n) => sent.push(n))
    meter.add(1.4)
    meter.add(2.3)
    expect(meter.flush()).toBe(4)
    expect(meter.flush()).toBe(0)
    expect(sent).toEqual([4])
  })

  it('ignores zero, negative and non-finite amounts', () => {
    const sent: number[] = []
    const meter = createUsageMeter((n) => sent.push(n))
    meter.add(0)
    meter.add(-5)
    meter.add(Number.NaN)
    meter.add(Number.POSITIVE_INFINITY)
    expect(meter.flush()).toBe(0)
    expect(sent).toEqual([])
  })
})

describe('segmentSeconds', () => {
  it('measures from the first interim to the final', () => {
    expect(segmentSeconds(1_000, 4_500)).toBe(3.5)
  })

  it('is zero without a start, or with a clock that went backwards', () => {
    expect(segmentSeconds(null, 4_500)).toBe(0)
    expect(segmentSeconds(5_000, 4_500)).toBe(0)
  })

  it('caps a segment left hanging over a long pause', () => {
    expect(segmentSeconds(0, 600_000)).toBe(MAX_SEGMENT_SECONDS)
  })
})
