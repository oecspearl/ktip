import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

export interface RecentProject {
  id: string
  slug: string | null
  title: string
  image_url: string | null
  category: string | null
  created_at: string
}

/**
 * The newest public projects, for sidebars.
 *
 * The project page's "Recent Projects" widget used useProjects(), which is
 * the full browse query: 50 rows, each with its owner's profile embedded, then
 * a ranking RPC, to show three thumbnails. On a direct link that whole list
 * was fetched for the sidebar alone.
 */
export function useRecentProjects(limit = 3) {
  const query = useQuery({
    queryKey: keys.sub('projects', 'recent', limit),
    queryFn: async (): Promise<RecentProject[]> => {
      const { data, error } = await (supabase as any)
        .from('projects')
        .select('id, slug, title, image_url, category, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data as RecentProject[]) || []
    },
  })

  return { projects: query.data, loading: query.isPending }
}
