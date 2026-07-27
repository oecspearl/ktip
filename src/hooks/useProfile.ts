import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Profile, Project, Event } from '../types'

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
