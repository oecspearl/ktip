import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year'

export interface KpiSnapshotRow {
  period_start: string
  kpi_key: string
  value: number | null
}

/**
 * Historical KPI readings (migration 132).
 *
 * The reason this exists rather than recomputing: about half the §14 KPIs are
 * point-in-time (MAU, active projects, active mentorships) and CANNOT be
 * recomputed for a past period. Without the snapshot table, last month's report
 * silently becomes this month's numbers under last month's heading.
 */
export function useKpiHistory(periodKind: PeriodKind, limit = 26) {
  const query = useQuery({
    queryKey: keys.list('kpi-snapshots', { periodKind, limit }),
    queryFn: async (): Promise<KpiSnapshotRow[]> => {
      const { data, error } = await (supabase as any).rpc('read_kpi_history', {
        p_period_kind: periodKind,
        p_limit: limit,
      })
      if (error) throw error
      return (data as KpiSnapshotRow[]) || []
    },
    staleTime: 10 * 60 * 1000,
  })

  /** Rows regrouped as period → key → value, which is how the table renders. */
  const byPeriod = new Map<string, Record<string, number | null>>()
  for (const row of query.data || []) {
    const existing = byPeriod.get(row.period_start) || {}
    existing[row.kpi_key] = row.value
    byPeriod.set(row.period_start, existing)
  }

  return {
    rows: query.data,
    byPeriod,
    periods: [...byPeriod.keys()],
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Take (or retake) a reading for one period.
 *
 * The cron does this on a schedule; this is the manual path, which exists for
 * two reasons that are not the same. Backfilling a period the job missed, and
 * running the framework at all on a Vercel plan whose cron tier is unavailable.
 */
export function useSnapshotKpis() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: { periodKind: PeriodKind; periodStart: string }) => {
      const { data, error } = await (supabase as any).rpc('snapshot_kpis', {
        p_period_kind: input.periodKind,
        p_period_start: input.periodStart,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('kpi-snapshots') })
    },
  })

  return { snapshot: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/** Monday-anchored week start, matching date_trunc('week') in Postgres. */
export function startOfPeriod(kind: PeriodKind, from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))

  if (kind === 'week') {
    // getUTCDay() is 0 for Sunday; Postgres weeks start on Monday.
    const dayOffset = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - dayOffset)
    return d.toISOString().slice(0, 10)
  }
  if (kind === 'month') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
  }
  if (kind === 'quarter') {
    const q = Math.floor(d.getUTCMonth() / 3)
    return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10)
  }
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10)
}
