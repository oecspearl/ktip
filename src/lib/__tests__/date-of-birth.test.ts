import { describe, expect, it } from 'vitest'
import { ageOn, dateOfBirthSchema, isMinorDob, todayIso } from '../validation'
import { canDmAcrossAges, dmBlockedReason } from '../minor-safety'

/** `YYYY-MM-DD` exactly `years` before the reference date. */
function yearsAgo(years: number, from = new Date()): string {
  return todayIso(new Date(from.getFullYear() - years, from.getMonth(), from.getDate()))
}

describe('ageOn', () => {
  it('counts whole years, not elapsed milliseconds', () => {
    expect(ageOn(new Date(2000, 5, 15), new Date(2018, 5, 15))).toBe(18)
  })

  it('does not round up the day before a birthday', () => {
    expect(ageOn(new Date(2000, 5, 15), new Date(2018, 5, 14))).toBe(17)
  })

  it('is right across a leap day, which millisecond arithmetic is not', () => {
    // 2004-02-29 -> 2022-02-28 is one day short of the 18th birthday.
    expect(ageOn(new Date(2004, 1, 29), new Date(2022, 1, 28))).toBe(17)
    expect(ageOn(new Date(2004, 1, 29), new Date(2022, 2, 1))).toBe(18)
  })
})

describe('dateOfBirthSchema', () => {
  it('accepts an adult', () => {
    expect(dateOfBirthSchema.safeParse(yearsAgo(30)).success).toBe(true)
  })

  it('accepts a 17-year-old — minors are allowed in, with protections', () => {
    expect(dateOfBirthSchema.safeParse(yearsAgo(17)).success).toBe(true)
  })

  it('accepts someone who turned 13 today', () => {
    expect(dateOfBirthSchema.safeParse(yearsAgo(13)).success).toBe(true)
  })

  it('rejects a 12-year-old', () => {
    const result = dateOfBirthSchema.safeParse(yearsAgo(12))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least 13/i)
    }
  })

  it('rejects a future date', () => {
    expect(dateOfBirthSchema.safeParse(yearsAgo(-1)).success).toBe(false)
  })

  it('rejects an empty value', () => {
    expect(dateOfBirthSchema.safeParse('').success).toBe(false)
  })

  it('rejects a malformed string', () => {
    expect(dateOfBirthSchema.safeParse('15/06/2000').success).toBe(false)
    expect(dateOfBirthSchema.safeParse('not a date').success).toBe(false)
  })

  it('rejects a date that does not exist', () => {
    // The Date constructor would silently roll this over to 3 March.
    expect(dateOfBirthSchema.safeParse('2001-02-31').success).toBe(false)
  })

  it('rejects an implausible age', () => {
    expect(dateOfBirthSchema.safeParse('1850-01-01').success).toBe(false)
  })
})

describe('isMinorDob', () => {
  it('is true below 18 and false at 18', () => {
    expect(isMinorDob(yearsAgo(17))).toBe(true)
    expect(isMinorDob(yearsAgo(18))).toBe(false)
  })

  it('treats an unparseable value as not-a-minor rather than throwing', () => {
    expect(isMinorDob('nonsense')).toBe(false)
  })
})

describe('todayIso', () => {
  it('uses local calendar fields, not UTC', () => {
    // 23:30 on 31 December in a Caribbean timezone is still 31 December locally
    // even though toISOString() would report 1 January.
    const localNewYearsEve = new Date(2025, 11, 31, 23, 30)
    expect(todayIso(localNewYearsEve)).toBe('2025-12-31')
  })
})

describe('canDmAcrossAges', () => {
  const adult = { is_minor: false } as any
  const minor = { is_minor: true } as any

  it('allows two adults', () => {
    expect(canDmAcrossAges(adult, adult)).toBe(true)
  })

  it('allows two minors', () => {
    expect(canDmAcrossAges(minor, minor)).toBe(true)
  })

  it('blocks in both directions across the line', () => {
    expect(canDmAcrossAges(adult, minor)).toBe(false)
    expect(canDmAcrossAges(minor, adult)).toBe(false)
  })

  it('reads a missing column as adult, so a deploy ahead of the migration is not a lockout', () => {
    expect(canDmAcrossAges({} as any, adult)).toBe(true)
    expect(canDmAcrossAges(null, undefined)).toBe(true)
  })

  it('explains the block from whichever side is asking', () => {
    expect(dmBlockedReason(adult, minor)).toMatch(/under 18/i)
    expect(dmBlockedReason(minor, adult)).toMatch(/accounts under 18/i)
    expect(dmBlockedReason(adult, adult)).toBeNull()
  })
})
