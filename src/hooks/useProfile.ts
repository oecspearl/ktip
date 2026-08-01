import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { isUuid } from '../lib/slug'
import type { Profile, Project, Event, ProfileView } from '../types'

/**
 * A /u/<segment> route param resolved to both spellings of the same person.
 *
 * get_profile_view() and public_resume() take a uuid, so a username has to be
 * traded for one before either can run. The username comes back too, so a page
 * that was opened on a uuid can rewrite its own URL — the lookup is one indexed
 * row either way and react-query caches it per segment.
 */
export function useProfileId(param: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('profiles', 'by-segment', param),
    queryFn: async (): Promise<{ id: string; username: string | null } | null> => {
      const base = supabase.from('profiles').select('id, username')
      const { data, error } = await (isUuid(param)
        ? base.eq('id', param as string)
        : // ilike with no wildcards is case-insensitive equality, matching the
          // lower(username) unique index.
          base.ilike('username', param as string)
      ).maybeSingle()
      if (error) throw error
      return (data as { id: string; username: string | null } | null) ?? null
    },
    enabled: !!param,
  })

  return {
    id: query.data?.id,
    username: query.data?.username ?? null,
    // A disabled query stays isPending forever, hence the gate.
    loading: !!param && query.isPending,
    notFound: !!param && !query.isPending && !query.data,
  }
}

/** Accepts either a uuid or a username — see src/lib/slug.ts. */
export function useProfile(id: string | undefined) {
  const fetchProfile = async (profileId: string): Promise<Profile | null> => {
    const query = supabase.from('profiles').select('*')
    const { data, error } = await (isUuid(profileId)
      ? query.eq('id', profileId)
      : // ilike with no wildcards is case-insensitive equality, which matches
        // the lower(username) unique index.
        query.ilike('username', profileId)
    ).single()
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
