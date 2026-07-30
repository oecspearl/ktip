import { useSyncExternalStore } from 'react'

export type AnalyticsConsent = 'pending' | 'granted' | 'denied'

const STORAGE_KEY = 'ktip_analytics_consent_v1'
const CHANGE_EVENT = 'ktip:analytics-consent-change'

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'pending'

  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === 'granted' || value === 'denied' ? value : 'pending'
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted'
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, 'pending'>): void {
  window.localStorage.setItem(STORAGE_KEY, consent)
  if (consent === 'denied') {
    window.sessionStorage.removeItem('ktip_session_id')
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function syncAnalyticsSessionUser(userId: string | null): void {
  const nextUser = userId ?? 'anonymous'
  const previousUser = window.sessionStorage.getItem('ktip_analytics_user_id')
  const hasUnboundLegacySession = !previousUser && window.sessionStorage.getItem('ktip_session_id')
  if (hasUnboundLegacySession || (previousUser && previousUser !== nextUser)) {
    window.sessionStorage.removeItem('ktip_session_id')
  }
  window.sessionStorage.setItem('ktip_analytics_user_id', nextUser)
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function useAnalyticsConsent(): AnalyticsConsent {
  return useSyncExternalStore(subscribe, getAnalyticsConsent, () => 'pending')
}
