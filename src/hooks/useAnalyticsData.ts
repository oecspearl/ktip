import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

export interface PageViewStat {
  path: string
  count: number
}

export interface FeatureUsageStat {
  feature: string
  action: string
  count: number
}

export interface FunnelStep {
  step: string
  count: number
}

export interface DailyCount {
  date: string
  count: number
}

export interface ConversionStat {
  name: string
  count: number
}

export interface SessionSummary {
  session_id: string
  user_id: string | null
  started_at: string
  page_count: number
  pages: string[]
}

export type DateRange = '7d' | '30d' | '90d' | 'all'

function getDateFilter(range: DateRange): string | null {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function useAnalyticsData() {
  const [range, setRange] = useState<DateRange>('30d')

  const buildQuery = (eventType?: string) => {
    let q = (supabase as any).from('analytics_events').select('*')
    const since = getDateFilter(range)
    if (since) q = q.gte('created_at', since)
    if (eventType) q = q.eq('event_type', eventType)
    return q.order('created_at', { ascending: false })
  }

  // Total event count
  const totalEventsQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'total-events', range),
    queryFn: async () => {
      const since = getDateFilter(range)
      let q = (supabase as any).from('analytics_events').select('*', { count: 'exact', head: true })
      if (since) q = q.gte('created_at', since)
      const { count } = await q
      return count || 0
    },
  })

  // Unique sessions
  const uniqueSessionsQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'unique-sessions', range),
    queryFn: async () => {
      const { data } = await buildQuery().select('session_id')
      if (!data) return 0
      return new Set(data.map((e: any) => e.session_id)).size
    },
  })

  // Page views — top pages
  const topPagesQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'top-pages', range),
    queryFn: async (): Promise<PageViewStat[]> => {
      const { data } = await buildQuery('page_view').select('page_path').limit(1000)
      if (!data) return []
      const counts: Record<string, number> = {}
      for (const e of data) {
        const p = e.page_path || '/'
        counts[p] = (counts[p] || 0) + 1
      }
      return Object.entries(counts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
    },
  })

  // Daily page views (for chart)
  const dailyPageViewsQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'daily-page-views', range),
    queryFn: async (): Promise<DailyCount[]> => {
      const { data } = await buildQuery('page_view').select('created_at').limit(5000)
      if (!data) return []
      const counts: Record<string, number> = {}
      for (const e of data) {
        const day = e.created_at.split('T')[0]
        counts[day] = (counts[day] || 0) + 1
      }
      return Object.entries(counts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))
    },
  })

  // Feature usage
  const featureUsageQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'feature-usage', range),
    queryFn: async (): Promise<FeatureUsageStat[]> => {
      const { data } = await buildQuery('feature_use').select('event_name, properties').limit(2000)
      if (!data) return []
      const counts: Record<string, number> = {}
      for (const e of data) {
        const key = e.event_name
        counts[key] = (counts[key] || 0) + 1
      }
      return Object.entries(counts)
        .map(([key, count]) => {
          const [feature, action] = key.split(':')
          return { feature, action: action || '', count }
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
    },
  })

  // Pre-reg funnel
  const preregFunnelQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'prereg-funnel', range),
    queryFn: async (): Promise<FunnelStep[]> => {
      const { data } = await buildQuery('funnel_step').select('event_name').eq('event_name', 'prereg:modal_auto_opened').limit(5000)
      const { data: data2 } = await buildQuery('funnel_step').select('event_name').like('event_name', 'prereg:%').limit(5000)
      const allData = [...(data || []), ...(data2 || [])]

      const steps = ['modal_auto_opened', 'modal_cta_opened', 'step_1_complete', 'submit_attempt', 'modal_dismissed']
      const counts: Record<string, number> = {}
      for (const e of allData) {
        const step = e.event_name.replace('prereg:', '')
        counts[step] = (counts[step] || 0) + 1
      }
      return steps.map(step => ({
        step,
        count: counts[step] || 0,
      }))
    },
  })

  // Conversions
  const conversionsQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'conversions', range),
    queryFn: async (): Promise<ConversionStat[]> => {
      const { data } = await buildQuery('conversion').select('event_name').limit(2000)
      if (!data) return []
      const counts: Record<string, number> = {}
      for (const e of data) {
        counts[e.event_name] = (counts[e.event_name] || 0) + 1
      }
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    },
  })

  // Recent sessions (user journeys)
  const recentSessionsQuery = useQuery({
    queryKey: keys.sub('analytics-data', 'recent-sessions', range),
    queryFn: async (): Promise<SessionSummary[]> => {
      const { data } = await buildQuery('page_view')
        .select('session_id, user_id, page_path, created_at')
        .limit(2000)
      if (!data) return []

      const sessions: Record<string, { user_id: string | null; pages: string[]; started_at: string }> = {}
      for (const e of data) {
        if (!sessions[e.session_id]) {
          sessions[e.session_id] = { user_id: e.user_id, pages: [], started_at: e.created_at }
        }
        sessions[e.session_id].pages.push(e.page_path)
        if (e.created_at < sessions[e.session_id].started_at) {
          sessions[e.session_id].started_at = e.created_at
        }
      }

      return Object.entries(sessions)
        .map(([session_id, s]) => ({
          session_id,
          user_id: s.user_id,
          started_at: s.started_at,
          page_count: s.pages.length,
          pages: s.pages.reverse(), // chronological
        }))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, 50)
    },
  })

  return {
    range,
    setRange,
    totalEvents: totalEventsQuery.data,
    uniqueSessions: uniqueSessionsQuery.data,
    topPages: topPagesQuery.data,
    dailyPageViews: dailyPageViewsQuery.data,
    featureUsage: featureUsageQuery.data,
    preregFunnel: preregFunnelQuery.data,
    conversions: conversionsQuery.data,
    recentSessions: recentSessionsQuery.data,
    loading:
      totalEventsQuery.isPending ||
      uniqueSessionsQuery.isPending ||
      topPagesQuery.isPending ||
      dailyPageViewsQuery.isPending ||
      featureUsageQuery.isPending ||
      preregFunnelQuery.isPending ||
      conversionsQuery.isPending ||
      recentSessionsQuery.isPending,
  }
}
