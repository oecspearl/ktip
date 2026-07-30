import { useContext, createContext, useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../lib/supabase'
import { hasAnalyticsConsent, useAnalyticsConsent } from '../lib/analytics-consent'
import { captureException } from '../lib/monitoring'
import { AppError } from '../lib/app-error'

// Reported once per page load: a broken analytics table would otherwise raise
// one Sentry event per tracked interaction and bury everything else.
let analyticsFailureReported = false

// ── Session ID (persists per browser tab) ──
function getSessionId(): string {
  let id = sessionStorage.getItem('ktip_session_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('ktip_session_id', id)
  }
  return id
}

// ── Core track function (fire-and-forget) ──
async function track(
  eventType: 'page_view' | 'feature_use' | 'funnel_step' | 'click' | 'conversion',
  eventName: string,
  properties: Record<string, any> = {},
  pagePath?: string
) {
  // The consent gate lives here rather than at each call site, so a new
  // analytics.feature() call cannot forget it.
  if (!hasAnalyticsConsent()) return

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const { error } = await (supabase as any).from('analytics_events').insert({
      session_id: getSessionId(),
      user_id: session?.user?.id ?? null,
      event_type: eventType,
      event_name: eventName,
      properties,
      page_path: pagePath ?? window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    })
    if (error) throw error
  } catch (error) {
    // Still non-fatal for the user, but no longer silent for us: a failing
    // ingestion pipeline used to look identical to no traffic at all.
    if (!analyticsFailureReported) {
      analyticsFailureReported = true
      captureException(
        new AppError({
          code: 'ANALYTICS_INGESTION_FAILED',
          area: 'analytics',
          operation: 'event-ingestion',
          cause: error,
        })
      )
    }
  }
}

// ── Public API ──
export const analytics = {
  /** Track a page view (called automatically by AnalyticsProvider) */
  pageView(path: string) {
    track('page_view', 'page_view', {}, path)
  },

  /** Track feature usage — e.g. analytics.feature('whiteboard', 'create') */
  feature(feature: string, action: string, props: Record<string, any> = {}) {
    track('feature_use', `${feature}:${action}`, { feature, action, ...props })
  },

  /** Track a funnel step — e.g. analytics.funnel('prereg', 'step_1_complete') */
  funnel(funnel: string, step: string, props: Record<string, any> = {}) {
    track('funnel_step', `${funnel}:${step}`, { funnel, step, ...props })
  },

  /** Track a UI click — e.g. analytics.click('hero_cta', 'pre_register') */
  click(element: string, label?: string, props: Record<string, any> = {}) {
    track('click', element, { label, ...props })
  },

  /** Track a conversion — e.g. analytics.conversion('prereg_submitted') */
  conversion(name: string, props: Record<string, any> = {}) {
    track('conversion', name, props)
  },
}

// ── Context (for AnalyticsProvider) ──
const AnalyticsContext = createContext(analytics)

export const useAnalytics = () => useContext(AnalyticsContext)

/** Provider that auto-tracks page views on route change (via react-router's useLocation) */
export const AnalyticsProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const consent = useAnalyticsConsent()
  const sessionStarted = useRef(false)

  // Keyed on consent as well as path: a visitor who accepts mid-session has
  // their current page tracked, rather than nothing until they navigate.
  useEffect(() => {
    if (consent !== 'granted') return
    analytics.pageView(location.pathname)
  }, [consent, location.pathname])

  // Session start fires once per grant, not once per mount, so withdrawing and
  // re-granting consent opens a genuinely new session.
  useEffect(() => {
    if (consent !== 'granted') {
      sessionStarted.current = false
      return
    }
    if (sessionStarted.current) return
    sessionStarted.current = true
    analytics.feature('session', 'start', {
      entry_page: location.pathname,
      referrer: document.referrer || null,
    })
  }, [consent, location.pathname])

  return children
}
