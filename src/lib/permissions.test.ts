import { describe, expect, it } from 'vitest'
import {
  ROLE_DEFINITIONS,
  canUseGrantApplications,
  displayRoles,
  effectiveRoles,
  isOrganizationAccount,
  primaryProfileLink,
  primaryRole,
  roleRequiresMfa,
  rolesRequireMfa,
} from './permissions'

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

describe('effectiveRoles', () => {
  it('is empty for an account with no roles, whatever the active role says', () => {
    expect(effectiveRoles([], 'mentor')).toEqual([])
    expect(effectiveRoles(null, null)).toEqual([])
  })

  it('returns every held role when no context is chosen', () => {
    expect(effectiveRoles(['mentor', 'investor'], null)).toEqual(['mentor', 'investor'])
  })

  it('narrows to the active role when it is held', () => {
    expect(effectiveRoles(['mentor', 'investor'], 'investor')).toEqual(['investor'])
  })

  it('ignores an active role the account does not hold — a stale value cannot widen', () => {
    expect(effectiveRoles(['mentor'], 'super_admin')).toEqual(['mentor'])
  })

  it('keeps both halves of a legacy alias so RLS and tab lists keep matching', () => {
    expect(effectiveRoles(['oecs'], null)).toEqual(['oecs', 'super_admin'])
  })
})

describe('displayRoles', () => {
  it('collapses a legacy oecs account onto one Super Admin chip, not two', () => {
    expect(displayRoles(['oecs'], null)).toEqual(['super_admin'])
  })

  it('follows the active context the same way the rail does', () => {
    expect(displayRoles(['student', 'mentor'], 'mentor')).toEqual(['mentor'])
  })

  it('offers every held role when asked with no context, which is what the switcher needs', () => {
    expect(displayRoles(['student', 'mentor'], null)).toEqual(['student', 'mentor'])
  })
})

describe('primaryRole', () => {
  it('is the active role when held, else the first held role, else null', () => {
    expect(primaryRole(['student', 'mentor'], 'mentor')).toBe('mentor')
    expect(primaryRole(['student', 'mentor'], null)).toBe('student')
    expect(primaryRole([], null)).toBeNull()
  })
})

describe('canUseGrantApplications', () => {
  it('is the grant:apply capability and nothing else', () => {
    expect(canUseGrantApplications((k) => k === 'grant:apply')).toBe(true)
    expect(canUseGrantApplications(() => false)).toBe(false)
  })
})

describe('isOrganizationAccount / primaryProfileLink', () => {
  it('sends a purely organisational account to the business profile', () => {
    expect(isOrganizationAccount(['investor'])).toBe(true)
    expect(primaryProfileLink(['investor'])).toEqual({ to: '/dashboard/business', kind: 'business' })
  })

  it('keeps the CV for a founder who is also a mentor', () => {
    expect(isOrganizationAccount(['investor', 'mentor'])).toBe(false)
    expect(primaryProfileLink(['investor', 'mentor']).kind).toBe('cv')
  })

  it('gives an admin-tier-only account a CV — admins are people too', () => {
    expect(primaryProfileLink(['safety_admin']).kind).toBe('cv')
  })

  it('accepts a readonly or absent role list like its siblings', () => {
    const roles: readonly string[] = ['ngo']
    expect(isOrganizationAccount(roles)).toBe(true)
    expect(isOrganizationAccount(undefined)).toBe(false)
    expect(isOrganizationAccount(null)).toBe(false)
  })
})
