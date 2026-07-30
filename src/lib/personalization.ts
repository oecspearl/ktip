import { supabase } from './supabase'
import { ROUTES } from './constants'
import type { MatchReason, Ranked } from '../types'

export type { MatchReason, Ranked }

export type ContentSort = 'for_you' | 'newest' | 'deadline' | 'upcoming' | 'popular'

export type RankableEntity = 'project' | 'resource' | 'event' | 'grant'

/** One row of the `rank_content` RPC. */
export interface RankRow {
  id: string
  score: number
  reasons: MatchReason[] | null
}

/**
 * The sorts each list page offers. "For You" is listed first because it is
 * the default for a signed-in member with personalization on; the fallback
 * is the ordering that page already used server-side.
 */
export const SORT_OPTIONS: Record<
  RankableEntity,
  { options: { value: ContentSort; label: string }[]; fallback: ContentSort }
> = {
  project: {
    options: [
      { value: 'for_you', label: 'Top Picks' },
      { value: 'newest', label: 'Newest' },
    ],
    fallback: 'newest',
  },
  resource: {
    options: [
      { value: 'for_you', label: 'For You' },
      { value: 'newest', label: 'Newest' },
    ],
    fallback: 'newest',
  },
  event: {
    options: [
      { value: 'for_you', label: 'For You' },
      { value: 'upcoming', label: 'Soonest' },
    ],
    fallback: 'upcoming',
  },
  grant: {
    options: [
      { value: 'for_you', label: 'For You' },
      { value: 'deadline', label: 'Deadline' },
    ],
    fallback: 'deadline',
  },
}

/**
 * Which sort a page should actually use.
 *
 * An explicit `?sort=` always wins, so a shared link keeps its ordering.
 * With no param, "For You" is the default — but only when the ranker can
 * do anything, which means signed in with personalization enabled. Signed
 * out or switched off takes the fallback, i.e. the exact code path the page
 * had before personalization existed.
 */
export function resolveSort(
  requested: string | null | undefined,
  active: boolean,
  fallback: ContentSort
): ContentSort {
  if (requested === 'for_you') return active ? 'for_you' : fallback
  if (
    requested === 'newest' ||
    requested === 'deadline' ||
    requested === 'upcoming' ||
    requested === 'popular'
  ) {
    return requested
  }
  // Absent or unrecognised.
  return active ? 'for_you' : fallback
}

/**
 * Attach scores and re-sort.
 *
 * Two properties the list pages depend on:
 *   * Rows the ranker did not score keep their incoming relative order and
 *     go last. Nothing is ever dropped — the whole feature is a re-ordering.
 *   * Ties fall back to the incoming order, which is the server sort. That
 *     makes "For You" degrade to Newest/Deadline for anything the ranker has
 *     nothing to say about, and keeps the order stable across refetches
 *     instead of flickering.
 */
export function mergeScores<T extends { id: string }>(
  rows: T[],
  scores: RankRow[] | null | undefined
): (T & Ranked)[] {
  if (!rows.length || !scores?.length) return rows as (T & Ranked)[]

  const byId = new Map<string, RankRow>()
  for (const score of scores) {
    if (score?.id) byId.set(score.id, score)
  }

  const decorated = rows.map((row, index) => {
    const hit = byId.get(row.id)
    return {
      row: hit
        ? { ...row, match_score: hit.score, match_reasons: hit.reasons ?? [] }
        : (row as T & Ranked),
      index,
      scored: !!hit,
      score: hit ? hit.score : 0,
    }
  })

  decorated.sort((a, b) => {
    if (a.scored !== b.scored) return a.scored ? -1 : 1
    if (a.scored && b.scored && a.score !== b.score) return b.score - a.score
    return a.index - b.index
  })

  return decorated.map((d) => d.row)
}

/** The RPC caps the ids it will score; slice before sending, not after. */
const MAX_RANKED_IDS = 300

/**
 * Score an already-fetched, already-filtered page of rows.
 *
 * This is the second half of a two-stage retrieval: the list hook's existing
 * PostgREST chain generates candidates, and this ranks them. Filters never
 * move into SQL, so there is only ever one implementation of "what is on
 * this page".
 *
 * Every failure path returns the rows untouched — a missing migration, a
 * disabled preference, an RPC error and a signed-out caller all look the
 * same to the page: the server's ordering stands.
 */
export async function rankRows<T extends { id: string }>(
  entity: RankableEntity,
  rows: T[]
): Promise<(T & Ranked)[]> {
  if (!rows.length) return rows as (T & Ranked)[]

  const ids = rows.slice(0, MAX_RANKED_IDS).map((r) => r.id)

  try {
    const { data, error } = await (supabase as any).rpc('rank_content', {
      p_entity: entity,
      p_ids: ids,
    })
    if (error || !data?.length) return rows as (T & Ranked)[]
    return mergeScores(rows, data as RankRow[])
  } catch {
    return rows as (T & Ranked)[]
  }
}

const ENTITY_ROUTES: Record<RankableEntity, string> = {
  project: ROUTES.PROJECTS,
  resource: ROUTES.RESOURCES,
  event: ROUTES.EVENTS,
  grant: ROUTES.GRANTS,
}

/** Detail link for a feed item, which only carries an entity and an id. */
export function personalizedHref(entity: RankableEntity, id: string): string {
  return `${ENTITY_ROUTES[entity]}/${id}`
}

/**
 * Whether the ranker has anything to work with. Drives the "tell us what you
 * are interested in" prompt: with no signals at all the feed is just recency,
 * and saying so beats showing an unexplained list.
 */
export function hasSignals(
  personalization: { topics?: string[]; categories?: string[]; content_types?: string[] } | null | undefined,
  profile: { interests?: string[] | null; skills?: string[] | null; industry?: string | null } | null | undefined
): boolean {
  const nonEmpty = (v: string[] | null | undefined) => !!v && v.length > 0
  return (
    nonEmpty(personalization?.topics) ||
    nonEmpty(personalization?.categories) ||
    nonEmpty(personalization?.content_types) ||
    nonEmpty(profile?.interests) ||
    nonEmpty(profile?.skills) ||
    !!profile?.industry
  )
}
