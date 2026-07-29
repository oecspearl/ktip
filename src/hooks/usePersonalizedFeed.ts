import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import { usePersonalizationActive } from './usePersonalization'
import type { MatchReason } from '../types'
import type { RankableEntity } from '../lib/personalization'

export interface FeedItem {
  entity: RankableEntity
  id: string
  title: string
  summary: string | null
  category: string | null
  type_key: string | null
  tags: string[]
  occurs_at: string | null
  deadline_at: string | null
  score: number
  reasons: MatchReason[]
}

const DEFAULT_ENTITIES: RankableEntity[] = ['project', 'resource', 'event', 'grant']

/**
 * The cross-entity "For You" rail.
 *
 * Unlike the list pages this has no filters to respect, so it calls the
 * dedicated feed RPC and gets a normalized union back in one round trip. The
 * RPC also drops past events and expired grants, which is right for a "what
 * next" surface and wrong for a browse page — hence two entry points.
 *
 * Returns an empty list rather than an error when the migration is missing or
 * personalization is off, so the rail simply does not render.
 */
export function usePersonalizedFeed(options?: {
  limit?: number
  entities?: RankableEntity[]
}) {
  const auth = useAuth()
  const { active } = usePersonalizationActive()
  const limit = options?.limit ?? 12
  const entities = options?.entities ?? DEFAULT_ENTITIES

  const fetchFeed = async (): Promise<FeedItem[]> => {
    const { data, error } = await (supabase as any).rpc('get_personalized_feed', {
      p_limit: limit,
      p_entities: entities,
    })
    if (error) return []
    return ((data as any[]) || []).map((row) => ({
      ...row,
      tags: row.tags ?? [],
      reasons: row.reasons ?? [],
    }))
  }

  const query = useQuery({
    queryKey: keys.sub('personalization', 'feed', `${auth.user?.id}:${limit}:${entities.join(',')}`),
    queryFn: fetchFeed,
    enabled: active,
    staleTime: 60_000,
  })

  return {
    items: query.data ?? [],
    loading: query.isPending && active,
    error: query.error,
    refetch: query.refetch,
  }
}
