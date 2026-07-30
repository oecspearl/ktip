import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

export interface PlatformStats {
  memberCount: number
  projectCount: number
  grantCount: number
  eventCount: number
}

export function usePlatformStats() {
  const query = useQuery({
    queryKey: keys.list('platform-stats'),
    queryFn: async (): Promise<PlatformStats> => {
      const [members, projects, grants, events] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('grants').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('events').select('*', { count: 'exact', head: true }),
      ])

      return {
        memberCount: members.count || 0,
        projectCount: projects.count || 0,
        grantCount: grants.count || 0,
        eventCount: events.count || 0,
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  return { stats: query.data, loading: query.isPending, error: query.error }
}
