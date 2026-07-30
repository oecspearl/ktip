/**
 * Read-only client for the Sentry Web API, plus the request router shared by
 * the Vercel Edge Function (`api/admin/sentry.ts`) and the local dev
 * middleware in `vite.config.ts`. Both entry points do their own
 * authorisation and then delegate here, so the Sentry-specific shaping lives
 * in exactly one place.
 *
 * Platform-free on purpose: no Vercel, Vite, or Supabase imports, only
 * `fetch`. That is what lets the dev middleware load this module directly.
 *
 * Never import this from `src/` — it reads the Sentry auth token, which must
 * never reach the browser bundle.
 */

import type {
  SentryAttributeRow,
  SentryConfigError,
  SentryEventDetail,
  SentryIssueRow,
  SentryIssueScope,
  SentryMutation,
  SentryMutableStatus,
  SentryStatsPeriod,
} from '../src/types/sentry'
import { SENTRY_MUTABLE_STATUSES, SENTRY_STATS_PERIODS } from '../src/types/sentry'

export type { SentryConfigError, SentryEventDetail, SentryIssueRow }

/** Resolved credentials for one Sentry project. */
export type SentryApiConfig = {
  /** Sentry Web API root, e.g. `https://de.sentry.io/api/0` (no trailing slash). */
  baseUrl: string
  authToken: string
  org: string
  project: string
}

/**
 * Reads config from a plain env bag so the dev middleware can pass Vite's
 * `loadEnv` result and the Edge Function can pass `process.env`.
 *
 * `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are the same three
 * variables the source-map upload in `vite.config.ts` already uses.
 */
export function resolveSentryApiConfig(
  env: Record<string, string | undefined>,
): SentryApiConfig | SentryConfigError {
  const authToken = env.SENTRY_AUTH_TOKEN
  const org = env.SENTRY_ORG
  const project = env.SENTRY_PROJECT

  if (!authToken || !org || !project) {
    const missing = [
      !authToken && 'SENTRY_AUTH_TOKEN',
      !org && 'SENTRY_ORG',
      !project && 'SENTRY_PROJECT',
    ].filter(Boolean)

    return {
      error: `Sentry API is not configured (missing ${missing.join(', ')}).`,
      hint:
        'Create an internal integration or user auth token with the "event:read" and "project:read" scopes, ' +
        'then set SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT. EU-region orgs must also set ' +
        'SENTRY_API_BASE_URL=https://de.sentry.io/api/0.',
    }
  }

  return {
    // Trailing slashes would produce `//issues/` paths, which Sentry rejects.
    baseUrl: (env.SENTRY_API_BASE_URL || 'https://sentry.io/api/0').replace(/\/+$/, ''),
    authToken,
    org,
    project,
  }
}

export function isSentryConfigError(
  value: SentryApiConfig | SentryConfigError,
): value is SentryConfigError {
  return 'error' in value
}

/**
 * Issue scopes the dashboard exposes. Allow-listed rather than passing a raw
 * `query` through, so the endpoint cannot be used as an open proxy for
 * arbitrary Sentry search syntax.
 */
const ISSUE_SCOPE_QUERIES: Record<SentryIssueScope, string> = {
  unresolved: 'is:unresolved',
  resolved: 'is:resolved',
  ignored: 'is:ignored',
  all: '',
}

type SentryFetchResult<T> = { status: number; body: T | { error: string; hint?: string } }

async function sentryFetch<T>(
  config: SentryApiConfig,
  path: string,
  search?: Record<string, string | string[]>,
  init?: { method: 'PUT' | 'DELETE'; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = new URL(`${config.baseUrl}${path}`)
  Object.entries(search ?? {}).forEach(([key, value]) => {
    // Sentry's bulk endpoints take repeated `id` params, not a joined list.
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry))
    else if (value !== '') url.searchParams.set(key, value)
  })

  let response: Response
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the Sentry API.' }
  }

  if (!response.ok) {
    // Sentry's own error bodies can echo the request; only the status and a
    // fixed message are surfaced so nothing unexpected reaches the browser.
    const reason =
      response.status === 401 || response.status === 403
        ? 'Sentry rejected the auth token. Reads need event:read and project:read; resolving, ignoring and deleting issues also need event:write (delete needs event:admin). Check SENTRY_ORG / SENTRY_PROJECT are the correct slugs.'
        : response.status === 404
          ? `Sentry has no project "${config.project}" in organisation "${config.org}".`
          : `Sentry API returned ${response.status}.`
    return { ok: false, status: response.status === 404 ? 404 : 502, error: reason }
  }

  // Deletes answer 204 with no body, so parsing unconditionally would throw.
  if (response.status === 204) return { ok: true, data: {} as T }
  return { ok: true, data: (await response.json()) as T }
}

