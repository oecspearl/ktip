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

// ── Batching ──
//
// One INSERT per event was one request (plus its CORS preflight) per page
// view, click and heartbeat, on the connections this app most needs to spare.
// Events now wait up to FLUSH_MS, or until BATCH_MAX have queued, and go up as
// one multi-row insert. Leaving the tab flushes with `keepalive`, which lets
// the request outlive the page; sendBeacon would too, but cannot carry the
// auth header that RLS reads user_id against.
const FLUSH_MS = 5_000
const BATCH_MAX = 20

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string

const queue: Record<string, unknown>[] = []
let flushTimer = 0
// The page is going away by the time the keepalive flush runs, so there is no
// awaiting getSession() there; each track() leaves the latest token here.
let lastAccessToken: string | null = null

function reportFailure(error: unknown) {
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

async function flush(opts?: { keepalive?: boolean }) {
  window.clearTimeout(flushTimer)
  flushTimer = 0
  if (!queue.length) return
  const rows = queue.splice(0)
  try {
    if (opts?.keepalive) {
      const headers: Record<string, string> = {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }
      if (lastAccessToken) headers.Authorization = `Bearer ${lastAccessToken}`
      void fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
        method: 'POST',
        keepalive: true,
        headers,
        body: JSON.stringify(rows),
      }).catch(() => {})
      return
    }
    const { error } = await (supabase as any).from('analytics_events').insert(rows)
    if (error) throw error
  } catch (error) {
    reportFailure(error)
  }
}

if (typeof window !== 'undefined') {
  // pagehide alone misses a phone switching apps and never coming back;
  // visibilitychange to hidden is the last event a mobile tab reliably gets.
  const leave = () => void flush({ keepalive: true })
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave()
  })
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

  // Read now, not at flush time: the path and referrer belong to this event.
  const page_path = pagePath ?? window.location.pathname
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    lastAccessToken = session?.access_token ?? null
    queue.push({
      session_id: getSessionId(),
      user_id: session?.user?.id ?? null,
      event_type: eventType,
      event_name: eventName,
      properties,
      page_path,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    })
    if (queue.length >= BATCH_MAX) void flush()
    else if (!flushTimer) flushTimer = window.setTimeout(() => void flush(), FLUSH_MS)
  } catch (error) {
    reportFailure(error)
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

  // ── Session heartbeat (roadmap §14 T34: average session duration) ──
  //
  // Without this, session length can only be inferred from the gap between the
  // first and last page view — which makes every single-page session zero and
  // undercounts the rest by however long the reader spent on the page they left
  // on. A 60-second beat turns that into a bound tight enough to report.
  //
  // Consent-gated like everything else here, so the KPI describes consenting
  // sessions and must be labelled that way. MAU/DAU deliberately do NOT come
  // from this table — they come from user_activity_days, which needs no consent.
  useEffect(() => {
    if (consent !== 'granted') return

    const beat = () => {
      // Nothing to record about a backgrounded tab, and beating through a long
      // background would inflate every session that was left open overnight.
      if (document.visibilityState !== 'visible') return
      analytics.feature('session', 'heartbeat')
    }

    const timer = window.setInterval(beat, 60_000)
    return () => window.clearInterval(timer)
  }, [consent])

  // ── Largest Contentful Paint (T36: page load under 3s on 3G) ──
  //
  // One reading per page load, p75 computed in SQL. scripts/perf/lighthouse.mjs
  // is a CI artefact measured on a build machine; this is what real readers on
  // real Caribbean connections actually experienced, which is the KPI.
  useEffect(() => {
    if (consent !== 'granted') return
    if (typeof PerformanceObserver === 'undefined') return

    let reported = false
    let observer: PerformanceObserver

    try {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (!last || reported) return
        reported = true
        analytics.feature('web_vitals', 'lcp', { ms: Math.round(last.startTime) })
      })
      observer.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      // Safari before 16 has no LCP entry type. A missing metric is fine; a
      // thrown constructor on every page load is not.
      return
    }

    return () => observer.disconnect()
  }, [consent])

  return children
}
