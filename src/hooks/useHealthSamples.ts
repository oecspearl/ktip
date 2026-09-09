import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { okList, unavailableList, type MeasuredList } from '../lib/measured'

export interface HealthSample {
  observed_at: string
  source: string
  window_label: string
  uptime_pct: number | null
  error_rate_5xx: number | null
  p75_lcp_ms: number | null
}

/**
 * Externally observed health over a window (migration 134, fed by 146).
 *
 * Read directly rather than through an RPC: the table's SELECT policy is
 * already org:manage, and every row is a reading — there is nothing to
 * aggregate that the chart does not want to see. A NULL column is a probe
 * that had nothing to say about that figure, and stays a gap in the line.
 */
export function useHealthSamples(period: { start: string; end: string }) {
  const query = useQuery({
    queryKey: keys.list('health-samples', period),
    queryFn: async (): Promise<MeasuredList<HealthSample>> => {
      const { data, error } = await (supabase as any)
        .from('platform_health_samples')
        .select('observed_at,source,window_label,uptime_pct,error_rate_5xx,p75_lcp_ms')
        .gte('observed_at', period.start)
        .lt('observed_at', period.end)
        .order('observed_at', { ascending: true })
      if (error) return unavailableList(`platform_health_samples: ${error.message}`)
      return okList((data as HealthSample[]) || [])
    },
    staleTime: 5 * 60 * 1000,
  })
  return { samples: query.data, loading: query.isPending, refetch: query.refetch }
}
