import { describe, it, expect } from 'vitest'
import { loginSchema, signupSchema, projectSchema, SIGNUP_ROLES } from './validation'
import { SELECTABLE_ROLES } from './constants'

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-email',
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects short password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '12345',
    })
    expect(result.success).toBe(false)
  })
})

describe('signupSchema', () => {
  it('accepts valid signup data', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      display_name: 'John Doe',
      role: 'student',
      date_of_birth: '1995-06-15',
    })
    expect(result.success).toBe(true)
  })

  // 091. Every account declares an age; the field is not optional on any path.
  it('rejects a signup with no date of birth', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      display_name: 'John Doe',
      role: 'student',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid role', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      display_name: 'John Doe',
      role: 'invalid_role',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a mismatched password confirmation', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      confirm_password: 'Password123?',
      display_name: 'John Doe',
      role: 'student',
      date_of_birth: '1995-06-15',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['confirm_password'])
  })

  it('rejects a signup with no password confirmation', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      display_name: 'John Doe',
      role: 'student',
      date_of_birth: '1995-06-15',
    })
    expect(result.success).toBe(false)
  })

  // The field left signup entirely — SignupPage seeds the profile name from the
  // email's local part — so absence is valid. A name that IS supplied (onboarding,
  // settings) is still held to the two-character minimum.
  it('accepts a signup with no display name', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      role: 'student',
      date_of_birth: '1995-06-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a short display name when one is given', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      display_name: 'J',
      role: 'student',
      date_of_birth: '1995-06-15',
    })
    expect(result.success).toBe(false)
  })

  // The accepted roles and the offered roles were two hand-kept lists, and they
  // drifted: the Researcher card was on the grid and rejected by the schema,
  // so choosing it failed with "Please select a role" and no way forward.
  it('accepts every role the picker offers', () => {
    expect([...SIGNUP_ROLES].sort()).toEqual(SELECTABLE_ROLES.map((r) => r.value).sort())

    for (const role of SELECTABLE_ROLES) {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
        display_name: 'John Doe',
        role: role.value,
        date_of_birth: '1995-06-15',
      })
      expect(result.success, `role '${role.value}' must pass signup`).toBe(true)
    }
  })

  // A retired collaboration value is still on live profiles. Rejecting it here
  // would lock those members out of saving any profile change at all.
  it('accepts current and retired collaboration values', () => {
    for (const openTo of [['funding'], ['co_founders', 'technical_support'], ['knowledge_transfer']]) {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
        display_name: 'John Doe',
        role: 'entrepreneur',
        date_of_birth: '1995-06-15',
        open_to: openTo,
      })
      expect(result.success, `open_to ${openTo.join()} must pass`).toBe(true)
    }
  })
})

describe('projectSchema', () => {
  it('accepts valid project data', () => {
    const result = projectSchema.safeParse({
      title: 'My Project',
      category: 'technology',
      phase: 'concept',
      hashtags: ['tech', 'innovation'],
      is_public: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects title that is too short', () => {
    const result = projectSchema.safeParse({
      title: 'Hi',
      category: 'technology',
      phase: 'concept',
      hashtags: [],
      is_public: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects too many hashtags', () => {
    const result = projectSchema.safeParse({
      title: 'My Project',
      category: 'technology',
      phase: 'concept',
      hashtags: Array(11).fill('tag'),
      is_public: true,
    })
    expect(result.success).toBe(false)
  })
})
