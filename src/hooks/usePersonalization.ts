import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { keys } from '../queries/keys'
import type { UserPersonalization } from '../types'

export type PersonalizationSettings = Omit<
  UserPersonalization,
  'user_id' | 'created_at' | 'updated_at'
>

/**
 * Mirrors the column defaults in migration 055. A member who has never
 * opened the tab is personalized-on with no explicit picks, which makes
 * the score collapse to recency + urgency — i.e. today's ordering.
 */
export const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
  enabled: true,
  use_profile_signals: true,
  use_behavior_signals: true,
  use_badge_signals: true,
  climate_focus: false,
  topics: [],
  categories: [],
  content_types: [],
}

/** Settings › Personalization. Returns defaults when the user has no row yet. */
export function useMyPersonalization(userId: string | undefined) {
  const fetchPersonalization = async (uid: string): Promise<PersonalizationSettings> => {
    const { data, error } = await (supabase as any)
      .from('user_personalization')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()

    // The tab has to keep working before 055 is applied, and a member with
    // no row is the normal case — neither should surface as an error.
    if (error) return { ...DEFAULT_PERSONALIZATION }
    if (!data) return { ...DEFAULT_PERSONALIZATION }

    return {
      enabled: data.enabled ?? true,
      use_profile_signals: data.use_profile_signals ?? true,
      use_behavior_signals: data.use_behavior_signals ?? true,
      use_badge_signals: data.use_badge_signals ?? true,
      climate_focus: data.climate_focus ?? false,
      topics: data.topics ?? [],
      categories: data.categories ?? [],
      content_types: data.content_types ?? [],
    }
  }

  const query = useQuery({
    queryKey: keys.detail('personalization', userId),
    queryFn: () => fetchPersonalization(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  })

  return {
    personalization: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Whether the "For You" sort should be offered and applied at all.
 *
 * Every list hook consults this before calling the ranker, so signed-out
 * visitors and members who switched personalization off take the exact
 * code path they took before this feature existed.
 */
export function usePersonalizationActive() {
  const auth = useAuth()
  const { personalization, loading } = useMyPersonalization(auth.user?.id)

  return {
    active: !!auth.user && !loading && personalization?.enabled !== false,
    uid: auth.user?.id,
    personalization,
    loading,
  }
}

/**
 * Invalidated alongside every content domain: changing your topics has to
 * re-run the list queries, or the new ordering only appears after a hard
 * reload.
 */
const CONTENT_DOMAINS = ['projects', 'resources', 'events', 'grants'] as const

export function useSavePersonalization() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { userId: string; updates: Partial<PersonalizationSettings> }) => {
      const { data, error } = await (supabase as any)
        .from('user_personalization')
        .upsert({ user_id: params.userId, ...params.updates })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('personalization') })
      for (const domain of CONTENT_DOMAINS) {
        queryClient.invalidateQueries({ queryKey: keys.all(domain) })
      }
    },
  })

  const savePersonalization = (userId: string, updates: Partial<PersonalizationSettings>) =>
    mutation.mutateAsync({ userId, updates })

  return { savePersonalization, loading: mutation.isPending, error: mutation.error }
}

/** Deletes the row so the column defaults in 055 take over again. */
export function useResetPersonalization() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any)
        .from('user_personalization')
        .delete()
        .eq('user_id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('personalization') })
      for (const domain of CONTENT_DOMAINS) {
        queryClient.invalidateQueries({ queryKey: keys.all(domain) })
      }
    },
  })

  return {
    resetPersonalization: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}
