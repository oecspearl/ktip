import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useLingui } from '@lingui/react/macro'

export interface DistributionItem {
  label: string
  count: number
}

export interface MonthlyGrowth {
  month: string
  count: number
}

export interface AnalyticsData {
  usersByRole: DistributionItem[]
  usersByCountry: DistributionItem[]
  projectsByCategory: DistributionItem[]
  projectsByPhase: DistributionItem[]
  eventsByType: DistributionItem[]
  grantPipeline: DistributionItem[]
  userGrowth: MonthlyGrowth[]
  resourceCount: number
}

export function useAdminAnalytics() {
    const { t } = useLingui()
  const fetchAnalytics = async (): Promise<AnalyticsData> => {
    // Use `as any` to call RPC functions not yet in generated Supabase types
    const rpc = (name: string, params?: any) =>
      (supabase.rpc as any)(name, params).then(
        (r: any) => r,
        () => ({ data: null, error: { message: t`RPC not available` } })
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

    const mapDistribution = (data: any[] | null): DistributionItem[] => {
      if (!data || !Array.isArray(data)) return []
      return data.map((item: any) => ({
        label: item.role || item.country || item.category || item.phase || item.event_type || item.status || 'Unknown',
        count: Number(item.count) || 0,
      }))
    }

    const mapGrowth = (data: any[] | null): MonthlyGrowth[] => {
      if (!data || !Array.isArray(data)) return []
      return data.map((item: any) => ({
        month: item.month || '',
        count: Number(item.count) || 0,
      }))
    }

    return {
      usersByRole: mapDistribution(roleRes.data),
      usersByCountry: mapDistribution(countryRes.data),
      projectsByCategory: mapDistribution(categoryRes.data),
      projectsByPhase: mapDistribution(phaseRes.data),
      eventsByType: mapDistribution(eventTypeRes.data),
      grantPipeline: mapDistribution(pipelineRes.data),
      userGrowth: mapGrowth(growthRes.data),
      resourceCount: resourceCountRes.count || 0,
    }
  }

  const query = useQuery({
    queryKey: keys.list('admin-analytics'),
    queryFn: fetchAnalytics,
  })

  return { analytics: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
