import { createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { Profile, Project, Event } from '../types'

export function useProfile(id: () => string | undefined) {
  const fetchProfile = async (profileId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()
    if (error) throw error
    return data as Profile
  }

  const [profile, { refetch }] = createResource(id, fetchProfile)
  return { profile, refetch }
}

export function useUserProjects(userId: () => string | undefined) {
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

  const [projects, { refetch }] = createResource(userId, fetchProjects)
  return { projects, refetch }
}

export function useUserEvents(userId: () => string | undefined) {
  const fetchEvents = async (uid: string): Promise<Event[]> => {
    const { data, error } = await supabase
      .from('events')
      .select('*, organizer:profiles(*)')
      .eq('organizer_id', uid)
      .order('start_date', { ascending: false })
    if (error) throw error
    return (data as any[]) || []
  }

  const [events, { refetch }] = createResource(userId, fetchEvents)
  return { events, refetch }
}
