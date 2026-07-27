import { useContext, createContext, useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../lib/supabase'

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
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    await (supabase as any).from('analytics_events').insert({
      session_id: getSessionId(),
      user_id: session?.user?.id ?? null,
      event_type: eventType,
      event_name: eventName,
      properties,
      page_path: pagePath ?? window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    })
  } catch {
    // Silent fail — analytics should never break the app
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
  const didMount = useRef(false)

  // Track initial page view + session start (once, on mount)
  useEffect(() => {
    analytics.pageView(location.pathname)
    analytics.feature('session', 'start', {
      entry_page: location.pathname,
      referrer: document.referrer || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track subsequent page views on route change
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    analytics.pageView(location.pathname)
  }, [location.pathname])

  return children
}
