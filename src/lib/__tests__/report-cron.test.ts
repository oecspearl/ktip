import { describe, expect, it } from 'vitest'
import { lastClosedPeriodStart } from '../../../api/cron/monthly-report'
import { secretsMatch } from '../../../api/_lib/cron-auth'

describe('lastClosedPeriodStart', () => {
  const firstOfSeptember = new Date('2026-09-01T06:00:00Z')

  it('names the month that just ended, not the one that just began', () => {
    expect(lastClosedPeriodStart('month', firstOfSeptember)).toBe('2026-08-01')
    expect(lastClosedPeriodStart('month', new Date('2026-01-01T06:00:00Z'))).toBe('2025-12-01')
  })

  it('names the quarter that just ended', () => {
    expect(lastClosedPeriodStart('quarter', new Date('2026-10-01T06:00:00Z'))).toBe('2026-07-01')
    expect(lastClosedPeriodStart('quarter', new Date('2026-01-01T06:00:00Z'))).toBe('2025-10-01')
  })

  it('names last year', () => {
    expect(lastClosedPeriodStart('year', firstOfSeptember)).toBe('2025-01-01')
  })
})

describe('secretsMatch', () => {
  it('compares without short-circuiting on length or content', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
    expect(secretsMatch('abc', 'abcd')).toBe(false)
    expect(secretsMatch('', '')).toBe(true)
  })
})
