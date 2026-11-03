import { describe, expect, it } from 'vitest'
import { daysUntil, inRenewalWindow, normaliseVerificationCode } from './verification-term'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const DAY = 86_400_000

describe('daysUntil', () => {
  it('rounds a part day up', () => {
    expect(daysUntil(new Date(NOW + 6.2 * DAY).toISOString(), NOW)).toBe(7)
  })
  it('is zero or negative once the date has passed', () => {
    expect(daysUntil(new Date(NOW - 2 * DAY).toISOString(), NOW)).toBe(-2)
  })
  it('is null for a missing or malformed date', () => {
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('not a date', NOW)).toBeNull()
  })
})

describe('inRenewalWindow', () => {
  it('opens 30 days out, matching the first reminder', () => {
    expect(inRenewalWindow(new Date(NOW + 30 * DAY).toISOString(), NOW)).toBe(true)
    expect(inRenewalWindow(new Date(NOW + 31 * DAY).toISOString(), NOW)).toBe(false)
  })
  it('is closed for a badge that never expires', () => {
    expect(inRenewalWindow(null, NOW)).toBe(false)
  })
})

describe('normaliseVerificationCode', () => {
  it('accepts the printed form, lower case and spaces', () => {
    expect(normaliseVerificationCode('KTIP-7K3M-Q9TD-2HXR')).toBe('7K3MQ9TD2HXR')
    expect(normaliseVerificationCode(' ktip 7k3m q9td 2hxr ')).toBe('7K3MQ9TD2HXR')
  })
  it('reads the usual misreadings as the digits they stand for', () => {
    expect(normaliseVerificationCode('OOOO-IIII-LLLL')).toBe('000011111111')
  })
  it('refuses anything that cannot be a code', () => {
    expect(normaliseVerificationCode('KTIP-7K3M-Q9TD')).toBeNull()
    expect(normaliseVerificationCode('UUUU-UUUU-UUUU')).toBeNull()
    expect(normaliseVerificationCode('')).toBeNull()
  })
})