type RawIssue = {
  id: string
  shortId?: string
  title?: string
  culprit?: string
  level?: string
  status?: string
  substatus?: string | null
  count?: string | number
  userCount?: number
  firstSeen?: string
  lastSeen?: string
  permalink?: string
  isUnhandled?: boolean
  metadata?: { type?: string; value?: string }
  stats?: Record<string, Array<[number, number]>>
}

function mapIssue(issue: RawIssue, statsPeriod: SentryStatsPeriod): SentryIssueRow {
  return {
    id: issue.id,
    shortId: issue.shortId ?? issue.id,
    title: issue.title ?? issue.metadata?.type ?? 'Unknown error',
    culprit: issue.culprit ?? '',
    type: issue.metadata?.type ?? '',
    value: issue.metadata?.value ?? '',
    level: issue.level ?? 'error',
    status: issue.status ?? 'unresolved',
    substatus: issue.substatus ?? null,
    // Sentry serialises `count` as a string once it gets large.
    count: Number(issue.count ?? 0),
    userCount: issue.userCount ?? 0,
    firstSeen: issue.firstSeen ?? '',
    lastSeen: issue.lastSeen ?? '',
    permalink: issue.permalink ?? '',
    isUnhandled: Boolean(issue.isUnhandled),
    // Sentry keys `stats` by the period that was requested, so this must look
    // up that key rather than a fixed '24h'. The remaining fallbacks cover a
    // response that returns a different bucket than asked for.
    eventCounts: (
      issue.stats?.[statsPeriod] ??
      issue.stats?.['24h'] ??
      Object.values(issue.stats ?? {})[0] ??
      []
    ).map(([, value]) => value),
  }
}

type RawEvent = {
  id?: string
  eventID?: string
  dateCreated?: string
  dateReceived?: string
  message?: string
  title?: string
  platform?: string
  user?: { id?: string | number; ip_address?: string } | null
  contexts?: Record<string, Record<string, unknown> | undefined>
  tags?: Array<{ key?: string; value?: string }>
  entries?: Array<{ type?: string; data?: unknown }>
}

function contextString(
  contexts: RawEvent['contexts'],
  key: string,
  fields: string[],
): string | null {
  const context = contexts?.[key]
  if (!context) return null
  const parts = fields
    .map((field) => context[field])
    .filter((value): value is string | number => value !== undefined && value !== null && value !== '')
    .map(String)
  return parts.length ? parts.join(' ') : null
}

function tagValue(tags: RawEvent['tags'], key: string): string | null {
  return tags?.find((tag) => tag.key === key)?.value ?? null
}

/**
 * Flattens the event into the sub-table's rows.
 *
 * Fixed rows come first and are always present, even when empty, so the
 * absence of an IP address is itself visible information rather than a missing
 * row. Every remaining Sentry tag is appended, minus the ones already promoted
 * to a fixed row.
 */
function buildAttributeRows(
  detail: Omit<SentryEventDetail, 'attributes'>,
): SentryAttributeRow[] {
  const fixed: SentryAttributeRow[] = [
    {
      id: 'request:ip_address',
      group: 'request',
      key: 'IP address',
      value: detail.ipAddress,
      absentReason: 'Not collected — sendDefaultPii is off',
    },
    { id: 'request:url', group: 'request', key: 'URL', value: detail.url },
    { id: 'request:method', group: 'request', key: 'HTTP method', value: detail.httpMethod },
    { id: 'request:transaction', group: 'request', key: 'Transaction', value: detail.transaction },
    { id: 'client:browser', group: 'client', key: 'Browser', value: detail.browser },
    { id: 'client:os', group: 'client', key: 'Operating system', value: detail.os },
    { id: 'client:device', group: 'client', key: 'Device', value: detail.device },
    { id: 'client:runtime', group: 'client', key: 'Runtime', value: detail.runtime },
    { id: 'client:platform', group: 'client', key: 'Platform', value: detail.platform },
    { id: 'release:environment', group: 'release', key: 'Environment', value: detail.environment },
    { id: 'release:release', group: 'release', key: 'Release', value: detail.release },
    { id: 'release:server_name', group: 'release', key: 'Server name', value: detail.serverName },
    {
      id: 'user:id',
      group: 'user',
      key: 'User ID',
      value: detail.userId,
      absentReason: 'Anonymous — no authenticated user on this event',
    },
  ]

  // Tag keys whose information is already a fixed row above.
  const promoted = new Set([
    'environment',
    'release',
    'transaction',
    'server_name',
    'browser',
    'browser.name',
    'os',
    'os.name',
    'device',
    'device.family',
    'runtime',
    'runtime.name',
    'url',
    'ip_address',
    'user',
  ])

  const tagRows: SentryAttributeRow[] = detail.tags
    .filter((tag) => !promoted.has(tag.key))
    .map((tag) => ({ id: `tag:${tag.key}`, group: 'tag' as const, key: tag.key, value: tag.value }))

  return [...fixed, ...tagRows]
}

