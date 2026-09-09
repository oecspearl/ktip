import { describe, expect, it } from 'vitest'
import { EMAIL_STEP_UP_DAYS, maskEmail, stepUpDaysLeft } from './mfa'

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('delon.pierre@oecs.int')).toBe('d•••@oecs.int')
  })

  it('hands back anything that is not an address untouched', () => {
    expect(maskEmail('')).toBe('')
    expect(maskEmail(null)).toBe('')
    expect(maskEmail('@nope')).toBe('@nope')
  })
})

describe('stepUpDaysLeft', () => {
  const now = Date.parse('2026-09-09T12:00:00Z')

  it('rounds up so "1 day left" is never shown for 23 hours as 0', () => {
    expect(stepUpDaysLeft('2026-09-10T11:00:00Z', now)).toBe(1)
    expect(stepUpDaysLeft('2026-10-09T12:00:00Z', now)).toBe(EMAIL_STEP_UP_DAYS)
  })

  it('is 0 once lapsed and null when there is nothing', () => {
    expect(stepUpDaysLeft('2026-09-01T00:00:00Z', now)).toBe(0)
    expect(stepUpDaysLeft(null, now)).toBeNull()
    expect(stepUpDaysLeft('not a date', now)).toBeNull()
  })
})
