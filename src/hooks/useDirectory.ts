import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { Profile } from '../types'

export function useDirectoryMembers(filters?: {
  search?: string
  role?: string
  country?: string
  skill?: string
}) {
  const fetchMembers = async (): Promise<Profile[]> => {
    let query = supabase
      .from('profiles')
      .select('*')
      .order('display_name', { ascending: true })

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `display_name.ilike.%${sanitized}%,bio.ilike.%${sanitized}%`
        )
      }
    }

    if (filters?.role) {
      query = query.contains('roles', [filters.role])
    }

    if (filters?.country) {
      query = query.eq('country', filters.country)
    }

    if (filters?.skill) {
      query = query.contains('skills', [filters.skill])
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('directory_members', filters),
    queryFn: fetchMembers,
  })

  return { members: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
