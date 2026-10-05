import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import { usePersonalizationActive } from './usePersonalization'
import { grantImageFor, heroImageFor } from '../lib/hero-images'
import { callOptionalRpc, isRpcAbsent } from '../lib/optional-rpc'
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
  /** Present only from get_personalized_feed_v2 (163). Its presence is what
   *  tells useFeedImages it has nothing left to fetch. */
  image_url?: string | null
}

const FEED_V2 = 'get_personalized_feed_v2'

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
 *
 * With 163 applied this is one request, issued as soon as the member is
 * known: v2 returns no rows for someone who switched personalization off, so
 * there is no need to read their settings first, and it carries the image
 * columns, so useFeedImages has nothing to look up. Without 163 it is the old
 * three-step path.
 */
export function usePersonalizedFeed(options?: {
  limit?: number
  entities?: RankableEntity[]
}) {
  const auth = useAuth()
  const { active } = usePersonalizationActive()
  const limit = options?.limit ?? 12
  const entities = options?.entities ?? DEFAULT_ENTITIES

  const normalize = (data: unknown): FeedItem[] =>
    ((data as any[]) || []).map((row) => ({
      ...row,
      tags: row.tags ?? [],
      reasons: row.reasons ?? [],
    }))

  const fetchFeed = async (): Promise<FeedItem[]> => {
    try {
      const v2 = await callOptionalRpc<unknown[]>(FEED_V2, { p_limit: limit, p_entities: entities })
      if (v2 !== undefined) return normalize(v2)
    } catch {
      return []
    }
    // 163 not applied. v1 does not decide on its own whether the member wants
    // a feed at all, so the old path stays gated on their settings.
    if (!active) return []
    const { data, error } = await (supabase as any).rpc('get_personalized_feed', {
      p_limit: limit,
      p_entities: entities,
    })
    if (error) return []
    return normalize(data)
  }

  // Once v2 is known to be missing, the query has to wait for the settings
  // row again, and `active` joins the key so the answer it gave before the
  // settings arrived is not kept for the session.
  const legacy = isRpcAbsent(FEED_V2)

  const query = useQuery({
    queryKey: keys.sub(
      'personalization',
      'feed',
      `${auth.user?.id}:${limit}:${entities.join(',')}${legacy ? `:legacy:${active}` : ''}`
    ),
    queryFn: fetchFeed,
    enabled: legacy ? active : !!auth.user,
    staleTime: 60_000,
  })

  const enabled = legacy ? active : !!auth.user
  return {
    items: query.data ?? [],
    loading: query.isPending && enabled,
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
  // v2 rows already carry what the card rules need; resolve them in place.
  const resolved = items.length > 0 && items.every((i) => i.image_url !== undefined)

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
    enabled: items.length > 0 && !resolved,
    staleTime: 5 * 60_000,
  })

  if (resolved) return imagesFromRows(items)
  return query.data ?? {}
}

/** The same card rules as fetchImages, applied to v2 rows. */
function imagesFromRows(items: FeedItem[]): FeedImageMap {
  const map: FeedImageMap = {}
  for (const item of items) {
    map[`${item.entity}:${item.id}`] =
      item.entity === 'grant'
        ? grantImageFor(item.id, item.type_key)
        : item.image_url || heroImageFor(item.id)
  }
  return map
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
