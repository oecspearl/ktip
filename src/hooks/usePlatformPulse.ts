import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { PlatformPulse } from '../lib/kpi-catalog'

export interface KpiTarget {
  kpi_key: string
  period_start: string
  period_end: string
  target_value: number
  unit: string
  note: string | null
}

/**
 * Every Phase 1 KPI in one round trip (migration 131).
 *
 * One RPC rather than the twenty separate queries the figures would otherwise
 * need — the argument 114_member_stats_rpc.sql makes for the member dashboard,
 * and it applies harder here because several of these aggregate tables whose
 * RLS is own-rows-only and would need a definer function each.
 *
 * The RPC RAISES on a caller without org:manage rather than returning an empty
 * object, so a refusal reaches the catalog's `read()` as an error and renders as
 * "couldn't load" rather than as a platform with no members.
 */
export function usePlatformPulse(period?: { start: string; end: string }) {
  const query = useQuery({
    queryKey: keys.list('platform-pulse', period),
    queryFn: async (): Promise<PlatformPulse> => {
      const params = { p_period_start: period?.start, p_period_end: period?.end }

      // Three RPCs, merged into one object keyed the way kpi-catalog reads it.
      // Split by phase rather than one giant function so 131 stays deployable on
      // its own and an abandoned instrument can be dropped without touching the
      // Phase 1 figures.
      //
      // Phase 1 is required — a failure there is a failure of the whole pulse.
      // Phases 2 and 3 are tolerated: their functions may genuinely not exist
      // yet on an environment that has only run 131, and the catalog already
      // renders a missing key as "not yet measured", which is the truth.
      const [core, phase2, phase3] = await Promise.all([
        (supabase as any).rpc('get_platform_pulse', params),
        (supabase as any).rpc('get_phase2_pulse', params).then(
          (r: any) => r,
          () => ({ data: null, error: true })
        ),
        (supabase as any).rpc('get_phase3_pulse', params).then(
          (r: any) => r,
          () => ({ data: null, error: true })
        ),
      ])

      if (core.error) throw core.error

      return {
        ...((core.data || {}) as PlatformPulse),
        ...((phase2.error ? {} : phase2.data || {}) as PlatformPulse),
        ...((phase3.error ? {} : phase3.data || {}) as PlatformPulse),
      }
    },
    // These are month-scale figures; re-reading them on every focus is a wave of
    // aggregate queries for numbers that cannot have moved.
    staleTime: 5 * 60 * 1000,
  })

  return { pulse: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * The roadmap's targets, whichever period covers `on`.
 *
 * Data rather than constants because §14's figures are year-by-year and get
 * renegotiated with the World Bank — see migration 131's header.
 */
export function useKpiTargets(on: string = new Date().toISOString().slice(0, 10)) {
  const query = useQuery({
    queryKey: keys.list('kpi-targets', on),
    queryFn: async (): Promise<Record<string, KpiTarget>> => {
      const { data, error } = await (supabase as any)
        .from('kpi_targets')
        .select('*')
        .lte('period_start', on)
        .gte('period_end', on)

      if (error) throw error

      const byKey: Record<string, KpiTarget> = {}
      for (const row of (data as KpiTarget[]) || []) byKey[row.kpi_key] = row
      return byKey
    },
    staleTime: 30 * 60 * 1000,
  })

  return { targets: query.data, loading: query.isPending, error: query.error }
}
