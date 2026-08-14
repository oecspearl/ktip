import { describe, expect, it } from 'vitest'
import { ROLE_DEFINITIONS, roleRequiresMfa, rolesRequireMfa } from './permissions'

describe('roleRequiresMfa', () => {
  it('is on for entrepreneur — the self-assignable role that applies for money', () => {
    expect(roleRequiresMfa('entrepreneur')).toBe(true)
  })

  it('is off for every other role at 118', () => {
    const required = ROLE_DEFINITIONS.filter((role) => role.requiresMfa).map((role) => role.slug)
    expect(required).toEqual(['entrepreneur'])
  })

  it('is false for a slug nobody has heard of, rather than throwing', () => {
    // Called with whatever the role picker held, so a typo must not take the
    // signup form down with it.
    expect(roleRequiresMfa('nonsense')).toBe(false)
    expect(roleRequiresMfa('')).toBe(false)
    expect(roleRequiresMfa(null)).toBe(false)
    expect(roleRequiresMfa(undefined)).toBe(false)
  })

  it('is false for a role that does not demand it', () => {
    expect(roleRequiresMfa('mentor')).toBe(false)
    expect(roleRequiresMfa('student')).toBe(false)
  })
})

describe('rolesRequireMfa', () => {
  it('is true when any held role demands it', () => {
    expect(rolesRequireMfa(['mentor', 'entrepreneur'])).toBe(true)
  })

  it('is false for an empty or absent set', () => {
    expect(rolesRequireMfa([])).toBe(false)
    expect(rolesRequireMfa(null)).toBe(false)
  })
})
