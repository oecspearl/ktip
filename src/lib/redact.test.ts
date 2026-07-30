import { describe, expect, it } from 'vitest'
import { isDeniedKey, redactDeep, redactText } from './redact'

const UUID = '1f8b0c4e-3a7d-4c2b-9f1e-6d5a4b3c2d1e'

describe('redactText', () => {
  it('keeps UUIDs so errors can be correlated with records', () => {
    expect(redactText(`project ${UUID} failed to save`)).toBe(
      `project ${UUID} failed to save`,
    )
  })

  it('keeps numeric record IDs', () => {
    expect(redactText('grant application 4821 rejected')).toBe('grant application 4821 rejected')
  })

  it('removes email addresses, including plus-addressed ones', () => {
    expect(redactText('no profile for zoe.a+test@sub.example.co.uk'))
      .toBe('no profile for [email]')
  })

  it('removes every email in a message', () => {
    expect(redactText('a@b.com invited c@d.org')).toBe('[email] invited [email]')
  })

  it('removes JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-_123'
    expect(redactText(`token ${jwt} expired`)).toBe('token [jwt] expired')
  })

  it('removes bearer tokens', () => {
    expect(redactText('Authorization: Bearer sk_live_abc123==')).toBe(
      'Authorization: Bearer [token]',
    )
  })

  it('removes secret query parameters but keeps the key and the path', () => {
    expect(redactText(`https://x.supabase.co/storage/v1/object/sign/docs/${UUID}.pdf?token=abc.def&width=80`))
      .toBe(`https://x.supabase.co/storage/v1/object/sign/docs/${UUID}.pdf?token=[secret]&width=80`)
  })

  it('truncates very long strings', () => {
    const result = redactText('x'.repeat(5_000))
    expect(result.length).toBeLessThan(2_100)
    expect(result.endsWith('…[truncated]')).toBe(true)
  })
})

describe('isDeniedKey', () => {
  it('matches regardless of case, spacing, or separator', () => {
    expect(isDeniedKey('Authorization')).toBe(true)
    expect(isDeniedKey('set-cookie')).toBe(true)
    expect(isDeniedKey('service_role_key')).toBe(true)
    expect(isDeniedKey('newPassword')).toBe(true)
    expect(isDeniedKey('project_id')).toBe(false)
  })
})

describe('redactDeep', () => {
  it('redacts nested strings and drops denied keys', () => {
    expect(redactDeep({
      project_id: UUID,
      owner: { email: 'zoe@example.com', display: 'contact zoe@example.com' },
      headers: { Authorization: 'Bearer abc' },
      tags: ['zoe@example.com', UUID],
      count: 3,
      ok: false,
      missing: null,
    })).toEqual({
      project_id: UUID,
      owner: { email: '[redacted]', display: 'contact [email]' },
      headers: { Authorization: '[redacted]' },
      tags: ['[email]', UUID],
      count: 3,
      ok: false,
      missing: null,
    })
  })

  it('stops at the depth limit instead of recursing without bound', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 'zoe@example.com' } } } } } } }
    expect(JSON.stringify(redactDeep(deep))).not.toContain('zoe@example.com')
    expect(JSON.stringify(redactDeep(deep))).toContain('depth limit')
  })

  it('survives a cyclic object', () => {
    const cyclic: Record<string, unknown> = { note: 'zoe@example.com' }
    cyclic.self = cyclic
    expect(() => redactDeep(cyclic)).not.toThrow()
  })
})