function mapEvent(event: RawEvent, permalink: string | null): SentryEventDetail {
  const entries = event.entries ?? []
  const requestEntry = entries.find((entry) => entry.type === 'request')?.data as
    | { url?: string; method?: string }
    | undefined
  const exceptionEntry = entries.find((entry) => entry.type === 'exception')?.data as
    | {
        values?: Array<{
          stacktrace?: {
            frames?: Array<{
              function?: string
              filename?: string
              lineNo?: number
              colNo?: number
              inApp?: boolean
            }>
          }
        }>
      }
    | undefined
  const breadcrumbEntry = entries.find((entry) => entry.type === 'breadcrumbs')?.data as
    | {
        values?: Array<{
          timestamp?: string
          category?: string
          level?: string
          message?: string
        }>
      }
    | undefined

  // Sentry orders frames outermost-first; the throwing frame is the most
  // useful one, so the list is reversed and capped.
  const rawFrames = exceptionEntry?.values?.at(-1)?.stacktrace?.frames ?? []
  const frames = [...rawFrames]
    .reverse()
    .slice(0, 12)
    .map((frame) => ({
      function: frame.function ?? null,
      filename: frame.filename ?? null,
      lineNo: frame.lineNo ?? null,
      colNo: frame.colNo ?? null,
      inApp: Boolean(frame.inApp),
    }))

  const breadcrumbs = [...(breadcrumbEntry?.values ?? [])]
    .slice(-8)
    .reverse()
    .map((crumb) => ({
      timestamp: crumb.timestamp ?? null,
      category: crumb.category ?? null,
      level: crumb.level ?? null,
      message: crumb.message ?? null,
    }))

  const detail: Omit<SentryEventDetail, 'attributes'> = {
    eventId: event.eventID ?? event.id ?? '',
    dateCreated: event.dateCreated ?? event.dateReceived ?? null,
    message: event.message || event.title || null,
    platform: event.platform ?? null,
    environment: tagValue(event.tags, 'environment'),
    release: tagValue(event.tags, 'release'),
    transaction: tagValue(event.tags, 'transaction'),
    serverName: tagValue(event.tags, 'server_name'),
    // Absent by design under `sendDefaultPii: false`; the UI says so rather
    // than rendering a blank cell.
    ipAddress: event.user?.ip_address ?? tagValue(event.tags, 'ip_address') ?? null,
    userId: event.user?.id !== undefined && event.user?.id !== null ? String(event.user.id) : null,
    browser: contextString(event.contexts, 'browser', ['name', 'version']),
    os: contextString(event.contexts, 'os', ['name', 'version']),
    device: contextString(event.contexts, 'device', ['brand', 'model', 'family']),
    runtime: contextString(event.contexts, 'runtime', ['name', 'version']),
    url: requestEntry?.url ?? tagValue(event.tags, 'url') ?? null,
    httpMethod: requestEntry?.method ?? null,
    permalink,
    tags: (event.tags ?? [])
      .filter((tag): tag is { key: string; value: string } => !!tag.key && !!tag.value)
      .map((tag) => ({ key: tag.key, value: tag.value })),
    frames,
    breadcrumbs,
  }

  return { ...detail, attributes: buildAttributeRows(detail) }
}

/**
 * Routes one dashboard request. `url` is the incoming request URL; only its
 * query string is read, so the caller's mount path is irrelevant.
 *
 * - `?resource=issues&scope=&statsPeriod=&limit=` — the table's rows.
 * - `?resource=event&issueId=` — the latest event for one issue (the sub-row).
 *
 * Returns a status and a JSON-serialisable body instead of a `Response`, so
 * the Node dev middleware and the Edge Function can each frame it their own
 * way.
 */
