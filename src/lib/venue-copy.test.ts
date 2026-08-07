import { describe, expect, it } from 'vitest'
import { venueCopy } from './venue-copy'

describe('venueCopy', () => {
  it('gives conferences their own vocabulary', () => {
    expect(venueCopy('conference', 'continueLabel')).not.toBe(
      venueCopy('hackathon', 'continueLabel')
    )
    expect(venueCopy('conference', 'setupSubtitle')).not.toBe(
      venueCopy('hackathon', 'setupSubtitle')
    )
  })

  it('falls back to the hackathon wording for every other type, known or not', () => {
    const fallback = venueCopy(undefined, 'continueLabel')
    expect(venueCopy('hackathon', 'continueLabel')).toBe(fallback)
    expect(venueCopy('workshop', 'continueLabel')).toBe(fallback)
    expect(venueCopy('symposium', 'continueLabel')).toBe(fallback)
    expect(venueCopy(null, 'continueLabel')).toBe(fallback)
  })

  it('always resolves to a descriptor — no key can come back undefined', () => {
    for (const key of ['setupSubtitle', 'continueLabel'] as const) {
      expect(venueCopy('conference', key)).toBeTruthy()
      expect(venueCopy(undefined, key)).toBeTruthy()
    }
  })
})
