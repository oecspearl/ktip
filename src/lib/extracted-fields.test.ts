import { describe, it, expect } from 'vitest'
import { FIELD_SPECS, coerce, describeFields, sanitizeFields } from './extracted-fields'

const grant = FIELD_SPECS.grant

describe('coerce', () => {
  it('pulls a number out of a formatted amount', () => {
    expect(coerce(grant.amount_max, 'US$50,000')).toBe(50000)
    expect(coerce(grant.amount_min, 'XCD 1 500.50')).toBe(1500.5)
    expect(coerce(grant.amount_max, 25000)).toBe(25000)
  })

  it('rejects amounts with no digits', () => {
    expect(coerce(grant.amount_max, 'varies')).toBeNull()
    expect(coerce(grant.amount_max, null)).toBeNull()
  })

  it('accepts only full ISO dates', () => {
    expect(coerce(grant.deadline, '2026-09-30')).toBe('2026-09-30')
    expect(coerce(grant.deadline, '2026-09-30T00:00:00Z')).toBe('2026-09-30')
    expect(coerce(grant.deadline, 'September 2026')).toBeNull()
    expect(coerce(grant.deadline, '2026-13-45')).toBeNull()
  })

  it('holds grant_type to the values in the CHECK constraint', () => {
    expect(coerce(grant.grant_type, 'Research')).toBe('research')
    expect(coerce(grant.grant_type, 'climate')).toBeNull()
  })

  it('requires an http(s) url', () => {
    expect(coerce(grant.application_url, 'https://oecs.int/apply')).toBe('https://oecs.int/apply')
    expect(coerce(grant.application_url, 'see the annex')).toBeNull()
    expect(coerce(grant.application_url, 'javascript:alert(1)')).toBeNull()
  })

  it('truncates strings to the column limit', () => {
    const long = 'x'.repeat(500)
    expect((coerce(grant.currency, long) as string).length).toBe(8)
  })

  it('caps tags at six trimmed strings', () => {
    const tags = coerce(FIELD_SPECS.project.tags, ['  agri ', 'tech', 1, 'a', 'b', 'c', 'd', 'e'])
    expect(tags).toEqual(['agri', 'tech', 'a', 'b', 'c', 'd'])
  })
})

describe('sanitizeFields', () => {
  it('drops keys that are not columns on the entity', () => {
    const result = sanitizeFields(grant, {
      title: { value: 'Blue Economy Fund', confidence: 0.9 },
      secret_admin_flag: { value: true, confidence: 1 },
      owner_id: { value: 'someone-else', confidence: 1 },
    })
    expect(Object.keys(result)).toEqual(['title'])
  })

  it('drops proposals whose value fails coercion', () => {
    const result = sanitizeFields(grant, {
      amount_max: { value: 'lots', confidence: 0.9 },
      is_climate_action: { value: 'yes', confidence: 0.9 },
    })
    expect(result).toEqual({})
  })

  it('keeps evidence and clamps confidence', () => {
    const result = sanitizeFields(grant, {
      deadline: { value: '2026-09-30', confidence: 7, evidence: 'Applications close 30 September 2026' },
    })
    expect(result.deadline.confidence).toBe(0.5)
    expect(result.deadline.evidence).toBe('Applications close 30 September 2026')
  })

  it('survives junk in place of the fields object', () => {
    expect(sanitizeFields(grant, null)).toEqual({})
    expect(sanitizeFields(grant, 'nope')).toEqual({})
    expect(sanitizeFields(grant, [{ title: 'x' }])).toEqual({})
    expect(sanitizeFields(grant, { title: 'not an object' })).toEqual({})
  })
})

describe('describeFields', () => {
  it('lists every field and spells out the enum values', () => {
    const described = describeFields(grant)
    for (const key of Object.keys(grant)) {
      expect(described).toContain(`- ${key} (`)
    }
    expect(described).toContain('one of: startup, research, innovation, development, education')
  })
})
