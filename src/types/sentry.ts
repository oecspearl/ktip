/**
 * Wire contract for the admin error dashboard.
 *
 * Shared deliberately in both directions: `api/_sentry-api.ts` produces these
 * shapes and `src/hooks/useSentryIssues.ts` consumes them, so a change to
 * either side is a type error on the other. Types only — nothing here is
 * allowed to import server code.
 */

/** Time windows the dashboard offers, mapped straight onto Sentry `statsPeriod`. */
export const SENTRY_STATS_PERIODS = ['1h', '24h', '7d', '14d', '30d', '90d'] as const
export type SentryStatsPeriod = (typeof SENTRY_STATS_PERIODS)[number]

/** Allow-listed issue scopes; the server refuses anything else. */
export const SENTRY_ISSUE_SCOPES = ['unresolved', 'resolved', 'ignored', 'all'] as const
export type SentryIssueScope = (typeof SENTRY_ISSUE_SCOPES)[number]

/** One row of the dashboard table. A trimmed projection of Sentry's issue object. */
export type SentryIssueRow = {
  id: string
  shortId: string
  title: string
  culprit: string
  type: string
  value: string
  level: string
  status: string
  substatus: string | null
  count: number
  userCount: number
  firstSeen: string
  lastSeen: string
  permalink: string
  isUnhandled: boolean
  /**
   * Event counts over the requested `statsPeriod`, for the row sparkline.
   *
   * Bucket width is chosen by Sentry and follows the period: hourly for `24h`,
   * daily for the multi-day periods. Deliberately not named `hourlyCounts` —
   * Sentry keys its `stats` object by the requested period, so assuming hours
   * silently empties the column for every period except `24h`.
   */
  eventCounts: number[]
}

/**
 * One row of the expanded sub-table. The event's context flattened into
 * sortable, paginatable key/value pairs — which is what lets IP address,
 * browser, URL, release and every Sentry tag live in one sortable table
 * instead of a fixed layout that has to grow a slot per field.
 */
export type SentryAttributeRow = {
  /** Stable row id, `group:key`. */
  id: string
  /** Grouping for the sub-table's Source column. */
  group: 'request' | 'client' | 'release' | 'user' | 'tag'
  key: string
  value: string | null
  /** Why a value is absent, when that is a policy decision rather than a gap. */
  absentReason?: string
}

/** The expanded "sub info" panel: everything worth knowing about one occurrence. */
export type SentryEventDetail = {
  eventId: string
  dateCreated: string | null
  message: string | null
  platform: string | null
  environment: string | null
  release: string | null
  transaction: string | null
  serverName: string | null
  /** Null whenever Sentry holds no IP — this app runs with `sendDefaultPii: false`. */
  ipAddress: string | null
  userId: string | null
  browser: string | null
  os: string | null
  device: string | null
  runtime: string | null
  url: string | null
  httpMethod: string | null
  permalink: string | null
  tags: Array<{ key: string; value: string }>
  /** Every field above, flattened for the sub-table. */
  attributes: SentryAttributeRow[]
  /** Innermost frames first — the throwing frame leads. */
  frames: Array<{
    function: string | null
    filename: string | null
    lineNo: number | null
    colNo: number | null
    inApp: boolean
  }>
  breadcrumbs: Array<{
    timestamp: string | null
    category: string | null
    level: string | null
    message: string | null
  }>
}

/**
 * Statuses an operator can set from the dashboard. `unresolved` doubles as
 * "reopen" for an issue that was resolved or ignored.
 */
export const SENTRY_MUTABLE_STATUSES = ['resolved', 'ignored', 'unresolved'] as const
export type SentryMutableStatus = (typeof SENTRY_MUTABLE_STATUSES)[number]

/** Body of a triage request: set a status on, or delete, one or more issues. */
export type SentryMutation =
  | { action: 'setStatus'; issueIds: string[]; status: SentryMutableStatus }
  | { action: 'delete'; issueIds: string[] }

/**
 * Returned with HTTP 501 when the operator has not wired up the Sentry auth
 * token. Carries its own remediation text so the UI can render setup guidance
 * instead of a generic failure.
 */
export type SentryConfigError = { error: string; hint: string }
