import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { okList, unavailableList, type MeasuredList } from '../lib/measured'
import type { SeriesGrain, SeriesMetric, SeriesPoint } from '../lib/kpi-series'

export interface SeriesFilters {
  metric: SeriesMetric
  grain: SeriesGrain
  /** ISO dates, start inclusive, end exclusive. */
  start: string
  end: string
  /** A profiles.country name, or null for the whole platform. */
  country?: string | null
}

/**
 * A metric over time, bucketed by day, week or month (migration 143).
 *
 * Returned as a MeasuredList rather than thrown, for the reason every chart
 * on the console shares: a refused RPC must render as "couldn't load", never
 * as a flat line at zero. The RPC zero-fills empty buckets itself, so an `ok`
 * list with zeros in it is the platform saying nothing happened that month.
 */
export function useKpiSeries(filters: SeriesFilters) {
  const query = useQuery({
    queryKey: keys.list('kpi-series', filters),
    queryFn: async (): Promise<MeasuredList<SeriesPoint>> => {
      const { data, error } = await (supabase as any).rpc('get_kpi_series', {
        p_metric: filters.metric,
        p_grain: filters.grain,
        p_start: filters.start,
        p_end: filters.end,
        p_country: filters.country ?? null,
      })
      if (error) return unavailableList(`get_kpi_series(${filters.metric}) failed: ${error.message}`)
      const rows = (data as Array<{ bucket: string; segment: string; value: number | string | null }>) || []
      return okList(
        rows.map((row) => ({
          bucket: row.bucket,
          segment: row.segment,
          value: Number(row.value ?? 0),
        })),
      )
    },
    staleTime: 5 * 60 * 1000,
  })

  return { series: query.data, loading: query.isPending, refetch: query.refetch }
}
