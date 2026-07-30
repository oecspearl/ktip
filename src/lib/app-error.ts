/**
 * Enumerated, privacy-safe error taxonomy.
 *
 * Sentry's `beforeSend` deletes every free-form `exception.value` because a
 * thrown message can embed proposals, emails, or record IDs. That leaves an
 * issue with a stack trace and no meaning. This registry is the replacement
 * channel: each code maps to a developer-authored constant string. Nothing here
 * is interpolated from runtime data, so the whole table is provably PII-free and
 * safe to send.
 *
 * Adding a code: add the entry, nothing else. `ErrorCode` widens automatically
 * and `SAFE_MESSAGES` stays exhaustive by construction.
 */
export const SAFE_MESSAGES = {
  AI_PROVIDER_REQUEST_FAILED: 'AI assistant provider request failed',
  ANALYTICS_INGESTION_FAILED: 'Analytics event could not be ingested',
  API_INTERNAL_SERVER_ERROR: 'Application API returned an unexpected server error',
  API_UNHANDLED_EXCEPTION: 'Application API handler threw before responding',
  AUTH_SESSION_REFRESH_FAILED: 'Authentication session could not be refreshed',
  COLLABORATION_SAVE_FAILED: 'Collaboration changes could not be saved',
  DATA_API_UNAVAILABLE: 'Supabase Data API failed to load public content',
  REACT_COMPONENT_ERROR: 'React component tree threw during render',
  REACT_RECOVERABLE_ERROR: 'React recovered from a render error',
  REACT_UNCAUGHT_ERROR: 'React render error reached the root handler',
  ROUTE_IMPORT_FAILED: 'Application route bundle failed to load',
  UNKNOWN_ERROR: 'Unclassified error',
} as const

export type ErrorCode = keyof typeof SAFE_MESSAGES

export function isErrorCode(value: unknown): value is ErrorCode {
  // hasOwn, not `in`: `in` walks the prototype chain, so 'toString' and
  // 'constructor' would pass as codes and leak an unregistered value.
  return typeof value === 'string' && Object.hasOwn(SAFE_MESSAGES, value)
}

/** Constant message for a code, or the redaction placeholder if unclassified. */
export function safeMessageFor(code: unknown): string {
  return isErrorCode(code) ? `${code}: ${SAFE_MESSAGES[code]}` : '[redacted]'
}

export interface AppErrorInit {
  code: ErrorCode
  /** Subsystem, e.g. `data-api`, `authentication`, `react-render`. */
  area: string
  /** What was being attempted, e.g. `load-public-content`. */
  operation: string
  /** Underlying error, kept for the stack trace. Its message is never sent. */
  cause?: unknown
}

/**
 * Error with a code that survives PII scrubbing.
 *
 * `message` is the registry constant, never caller-supplied text, so an
 * `AppError` cannot leak user data into Sentry or onto the screen.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly area: string
  readonly operation: string

  constructor({ code, area, operation, cause }: AppErrorInit) {
    super(safeMessageFor(code), cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
    this.area = area
    this.operation = operation
  }

  /** Sentry tags. Values are enumerated or developer-authored, never user data. */
  get tags(): Record<string, string> {
    return {
      area: this.area,
      operation: this.operation,
      error_code: this.code,
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
