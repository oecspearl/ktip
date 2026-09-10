import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import type { MatchReason, RoleSlug } from '../types'

export interface MemberSuggestion {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
  organization: string | null
  industry: string | null
  roles: RoleSlug[]
  is_verified: boolean
  score: number
  reasons: MatchReason[]
}

/**
 * "Members like you" (migration 156). Empty when signed out, when the RPC is
 * missing, or when nobody shares anything with the caller — an empty rail is
 * a normal outcome on a small network and the host hides itself.
 */
export function useMemberSuggestions(options?: { limit?: number; role?: RoleSlug }) {
  const auth = useAuth()
  const limit = options?.limit ?? 6
  const role = options?.role ?? null

  const query = useQuery({
    queryKey: keys.sub('directory_members', 'suggestions', `${auth.user?.id}:${limit}:${role ?? ''}`),
    enabled: !!auth.user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MemberSuggestion[]> => {
      const { data, error } = await (supabase as any).rpc('suggest_members', {
        p_limit: limit,
        p_role: role,
      })
      if (error) return []
      return ((data as any[]) || []).map((row) => ({
        ...row,
        roles: row.roles ?? [],
        reasons: row.reasons ?? [],
      }))
    },
  })

  return { suggestions: query.data ?? [], loading: query.isPending && !!auth.user }
}
