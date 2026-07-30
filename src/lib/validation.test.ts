import { describe, it, expect } from 'vitest'
import { loginSchema, signupSchema, projectSchema } from './validation'

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
      display_name: 'John Doe',
      role: 'student',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid role', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      display_name: 'John Doe',
      role: 'invalid_role',
    })
    expect(result.success).toBe(false)
  })

  it('rejects short display name', () => {
    const result = signupSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
      display_name: 'J',
      role: 'student',
    })
    expect(result.success).toBe(false)
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
