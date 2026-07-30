import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  SentryConfigError,
  SentryEventDetail,
  SentryIssueRow,
  SentryIssueScope,
  SentryMutation,
  SentryStatsPeriod,
} from '../types/sentry'

/**
 * Thrown when the Sentry proxy answers 501 — the token is not configured.
 * Distinct from a real failure so the dashboard can offer setup instructions
 * instead of a retry button.
 */
export class SentryNotConfiguredError extends Error {
  readonly hint: string

  constructor({ error, hint }: SentryConfigError) {
    super(error)
    this.name = 'SentryNotConfiguredError'
    this.hint = hint
  }
}

export function isSentryNotConfigured(error: unknown): error is SentryNotConfiguredError {
  return error instanceof SentryNotConfiguredError
}

/**
 * Calls the admin Sentry proxy with the caller's Supabase access token.
 *
 * The token is re-checked server-side against the `org:manage` permission on
 * every call, in dev as well as production — the Vite middleware runs the same
 * handler as Vercel does, so there is no weaker local path.
 */
async function callProxy<T>(params: Record<string, string>, mutation?: SentryMutation): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const search = new URLSearchParams(params).toString()
  const response = await fetch(`/api/admin/sentry${search ? `?${search}` : ''}`, {
    method: mutation ? 'POST' : 'GET',
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(mutation ? { 'Content-Type': 'application/json' } : {}),
    },
    body: mutation ? JSON.stringify(mutation) : undefined,
  })

  const body = await response.json().catch(() => ({}) as Record<string, unknown>)

  if (response.status === 501) {
    throw new SentryNotConfiguredError(body as SentryConfigError)
  }
  if (!response.ok) {
    throw new Error(
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Sentry proxy returned ${response.status}.`,
    )
  }

  return body as T
}

export type SentryIssuesFilters = {
  scope: SentryIssueScope
  statsPeriod: SentryStatsPeriod
}

/**
 * The dashboard's row set. One window of up to 100 issues is fetched at a
 * time; sorting, searching and pagination then happen client-side so they
 * apply to the whole window rather than one page of it.
 */
export function useSentryIssues(filters: SentryIssuesFilters) {
  const query = useQuery({
    queryKey: keys.list('sentry-issues', filters),
    queryFn: () =>
      callProxy<{ issues: SentryIssueRow[] }>({
        resource: 'issues',
        scope: filters.scope,
        statsPeriod: filters.statsPeriod,
        limit: '100',
      }),
    // Sentry aggregates on a delay, so a short window avoids hammering the
    // API while the operator flips between scopes and periods.
    staleTime: 60_000,
    retry: (failureCount, error) => !isSentryNotConfigured(error) && failureCount < 1,
  })

  return {
    issues: query.data?.issues ?? [],
    loading: query.isPending,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

/**
 * The latest event for one issue, fetched only once its row is expanded, so
 * opening the dashboard costs a single request rather than one per row.
 */
export function useSentryIssueEvent(issueId: string | null) {
  const query = useQuery({
    queryKey: keys.detail('sentry-issue-event', issueId ?? undefined),
    queryFn: () => callProxy<SentryEventDetail>({ resource: 'event', issueId: issueId! }),
    enabled: Boolean(issueId),
    staleTime: 5 * 60_000,
    retry: false,
  })

  return { event: query.data, loading: query.isPending && Boolean(issueId), error: query.error }
}

/**
 * Triage mutations: resolve, ignore, reopen or delete a batch of issues.
 *
 * The whole `sentry-issues` domain is invalidated on success rather than the
 * one active window, because a status change moves an issue between scopes —
 * a resolve makes it vanish from Unresolved and appear under Resolved, and
 * both cached lists are now wrong.
 */
export function useSentryTriage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mutation: SentryMutation) =>
      callProxy<{ issueIds: string[] }>({}, mutation),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all('sentry-issues') }),
  })
}
