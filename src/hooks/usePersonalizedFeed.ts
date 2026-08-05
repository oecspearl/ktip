import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import { usePersonalizationActive } from './usePersonalization'
import { grantImageFor, heroImageFor } from '../lib/hero-images'
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

/** `entity:id` -> the same photo that entity's own card shows. */
export type FeedImageMap = Record<string, string>

/**
 * Artwork for the feed, resolved the way each entity's own card resolves it.
 *
 * The feed RPC returns a normalized union that deliberately carries no image
 * column — content_index exists to rank things, not to render them. Rather
 * than widen it, this reads the handful of columns the card rules actually
 * need straight from the source tables, keyed by the ids already on screen.
 *
 * The rules are copied from the cards on purpose, so a recommendation and the
 * card it points at never disagree about what the thing looks like:
 *   project  -> image_url,      else heroImageFor(id)
 *   event    -> image_url,      else heroImageFor(id)
 *   resource -> thumbnail_url,  else heroImageFor(id)
 *   grant    -> grantImageFor(id, grant_type, is_climate_action); grants have
 *               no image column at all, but the climate flag overrides the
 *               type pool and the feed does not carry it, so it is read here
 */
export function useFeedImages(items: FeedItem[]) {
  // Sorted so a reordered feed with the same contents stays one cache entry
  const cacheKey = items
    .map((i) => `${i.entity}:${i.id}`)
    .sort()
    .join(',')

  const fetchImages = async (): Promise<FeedImageMap> => {
    const idsOf = (entity: RankableEntity) =>
      items.filter((i) => i.entity === entity).map((i) => i.id)

    /** One table, degraded to no rows so a failure just means fallback art. */
    const rows = async (table: string, columns: string, ids: string[]) => {
      if (!ids.length) return []
      const { data, error } = await (supabase as any).from(table).select(columns).in('id', ids)
      return error ? [] : ((data as Record<string, any>[]) || [])
    }

    const [projects, events, resources, grants] = await Promise.all([
      rows('projects', 'id, image_url', idsOf('project')),
      rows('events', 'id, image_url', idsOf('event')),
      rows('resources', 'id, thumbnail_url', idsOf('resource')),
      rows('grants', 'id, grant_type, is_climate_action', idsOf('grant')),
    ])

    const map: FeedImageMap = {}
    for (const row of projects) map[`project:${row.id}`] = row.image_url || heroImageFor(row.id)
    for (const row of events) map[`event:${row.id}`] = row.image_url || heroImageFor(row.id)
    for (const row of resources) {
      map[`resource:${row.id}`] = row.thumbnail_url || heroImageFor(row.id)
    }
    for (const row of grants) {
      map[`grant:${row.id}`] = grantImageFor(row.id, row.grant_type, row.is_climate_action)
    }
    return map
  }

  const query = useQuery({
    queryKey: keys.sub('personalization', 'feed-images', cacheKey),
    queryFn: fetchImages,
    enabled: items.length > 0,
    staleTime: 5 * 60_000,
  })

  return query.data ?? {}
}

/**
 * What to show before the real artwork lands, and if it never does.
 * Same seeded pick the cards use, so the swap is usually invisible.
 */
export function fallbackFeedImage(item: FeedItem): string {
  return item.entity === 'grant'
    ? grantImageFor(item.id, item.type_key, false)
    : heroImageFor(item.id)
}
