import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { UsageRow } from '../lib/venue-usage'
import type { UsageMeters } from '../lib/free-tiers'

/**
 * The organiser's usage reads (migration 193). Hosts only; the functions
 * refuse anyone else.
 *
 * Before 193 is applied the functions do not exist. That is a normal state,
 * not an error: each hook reports `missing` and the panel says metering is not
 * switched on, instead of showing a red banner on every organiser's screen.
 */

export interface UsageResult<T> {
  data: T | null
  loading: boolean
  /** The function is not on this database yet (pre-193). */
  missing: boolean
  /** Any other failure, such as a viewer who is not a host. */
  failed: boolean
}

/** PostgREST's "no such function" and Postgres's own, for either path. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') return true
  return /could not find the function|does not exist/i.test(error.message ?? '')
}

type Outcome<T> = { data: T | null; missing: boolean; failed: boolean }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<Outcome<T>> {
  const { data, error } = await (supabase as any).rpc(fn, args)
  if (error) return { data: null, missing: isMissingFunction(error), failed: !isMissingFunction(error) }
  return { data: (data ?? null) as T | null, missing: false, failed: false }
}

function toResult<T>(query: { data?: Outcome<T>; isPending: boolean; isError: boolean }): UsageResult<T> {
  return {
    data: query.data?.data ?? null,
    loading: query.isPending,
    missing: query.data?.missing ?? false,
    failed: query.isError || (query.data?.failed ?? false),
  }
}

export function useVenueUsageBreakdown(
  eventId: string | undefined,
  from: string | null,
  to: string | null
): UsageResult<UsageRow[]> {
  const query = useQuery({
    queryKey: [...keys.sub('venue', 'usage-breakdown', eventId), from, to],
    enabled: !!eventId,
    // A minute is fresh enough for a dashboard and cheap for the database.
    refetchInterval: 60_000,
    queryFn: () =>
      call<UsageRow[]>('venue_usage_breakdown', { p_event_id: eventId, p_from: from, p_to: to }),
  })
  return toResult(query)
}

export function useVenueUsageMeters(eventId: string | undefined): UsageResult<UsageMeters> {
  const query = useQuery({
    queryKey: keys.sub('venue', 'usage-meters', eventId),
    enabled: !!eventId,
    refetchInterval: 60_000,
    queryFn: () => call<UsageMeters>('venue_usage_meters', { p_event_id: eventId }),
  })
  return toResult(query)
}

export interface OpsSnapshot {
  open_help_requests: number
  help_requests_today: number
  /** null where the submissions table does not exist. */
  submissions: number | null
}

export function useVenueOpsSnapshot(eventId: string | undefined): UsageResult<OpsSnapshot> {
  const query = useQuery({
    queryKey: keys.sub('venue', 'ops-snapshot', eventId),
    enabled: !!eventId,
    // Hands go down after five minutes, so this needs to move faster.
    refetchInterval: 30_000,
    queryFn: () => call<OpsSnapshot>('venue_ops_snapshot', { p_event_id: eventId }),
  })
  return toResult(query)
}
