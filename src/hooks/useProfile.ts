import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Profile, Project, Event, ProfileView } from '../types'

export function useProfile(id: string | undefined) {
  const fetchProfile = async (profileId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()
    if (error) throw error
    return data as Profile
  }

  const query = useQuery({
    queryKey: keys.detail('profiles', id),
    queryFn: () => fetchProfile(id as string),
    enabled: !!id,
  })

  return { profile: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * The read path for someone else's member page (083).
 *
 * `useProfile` reads the row straight off the table, which is right for your
 * own profile and wrong for anyone else's: the table is readable by everyone
 * because profile rows are embedded across the schema, so the privacy setting
 * has to be applied by a function. get_profile_view() returns the teaser
 * either way and NULLs the detail when the viewer has not been granted it,
 * so the page renders one shape and branches on `canView`.
 */
export function useProfileView(id: string | undefined, enabled = true) {
  const fetchView = async (profileId: string): Promise<ProfileView | null> => {
    const { data, error } = await (supabase as any).rpc('get_profile_view', {
      p_user_id: profileId,
    })
    if (error) throw error
    const rows = (data as ProfileView[]) || []
    return rows[0] ?? null
  }

  const query = useQuery({
    queryKey: keys.sub('profiles', 'view', id),
    queryFn: () => fetchView(id as string),
    enabled: !!id && enabled,
  })

  const view = query.data ?? undefined

  return {
    view,
    // Undefined while loading — distinct from a definite `false`, so the UI
    // does not flash the private panel before the answer arrives.
    canView: view?.can_view,
    isPrivate: view?.profile_visibility === 'private',
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useUserProjects(userId: string | undefined) {
  const fetchProjects = async (uid: string): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*, owner:profiles(*)')
      .eq('owner_id', uid)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('profiles', 'projects', userId),
    queryFn: () => fetchProjects(userId as string),
    enabled: !!userId,
  })

  return { projects: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useUserEvents(userId: string | undefined) {
  const fetchEvents = async (uid: string): Promise<Event[]> => {
    const { data, error } = await supabase
      .from('events')
      .select('*, organizer:profiles(*)')
      .eq('organizer_id', uid)
      .order('start_date', { ascending: false })
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('profiles', 'events', userId),
    queryFn: () => fetchEvents(userId as string),
    enabled: !!userId,
  })

  return { events: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
