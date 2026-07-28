import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { buildTimelineItems } from '../lib/timeline'

/**
 * Everything the signed-in user has in motion: their grant applications
 * (with status history) and their own projects (with phase history),
 * shaped into TimelineItems for the dashboard chart. Includes private
 * projects and draft applications — RLS scopes both to the owner.
 */
export function useMyTimeline(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('dashboard', 'timeline', userId),
    enabled: !!userId,
    queryFn: async () => {
      const [apps, projects] = await Promise.all([
        (supabase as any)
          .from('grant_applications')
          .select('*, grant:grants(id,title), events:grant_application_events(*)')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('projects')
          .select('*, events:project_phase_events(*)')
          .eq('owner_id', userId!)
          .order('created_at', { ascending: false }),
      ])

      if (apps.error) throw apps.error
      if (projects.error) throw projects.error

      return buildTimelineItems(apps.data ?? [], projects.data ?? [])
    },
  })

  return {
    items: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
