import { afterEach, describe, expect, it } from 'vitest'
import {
  EMAIL_STEP_UP_DAYS,
  deviceTokenKey,
  forgetDeviceToken,
  maskEmail,
  minutesToWait,
  readDeviceToken,
  saveDeviceToken,
  stepUpDaysLeft,
} from './mfa'

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

describe('minutesToWait', () => {
  it('rounds up and never says zero', () => {
    expect(minutesToWait(1)).toBe(1)
    expect(minutesToWait(0)).toBe(1)
    expect(minutesToWait(61)).toBe(2)
    expect(minutesToWait(3600)).toBe(60)
  })

  it('is null when the server gave no figure', () => {
    expect(minutesToWait(null)).toBeNull()
    expect(minutesToWait(undefined)).toBeNull()
    expect(minutesToWait(Number.NaN)).toBeNull()
  })
})

describe('remembered-browser token', () => {
  const user = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const token = 'a'.repeat(64)

  afterEach(() => localStorage.clear())

  it('round-trips per account, so a shared computer never lends one', () => {
    saveDeviceToken(user, token)
    expect(readDeviceToken(user)).toBe(token)
    expect(readDeviceToken(other)).toBeNull()
  })

  it('ignores anything that is not a token', () => {
    localStorage.setItem(deviceTokenKey(user), 'not-a-token')
    expect(readDeviceToken(user)).toBeNull()
    saveDeviceToken(user, undefined)
    expect(localStorage.getItem(deviceTokenKey(user))).toBe('not-a-token')
  })

  it('forgets', () => {
    saveDeviceToken(user, token)
    forgetDeviceToken(user)
    expect(readDeviceToken(user)).toBeNull()
  })
})
