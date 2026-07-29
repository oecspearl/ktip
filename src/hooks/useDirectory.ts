import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { DirectoryMember } from '../types'

// Badges always ride along for the member cards. The badge filter uses a
// second aliased embed with !inner so it restricts which profiles match
// without hiding the member's other badges from the display embed.
const BADGE_EMBED =
  'user_badges(id, user_id, badge_id, awarded_at, badge:badges(id, slug, name, description, icon, color))'
const BADGE_FILTER_EMBED = 'badge_filter:user_badges!inner(badge:badges!inner(slug))'

export function useDirectoryMembers(filters?: {
  search?: string
  role?: string
  country?: string
  skill?: string
  badge?: string
}) {
  const fetchMembers = async (): Promise<DirectoryMember[]> => {
    const select = filters?.badge
      ? `*, ${BADGE_EMBED}, ${BADGE_FILTER_EMBED}`
      : `*, ${BADGE_EMBED}`

    let query = supabase
      .from('profiles')
      .select(select)
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

    if (filters?.badge) {
      query = query.eq('badge_filter.badge.slug', filters.badge)
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
