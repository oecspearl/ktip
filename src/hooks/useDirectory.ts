import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { DirectoryMember, UserBadge } from '../types'

// The cards' badges, fetched by member id after the page of members. RLS on
// user_badges (167) leaves out the rows of anyone whose achievements section
// this viewer may not see, so a closed shelf arrives empty.
const BADGE_COLUMNS =
  'id, user_id, badge_id, awarded_at, badge:badges(id, slug, name, description, icon, color)'

// The directory is open to signed-out visitors, so it asks for the card, not
// the row — and asks member_profiles (167), not profiles. The view hands back
// each section field only where this viewer may see it, so the filters below
// match what the viewer could read on the member's page and nothing more: a
// connection finds a member by a skill kept for connections, a stranger does
// not. Since 168 the table itself answers none of these columns.
// Apply 167 before shipping this.
const MEMBER_COLUMNS =
  'id, username, display_name, avatar_url, banner, country, organization, roles, skills, is_verified, created_at, profile_visibility, section_visibility'

export function useDirectoryMembers(filters?: {
  search?: string
  role?: string
  country?: string
  skill?: string
  badge?: string
  /** A COLLABORATION_OPTIONS value — what the member says they are open to. */
  openTo?: string
  /** Row cap; the page raises it for "load more". The query was unbounded before. */
  limit?: number
}) {
  const fetchMembers = async (): Promise<DirectoryMember[]> => {
    let query = (supabase as any)
      .from('member_profiles')
      .select(MEMBER_COLUMNS)
      // Migration 140: a deactivated member is hidden from the surfaces that
      // list PEOPLE. Their contributions keep their author — this is the
      // directory, not authorship — and NULL covers a deploy that has run ahead
      // of the migration.
      .or('account_status.eq.active,account_status.is.null')
      .order('display_name', { ascending: true })

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        // bio is NULL in the view wherever this viewer may not read it.
        query = query.or(`display_name.ilike.%${sanitized}%,bio.ilike.%${sanitized}%`)
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
      // NULL when the member's achievements are closed to this viewer.
      query = query.contains('badge_slugs', [filters.badge])
    }

    if (filters?.openTo) {
      query = query.contains('open_to', [filters.openTo])
    }

    if (filters?.limit) {
      query = query.range(0, filters.limit - 1)
    }

    const { data, error } = await query

    if (error) throw error
    const members = (data as DirectoryMember[]) || []
    if (members.length === 0) return members

    const { data: badges, error: badgeError } = await (supabase as any)
      .from('user_badges')
      .select(BADGE_COLUMNS)
      .in(
        'user_id',
        members.map((m) => m.id)
      )
    // The cards still render without badges; a failed shelf is not a failed page.
    if (badgeError) return members

    const byMember = new Map<string, UserBadge[]>()
    for (const badge of (badges as UserBadge[]) || []) {
      const list = byMember.get(badge.user_id) ?? []
      list.push(badge)
      byMember.set(badge.user_id, list)
    }
    return members.map((m) => ({ ...m, user_badges: byMember.get(m.id) ?? [] }))
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
