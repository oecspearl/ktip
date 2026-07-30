import * as Sentry from '@sentry/vercel-edge'
import { safeMessageFor } from '../src/lib/app-error'
import { redactDeep, redactText } from '../src/lib/redact'

type ApiHandler = (request: Request) => Promise<Response>

// TransactionEvent is not re-exported by the SDK, so it is derived from the
// option that consumes it and stays correct across SDK upgrades.
type TransactionEvent = Parameters<
  NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSendTransaction']>
>[0]

/**
 * Rebuilds a readable exception title from allow-listed tags after the raw
 * message is dropped.
 *
 * Every part is provably PII-free: the code resolves to a constant from the
 * shared registry, `route` is a string literal passed at wrap time, and
 * `status` is an HTTP status code. Without this, every 5xx across every route
 * shows up as the same opaque title.
 */
export function safeApiValue(tags: Record<string, unknown> | undefined): string {
  const route = typeof tags?.route === 'string' ? tags.route : 'unknown-route'
  const status = typeof tags?.status === 'string' ? tags.status : undefined
  const suffix = status ? `${route} -> ${status}` : route
  return `${safeMessageFor(tags?.error_code)} (${suffix})`
}

const sentryDsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN

/**
 * Redacts an error event in place, keeping enough detail to debug it. Mirrors
 * the browser policy in `src/lib/monitoring.ts`: messages and record UUIDs are
 * sent, emails and credentials are not, and request bodies are dropped.
 *
 * Exported so the rules can be asserted directly; `beforeSend` is otherwise
 * untestable.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  event.user = event.user?.id ? { id: String(event.user.id) } : undefined
  event.message = event.message ? redactDeep(event.message) : undefined
  event.logentry = event.logentry ? redactDeep(event.logentry) : undefined
  event.extra = event.extra ? redactDeep(event.extra) : undefined
  event.contexts = event.contexts ? redactDeep(event.contexts) : undefined
  event.tags = event.tags ? redactDeep(event.tags) : undefined
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => redactDeep(breadcrumb))
  event.exception?.values?.forEach((exception) => {
    // safeApiValue is the fallback for an error thrown with no message, so the
    // issue still names the route and status it came from.
    exception.value = exception.value
      ? redactText(exception.value)
      : safeApiValue(event.tags)
  })
  if (event.request) {
    event.request = {
      url: event.request.url ? redactText(event.request.url) : undefined,
      method: event.request.method,
    }
  }
  return event
}

/** Redacts a transaction event and normalises record IDs out of its name. */
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
  event.spans = event.spans?.map((span) => redactDeep(span))
  return event
}

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV,
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 1,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubTransaction(event),
  })
}

/**
 * Emits one privacy-safe structured Vercel log per API request. Request bodies,
 * URLs, authorization values, user identifiers, and error messages are omitted.
 */
export function withApiMonitoring(route: string, handler: ApiHandler): ApiHandler {
  return async (request) => {
    // Continue the browser's trace so client navigation and this API request
    // appear as one distributed trace.
    const response = await Sentry.continueTrace({
      sentryTrace: request.headers.get('sentry-trace') ?? undefined,
      baggage: request.headers.get('baggage'),
    }, async () => Sentry.startSpan({ name: route, op: 'http.server' }, async (span) => {
      const startedAt = Date.now()
      const requestId = crypto.randomUUID()
      span.setAttribute('http.request.method', request.method)

      try {
        const response = await handler(request)
        span.setAttribute('http.response.status_code', response.status)
        response.headers.set('X-Request-Id', requestId)
        const entry = JSON.stringify({
          type: 'api_request',
          route,
          method: request.method,
          // Redacted, not omitted: the path and its record IDs are the fastest
          // way to reproduce a failing request from a log line.
          url: redactText(request.url),
          status: response.status,
          duration_ms: Date.now() - startedAt,
          request_id: requestId,
        })
        if (response.status >= 500) {
          Sentry.withScope((scope) => {
            scope.setTags({
              area: 'api',
              route,
              status: String(response.status),
              error_code: 'API_INTERNAL_SERVER_ERROR',
            })
            scope.setFingerprint(['api-response', route, String(response.status)])
            Sentry.captureException(new Error(`${route} responded ${response.status}`))
          })
          await Sentry.flush(2_000)
          console.error(entry)
        } else {
          console.log(entry)
        }
        return response
      } catch (error) {
        span.setAttribute('http.response.status_code', 500)
        Sentry.withScope((scope) => {
          // error_type was already computed for the log below but never reached
          // Sentry; it is the only safe classifier available for a thrown error.
          // Grouping is left to the stack trace, which distinguishes handlers
          // better than a per-route fingerprint would.
          scope.setTags({
            area: 'api',
            route,
            status: '500',
            error_code: 'API_UNHANDLED_EXCEPTION',
            error_type: error instanceof Error ? error.name : 'UnknownError',
          })
          Sentry.captureException(error)
        })
        await Sentry.flush(2_000)
        console.error(JSON.stringify({
          type: 'api_error',
          route,
          method: request.method,
          url: redactText(request.url),
          status: 500,
          duration_ms: Date.now() - startedAt,
          request_id: requestId,
          error_type: error instanceof Error ? error.name : 'UnknownError',
          error_message: error instanceof Error ? redactText(error.message) : undefined,
        }))
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        })
      }
    }))

    // The edge isolate can freeze once the response is returned, so the
    // completed transaction is flushed before handing the response back.
    if (sentryDsn) await Sentry.flush(2_000)
    return response
  }
}
