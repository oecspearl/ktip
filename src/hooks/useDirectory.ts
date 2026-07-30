import { keepPreviousData, useQuery } from '@tanstack/react-query'
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

// The directory is open to signed-out visitors, so it asks for the card, not
// the row. `select('*')` handed anonymous clients every column a profile has —
// phone, website, suspension_reason — for a grid that renders six of them.
// bio is here only because the search filter matches on it.
// Unlike `*`, a named list breaks if the deploy runs ahead of the migration:
// apply 083 before shipping this.
const MEMBER_COLUMNS =
  'id, display_name, avatar_url, bio, country, organization, industry, roles, skills, is_verified, created_at, profile_visibility'

export function useDirectoryMembers(filters?: {
  search?: string
  role?: string
  country?: string
  skill?: string
  badge?: string
  /** Row cap; the page raises it for "load more". The query was unbounded before. */
  limit?: number
}) {
  const fetchMembers = async (): Promise<DirectoryMember[]> => {
    const select = filters?.badge
      ? `${MEMBER_COLUMNS}, ${BADGE_EMBED}, ${BADGE_FILTER_EMBED}`
      : `${MEMBER_COLUMNS}, ${BADGE_EMBED}`

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

    if (filters?.limit) {
      query = query.range(0, filters.limit - 1)
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('directory_members', filters),
    queryFn: fetchMembers,
    // Raising the limit or retyping a search keeps the current grid on screen
    // instead of dropping back to skeletons.
    placeholderData: keepPreviousData,
  })

  return { members: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
