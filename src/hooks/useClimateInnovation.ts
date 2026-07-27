import { createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { Project, Event, Grant } from '../types'

interface ClimateHighlights {
  projects: Project[]
  events: Event[]
  grants: Grant[]
  totalCount: number
}

export function useClimateHighlights() {
  const fetchHighlights = async (): Promise<ClimateHighlights> => {
    // Gracefully handle missing is_climate_action columns (migration not yet applied)
    const [projectsRes, eventsRes, grantsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*, owner:profiles(*)')
        .eq('is_climate_action', true)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(3)
        .then((r) => r, () => ({ data: null, error: true })),
      supabase
        .from('events')
        .select('*, organizer:profiles(*)')
        .eq('is_climate_action', true)
        .neq('status', 'draft' as any)
        .order('start_date', { ascending: true })
        .limit(3)
        .then((r) => r, () => ({ data: null, error: true })),
      supabase
        .from('grants')
        .select('*')
        .eq('is_climate_action', true)
        .eq('is_active', true)
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(3)
        .then((r) => r, () => ({ data: null, error: true })),
    ])

    // Return empty arrays if column doesn't exist yet (400 error)
    const projects = projectsRes.error ? [] : (projectsRes.data as any[]) || []
    const events = eventsRes.error ? [] : (eventsRes.data as any[]) || []
    const grants = grantsRes.error ? [] : (grantsRes.data as any[]) || []

    return {
      projects,
      events,
      grants,
      totalCount: projects.length + events.length + grants.length,
    }
  }

  const [highlights, { refetch }] = createResource(fetchHighlights)

  return { highlights, refetch }
}