export async function handleSentryDashboardRequest(
  url: URL,
  config: SentryApiConfig,
): Promise<SentryFetchResult<{ issues: SentryIssueRow[] } | SentryEventDetail>> {
  const resource = url.searchParams.get('resource') ?? 'issues'

  if (resource === 'issues') {
    const scopeParam = url.searchParams.get('scope') ?? 'unresolved'
    const scope: SentryIssueScope =
      scopeParam in ISSUE_SCOPE_QUERIES ? (scopeParam as SentryIssueScope) : 'unresolved'

    const periodParam = url.searchParams.get('statsPeriod') ?? '14d'
    const statsPeriod: SentryStatsPeriod = (SENTRY_STATS_PERIODS as readonly string[]).includes(
      periodParam,
    )
      ? (periodParam as SentryStatsPeriod)
      : '14d'

    // Sentry caps `limit` at 100 per page. The dashboard paginates
    // client-side within one window, which keeps sorting and search honest
    // across the whole visible set.
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1), 100)

    const result = await sentryFetch<RawIssue[]>(
      config,
      `/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/issues/`,
      {
        query: ISSUE_SCOPE_QUERIES[scope],
        statsPeriod,
        limit: String(limit),
        sort: 'freq',
      },
    )

    if (!result.ok) return { status: result.status, body: { error: result.error } }
    return { status: 200, body: { issues: result.data.map((issue) => mapIssue(issue, statsPeriod)) } }
  }

  if (resource === 'event') {
    const issueId = url.searchParams.get('issueId') ?? ''
    // Sentry issue IDs are numeric; validating keeps the id out of the path
    // unless it is provably safe.
    if (!/^\d+$/.test(issueId)) {
      return { status: 400, body: { error: 'A numeric issueId is required.' } }
    }

    const result = await sentryFetch<RawEvent>(config, `/issues/${issueId}/events/latest/`)
    if (!result.ok) return { status: result.status, body: { error: result.error } }

    const eventId = result.data.eventID ?? result.data.id ?? ''
    const permalink = eventId
      ? `https://${config.org}.sentry.io/issues/${issueId}/events/${eventId}/`
      : null

    return { status: 200, body: mapEvent(result.data, permalink) }
  }

  return { status: 400, body: { error: `Unknown resource "${resource}".` } }
}

/** Numeric Sentry issue IDs only, capped so one call cannot fan out unbounded. */
function parseIssueIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null
  const ids = value.map(String)
  return ids.every((id) => /^\d+$/.test(id)) ? ids : null
}

/**
 * Applies a triage mutation: set a status on, or delete, a batch of issues.
 *
 * Both use Sentry's project-scoped bulk endpoints, so selecting twenty rows in
 * the grid costs one request rather than twenty. Returns the affected IDs so
 * the client can reconcile its cache without a refetch round-trip.
 */
export async function handleSentryMutation(
  body: unknown,
  config: SentryApiConfig,
): Promise<SentryFetchResult<{ issueIds: string[]; status?: SentryMutableStatus }>> {
  const mutation = body as Partial<SentryMutation> | null
  const issueIds = parseIssueIds(mutation?.issueIds)
  if (!issueIds) {
    return { status: 400, body: { error: 'issueIds must be 1–100 numeric Sentry issue IDs.' } }
  }

  const path = `/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/issues/`

  if (mutation?.action === 'setStatus') {
    const status = mutation.status as SentryMutableStatus
    if (!(SENTRY_MUTABLE_STATUSES as readonly string[]).includes(status)) {
      return {
        status: 400,
        body: { error: `status must be one of ${SENTRY_MUTABLE_STATUSES.join(', ')}.` },
      }
    }

    const result = await sentryFetch(config, path, { id: issueIds }, { method: 'PUT', body: { status } })
    if (!result.ok) return { status: result.status, body: { error: result.error } }
    return { status: 200, body: { issueIds, status } }
  }

  if (mutation?.action === 'delete') {
    const result = await sentryFetch(config, path, { id: issueIds }, { method: 'DELETE' })
    if (!result.ok) return { status: result.status, body: { error: result.error } }
    return { status: 200, body: { issueIds } }
  }

  return { status: 400, body: { error: 'action must be "setStatus" or "delete".' } }
}
