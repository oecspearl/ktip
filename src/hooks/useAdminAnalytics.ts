import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import {
  measuredCount,
  okList,
  unavailableList,
  type Measured,
  type MeasuredList,
} from '../lib/measured'

export interface DistributionItem {
  label: string
  count: number
}

export interface MonthlyGrowth {
  month: string
  count: number
}

/**
 * Every series is a MeasuredList rather than a bare array.
 *
 * The old shape could not tell a caller the difference between "this platform
 * has no projects in any category" and "get_projects_by_category no longer
 * exists" — both arrived as `[]` and BarChart rendered "No data available" for
 * each. The `error` this hook built was never read by anything.
 *
 * Migration 131 makes the RPCs raise on a refusal instead of returning an empty
 * set, which is what lets the distinction survive the round trip at all.
 */
export interface AnalyticsData {
  usersByRole: MeasuredList<DistributionItem>
  usersByCountry: MeasuredList<DistributionItem>
  projectsByCategory: MeasuredList<DistributionItem>
  projectsByPhase: MeasuredList<DistributionItem>
  eventsByType: MeasuredList<DistributionItem>
  grantPipeline: MeasuredList<DistributionItem>
  userGrowth: MeasuredList<MonthlyGrowth>
  resourceCount: Measured
}

/**
 * Why these strings are not translated.
 *
 * They name a failing RPC to whoever is going to fix it. That is the same
 * argument scripts/i18n/config.mjs makes for app-error.ts's SAFE_MESSAGES: a
 * developer-facing diagnostic translated into French helps nobody, and the
 * previous code shipped `t\`RPC not available\`` into all four catalogs.
 */
function reasonFor(name: string, error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  return message ? `${name}: ${message}` : `${name} did not respond`
}

export function useAdminAnalytics() {
  const fetchAnalytics = async (): Promise<AnalyticsData> => {
    // `as any`: these RPCs are not in the generated Supabase types.
    const rpc = (name: string, params?: any) =>
      (supabase.rpc as any)(name, params).then(
        (r: any) => ({ name, data: r.data, error: r.error }),
        // A rejected promise (network, or a function that no longer exists) has
        // to become a *failed* result. `true` rather than a synthetic error
        // object: reasonFor() falls back to "<name> did not respond", which is
        // more use to whoever is fixing it than a message we invented here.
        (err: any) => ({ name, data: null, error: err ?? true })
      )

    const [
      roleRes,
      countryRes,
      categoryRes,
      phaseRes,
      eventTypeRes,
      pipelineRes,
      growthRes,
      resourceCountRes,
    ] = await Promise.all([
      rpc('get_users_by_role'),
      rpc('get_users_by_country'),
      rpc('get_projects_by_category'),
      rpc('get_projects_by_phase'),
      rpc('get_events_by_type'),
      rpc('get_grant_application_pipeline'),
      rpc('get_user_growth'),
      (supabase as any).from('resources').select('*', { count: 'exact', head: true }),
    ])

    const asDistribution = (res: {
      name: string
      data: any
      error: unknown
    }): MeasuredList<DistributionItem> => {
      if (res.error || !Array.isArray(res.data)) {
        return unavailableList(reasonFor(res.name, res.error))
      }
      return okList(
        res.data.map((item: any) => ({
          label:
            item.role ||
            item.country ||
            item.category ||
            item.phase ||
            item.event_type ||
            item.status ||
            'Unknown',
          count: Number(item.count) || 0,
        }))
      )
    }

    const asGrowth = (res: {
      name: string
      data: any
      error: unknown
    }): MeasuredList<MonthlyGrowth> => {
      if (res.error || !Array.isArray(res.data)) {
        return unavailableList(reasonFor(res.name, res.error))
      }
      return okList(
        res.data.map((item: any) => ({
          month: item.month || '',
          count: Number(item.count) || 0,
        }))
      )
    }

    return {
      usersByRole: asDistribution(roleRes),
      usersByCountry: asDistribution(countryRes),
      projectsByCategory: asDistribution(categoryRes),
      projectsByPhase: asDistribution(phaseRes),
      eventsByType: asDistribution(eventTypeRes),
      grantPipeline: asDistribution(pipelineRes),
      userGrowth: asGrowth(growthRes),
      resourceCount: measuredCount(resourceCountRes, 'resources count was refused'),
    }
  }

  const query = useQuery({
    queryKey: keys.list('admin-analytics'),
    queryFn: fetchAnalytics,
  })

  return { analytics: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
