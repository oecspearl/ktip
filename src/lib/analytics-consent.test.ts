import { beforeEach, describe, expect, it } from 'vitest'
import {
  getAnalyticsConsent,
  hasAnalyticsConsent,
  setAnalyticsConsent,
  syncAnalyticsSessionUser,
} from './analytics-consent'

describe('analytics consent', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('defaults to pending', () => {
    expect(getAnalyticsConsent()).toBe('pending')
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('persists granted consent', () => {
    setAnalyticsConsent('granted')

    expect(getAnalyticsConsent()).toBe('granted')
    expect(hasAnalyticsConsent()).toBe(true)
  })

  it('clears the analytics session when consent is denied', () => {
    sessionStorage.setItem('ktip_session_id', 'session-id')

    setAnalyticsConsent('denied')

    expect(getAnalyticsConsent()).toBe('denied')
    expect(sessionStorage.getItem('ktip_session_id')).toBeNull()
  })

  it('starts a new analytics session when the signed-in user changes', () => {
    syncAnalyticsSessionUser('user-a')
    sessionStorage.setItem('ktip_session_id', 'session-a')

    syncAnalyticsSessionUser('user-b')

    expect(sessionStorage.getItem('ktip_session_id')).toBeNull()
    expect(sessionStorage.getItem('ktip_analytics_user_id')).toBe('user-b')
  })

  it('does not bind an unowned legacy session to a user', () => {
    sessionStorage.setItem('ktip_session_id', 'legacy-session')

    syncAnalyticsSessionUser('user-a')

    expect(sessionStorage.getItem('ktip_session_id')).toBeNull()
    expect(sessionStorage.getItem('ktip_analytics_user_id')).toBe('user-a')
  })
})
