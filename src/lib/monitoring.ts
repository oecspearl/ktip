import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router'
import { hasAnalyticsConsent } from './analytics-consent'
import { isAppError, safeMessageFor, type ErrorCode } from './app-error'
import { redactDeep, redactText } from './redact'

// TransactionEvent is not re-exported by @sentry/react, so it is derived from
// the option that consumes it and stays correct across SDK upgrades.
type TransactionEvent = Parameters<
  NonNullable<Sentry.BrowserOptions['beforeSendTransaction']>
>[0]

interface SimulatedErrorOptions {
  area: string
  operation: string
  errorCode: ErrorCode
  errorName: string
  message: string
  level: 'error' | 'warning'
}

/**
 * Redacts an error event in place, keeping enough detail to debug it.
 *
 * Messages, stack frames, breadcrumbs, extra data, and record UUIDs are all
 * sent; `redactDeep` removes email addresses, tokens, and secret query
 * parameters from every string first. Request bodies, cookies, and headers are
 * dropped wholesale because they are high-volume and rarely diagnostic.
 *
 * Exported so the rules can be asserted directly; `beforeSend` is otherwise
 * unreachable from a test.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Only the user's UUID is kept. It is what makes an error traceable to the
  // record that caused it; email, username, and IP are not needed for that.
  event.user = event.user?.id ? { id: String(event.user.id) } : undefined
  event.message = event.message ? redactDeep(event.message) : undefined
  event.logentry = event.logentry ? redactDeep(event.logentry) : undefined
  event.extra = event.extra ? redactDeep(event.extra) : undefined
  event.contexts = event.contexts ? redactDeep(event.contexts) : undefined
  event.tags = event.tags ? redactDeep(event.tags) : undefined
  event.exception?.values?.forEach((exception) => {
    // The registry constant is the fallback for an error thrown with no
    // message, so the issue still has a title.
    exception.value = exception.value
      ? redactText(exception.value)
      : safeMessageFor(event.tags?.error_code)
  })
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => redactDeep(breadcrumb))
  if (event.request) {
    // The URL and method locate the failure; the body and credentials do not.
    event.request = {
      url: event.request.url ? redactText(event.request.url) : undefined,
      method: event.request.method,
      query_string: event.request.query_string
        ? redactDeep(event.request.query_string)
        : undefined,
    }
  }
  return event
}

/**
 * Collections whose next path segment identifies one record.
 *
 * Since migration 087 that segment is usually a slug, not a uuid, so shape
 * alone can no longer tell an identifier from a route. Position can:
 * /grants/<anything> is one grant, and without this every grant would become
 * its own Sentry transaction.
 */
const ID_BEARING_COLLECTIONS = ['grants', 'events', 'projects', 'resources', 'user']

/**
 * Literal child routes that are pages in their own right rather than records —
 * /events/new is one page, /grants/my-applications is one page, and
 * /events/virtual-hackathon/… is a whole surface worth watching separately.
 * The trailing (?:/|$) is what stops "new" from also matching a grant slugged
 * "newton-fund".
 */
const RESERVED_SEGMENTS = ['new', 'my-applications', 'virtual-hackathon', 'virtual-conference']

/**
 * Redacts a transaction event and normalises record IDs out of its name.
 *
 * The name is normalised so routes aggregate instead of fragmenting into one
 * entry per record; the specific ID survives on the span data, which is kept.
 */
export function scrubTransaction(event: TransactionEvent): TransactionEvent {
  event.user = event.user?.id ? { id: String(event.user.id) } : undefined
  event.extra = event.extra ? redactDeep(event.extra) : undefined
  event.contexts = event.contexts ? redactDeep(event.contexts) : undefined
  event.tags = event.tags ? redactDeep(event.tags) : undefined
  event.request = event.request
    ? { url: event.request.url ? redactText(event.request.url) : undefined, method: event.request.method }
    : undefined
  event.transaction = event.transaction
    ?.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(
      new RegExp(
        `/(${ID_BEARING_COLLECTIONS.join('|')})/(?!(?:${RESERVED_SEGMENTS.join('|')})(?:/|$))[^/]+`,
        'g'
      ),
      '/$1/:id'
    )
    // A board slug is one of six and worth keeping; the thread under it is not.
    .replace(/\/forums\/([^/]+)\/(?!new(?:\/|$))[^/]+/g, '/forums/$1/:id')
  event.spans = event.spans?.map((span) => redactDeep(span))
  return event
}

export function initializeMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  // No DSN is the supported "off" state, not a misconfiguration: it is how a
  // fork, a preview branch, or a local checkout runs without a Sentry account.
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    // Full capture: every consented transaction is sampled. Performance tracing
    // attaches a page's URL and timing to a session, so it stays off entirely
    // until optional analytics consent is granted. Error capture is deliberately
    // NOT gated — an unhandled exception is necessary to operate the service.
    tracesSampler: () => (hasAnalyticsConsent() ? 1 : 0),
    // Session Replay is deliberately absent: it records the DOM, which on this
    // platform contains grant applications, messages, and CVs.
    //
    // Only same-origin requests (the Vercel API routes) receive tracing headers,
    // so browser and Edge spans join a single distributed trace.
    tracePropagationTargets: ['localhost', window.location.origin],
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubTransaction(event),
  })
}

/**
 * Reports an error to Sentry.
 *
 * An `AppError` carries its own tags and groups by code, so no context argument
 * is needed. For plain errors, pass `area` / `operation` / `error_code`
 * explicitly.
 *
 * Returns the Sentry event ID, or undefined when Sentry is not configured, so
 * callers can show a support reference.
 */
export function captureException(
  error: unknown,
  context?: Record<string, string>,
): string | undefined {
  return Sentry.withScope((scope) => {
    if (isAppError(error)) {
      scope.setTags(error.tags)
      // Group by code rather than stack shape: one issue per failure mode,
      // regardless of which call site or bundle chunk raised it.
      scope.setFingerprint(['app-error', error.code])
    }
    if (context) scope.setTags(context)
    return Sentry.captureException(error)
  })
}

/**
 * Sends one deliberate event from the admin error simulator.
 *
 * Deliberately not DEV-guarded: the point of the drill is to prove the
 * production pipeline works, which a dev-only capture cannot do. Access is
 * controlled by the route (AdminRoute), and containment is handled by the
 * `simulated` tag plus a dedicated fingerprint, so drills never merge into a
 * real issue and can be filtered out of alerts.
 */
export function captureSimulatedError(options: SimulatedErrorOptions): string | undefined {
  return Sentry.startSpan(
    { name: `${options.area}.${options.operation}`, op: 'test.error' },
    (span) => {
      span.setAttribute('error.code', options.errorCode)
      Sentry.addBreadcrumb({
        category: 'sentry.simulator',
        message: options.errorCode,
        level: 'info',
      })

      return Sentry.withScope((scope) => {
        scope.setTags({
          area: options.area,
          operation: options.operation,
          error_code: options.errorCode,
          simulated: 'true',
        })
        scope.setLevel(options.level)
        scope.setFingerprint(['sentry-simulator', options.errorCode])
        scope.setContext('simulation', {
          source: 'development-error-simulator',
          area: options.area,
          operation: options.operation,
          error_code: options.errorCode,
        })

        const error = new Error(options.message)
        error.name = options.errorName
        return Sentry.captureException(error)
      })
    },
  )
}
