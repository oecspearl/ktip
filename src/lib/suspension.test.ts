import { describe, expect, it } from 'vitest'
import {
  isSuspendedNow,
  isSuspensionExemptPath,
  SUSPENDED_PATH,
  suspensionRedirect,
  toSuspension,
  type Suspension,
} from './suspension'

const NOW = new Date('2026-11-02T12:00:00Z')

function s(overrides: Partial<Suspension> = {}): Suspension {
  return { isSuspended: true, until: null, reason: null, since: null, ...overrides }
}

describe('isSuspendedNow', () => {
  it('is false with no suspension at all', () => {
    expect(isSuspendedNow(null, NOW)).toBe(false)
    expect(isSuspendedNow(undefined, NOW)).toBe(false)
    expect(isSuspendedNow(s({ isSuspended: false }), NOW)).toBe(false)
  })

  it('holds an open-ended suspension', () => {
    expect(isSuspendedNow(s(), NOW)).toBe(true)
  })

  it('holds until the end date, then lifts by itself', () => {
    expect(isSuspendedNow(s({ until: '2026-11-03T00:00:00Z' }), NOW)).toBe(true)
    expect(isSuspendedNow(s({ until: '2026-11-01T00:00:00Z' }), NOW)).toBe(false)
    // The boundary matches is_suspended(): suspended_until > now().
    expect(isSuspendedNow(s({ until: NOW.toISOString() }), NOW)).toBe(false)
  })

  it('reads an unparseable end date as no end date', () => {
    expect(isSuspendedNow(s({ until: 'not a date' }), NOW)).toBe(true)
  })
})

describe('suspensionRedirect', () => {
  it('lets an active member go anywhere', () => {
    expect(suspensionRedirect('/dashboard', s({ isSuspended: false }), NOW)).toBeNull()
    expect(suspensionRedirect('/dashboard', null, NOW)).toBeNull()
  })

  it('sends a suspended member to the suspended page', () => {
    expect(suspensionRedirect('/', s(), NOW)).toBe(SUSPENDED_PATH)
    expect(suspensionRedirect('/admin/users', s(), NOW)).toBe(SUSPENDED_PATH)
    expect(suspensionRedirect('/legalese', s(), NOW)).toBe(SUSPENDED_PATH)
  })

  it('leaves the policies and the page itself open', () => {
    expect(suspensionRedirect(SUSPENDED_PATH, s(), NOW)).toBeNull()
    expect(suspensionRedirect('/legal', s(), NOW)).toBeNull()
    expect(suspensionRedirect('/legal/acceptable-use', s(), NOW)).toBeNull()
    expect(suspensionRedirect('/terms', s(), NOW)).toBeNull()
    expect(isSuspensionExemptPath('/privacy')).toBe(true)
  })

  it('stops redirecting once a timed suspension has ended', () => {
    expect(suspensionRedirect('/dashboard', s({ until: '2026-10-30T00:00:00Z' }), NOW)).toBeNull()
  })
})

describe('toSuspension', () => {
  it('maps the RPC row', () => {
    expect(
      toSuspension({
        is_suspended: true,
        suspended_until: '2026-12-01T00:00:00Z',
        suspension_reason: 'Spam',
        suspended_at: '2026-11-01T00:00:00Z',
      })
    ).toEqual({ isSuspended: true, until: '2026-12-01T00:00:00Z', reason: 'Spam', since: '2026-11-01T00:00:00Z' })
  })

  it('reads missing columns as not suspended', () => {
    expect(toSuspension({})).toEqual({ isSuspended: false, until: null, reason: null, since: null })
    expect(toSuspension(null)).toBeNull()
  })
})
