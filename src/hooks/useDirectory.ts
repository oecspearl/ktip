import { createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Profile } from '../types'

export function useDirectoryMembers(filters?: {
  search?: string
  role?: string
  country?: string
  skill?: string
}) {
  const filterKey = () => JSON.stringify({
    search: filters?.search,
    role: filters?.role,
    country: filters?.country,
    skill: filters?.skill,
  })

  const fetchMembers = async (_key: string): Promise<Profile[]> => {
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

  const [members, { refetch }] = createResource(filterKey, fetchMembers)

  return { members, refetch }
}
