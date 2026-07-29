import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { BadgeDefinition, UserBadge } from '../types'

/** Badges earned by a user (awards are trigger-driven; read-only client-side). */
export function useUserBadges(userId: string | undefined) {
  const fetchBadges = async (uid: string): Promise<UserBadge[]> => {
    const { data, error } = await (supabase as any)
      .from('user_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', uid)
      .order('awarded_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('badges', 'user', userId),
    queryFn: () => fetchBadges(userId as string),
    enabled: !!userId,
  })

  return { badges: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * All badge definitions, including hidden ones.
 *
 * Hidden badges are returned so the gallery can count them ("3 secret
 * achievements") — masking their name and description is the client's job.
 * They are public rows anyway; a determined visitor can read the table.
 *
 * Ordered by sort_order (added in 066) so tier ladders read bronze to diamond
 * rather than alphabetically.
 */
export function useAllBadges() {
  const fetchAll = async (): Promise<BadgeDefinition[]> => {
    const { data, error } = await (supabase as any)
      .from('badges')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('badges'),
    queryFn: fetchAll,
  })

  return { badges: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
