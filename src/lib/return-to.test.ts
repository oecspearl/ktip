import { beforeEach, describe, expect, it } from 'vitest'
import { isSafeReturnPath, rememberReturnTo, takeReturnTo } from './return-to'

beforeEach(() => {
  sessionStorage.clear()
})

describe('isSafeReturnPath', () => {
  it('accepts an app path', () => {
    expect(isSafeReturnPath('/projects/educarib')).toBe(true)
    expect(isSafeReturnPath('/user/abc?tab=cv#top')).toBe(true)
  })

  it('refuses anything that leaves the origin', () => {
    expect(isSafeReturnPath('//evil.example')).toBe(false)
    expect(isSafeReturnPath('/\\evil.example')).toBe(false)
    expect(isSafeReturnPath('https://evil.example')).toBe(false)
    expect(isSafeReturnPath('projects/x')).toBe(false)
  })

  it('refuses the auth screens and the gates, which would loop', () => {
    expect(isSafeReturnPath('/login')).toBe(false)
    expect(isSafeReturnPath('/login?vc_error=x')).toBe(false)
    expect(isSafeReturnPath('/signup')).toBe(false)
    expect(isSafeReturnPath('/auth/callback')).toBe(false)
    expect(isSafeReturnPath('/onboarding')).toBe(false)
    expect(isSafeReturnPath('/security/verify')).toBe(false)
  })

  it('does not mistake a lookalike prefix for a gate', () => {
    expect(isSafeReturnPath('/login-help')).toBe(true)
  })

  it('refuses non-strings', () => {
    expect(isSafeReturnPath(null)).toBe(false)
    expect(isSafeReturnPath(undefined)).toBe(false)
    expect(isSafeReturnPath(42)).toBe(false)
  })
})

describe('rememberReturnTo / takeReturnTo', () => {
  it('round-trips the full location and clears it once taken', () => {
    rememberReturnTo({ pathname: '/projects/skillbridge', search: '?tab=team', hash: '#members' })
    expect(takeReturnTo()).toBe('/projects/skillbridge?tab=team#members')
    expect(takeReturnTo()).toBeNull()
  })

  it('a visit without a destination clears an old one', () => {
    rememberReturnTo({ pathname: '/projects/old' })
    rememberReturnTo(undefined)
    expect(takeReturnTo()).toBeNull()
  })

  it('an unsafe destination clears rather than stores', () => {
    rememberReturnTo({ pathname: '/projects/old' })
    rememberReturnTo({ pathname: '//evil.example' })
    expect(takeReturnTo()).toBeNull()
  })

  it('refuses a value planted straight into storage', () => {
    sessionStorage.setItem('ktip.return-to', 'https://evil.example')
    expect(takeReturnTo()).toBeNull()
  })
})
