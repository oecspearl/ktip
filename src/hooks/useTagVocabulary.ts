import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

export type TaggableEntity = 'resources' | 'integrations' | 'events' | 'projects'

/**
 * Where each entity keeps its tags, and what counts as publicly visible.
 *
 * This map is the single place the projects `hashtags` naming lives — every
 * other tag-aware component talks in terms of a `TaggableEntity`.
 */
const TAG_SOURCES: Record<
  TaggableEntity,
  { table: string; column: string; visible: (q: any) => any }
> = {
  resources: { table: 'resources', column: 'tags', visible: (q) => q.eq('is_published', true) },
  integrations: { table: 'integrations', column: 'tags', visible: (q) => q.eq('is_published', true) },
  events: { table: 'events', column: 'tags', visible: (q) => q.neq('status', 'draft') },
  projects: { table: 'projects', column: 'hashtags', visible: (q) => q.eq('is_public', true) },
}

/** Chips beyond this are noise; the vocabulary is uncurated and long-tailed. */
const MAX_TAGS = 40

/**
 * The tag options offered by a list page's filter.
 *
 * Deliberately its own query rather than a reduction over the rows already on
 * screen: those are filtered (and events/projects are capped at 50), so picking
 * one tag would make every other chip disappear. Because the options come from
 * stored values they are byte-identical to what `.overlaps()` matches on, which
 * also sidesteps the case-sensitivity of the `ov` operator.
 */
export function useTagVocabulary(entity: TaggableEntity) {
  const source = TAG_SOURCES[entity]

  const fetchTags = async (): Promise<string[]> => {
    let query = (supabase as any).from(source.table).select(source.column)
    query = source.visible(query)

    const { data, error } = await query
    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of (data as any[]) || []) {
      for (const tag of (row?.[source.column] as string[]) || []) {
        if (!tag) continue
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_TAGS)
      .map(([tag]) => tag)
  }

  const query = useQuery({
    queryKey: keys.sub(entity, 'tag-vocabulary'),
    queryFn: fetchTags,
    staleTime: 5 * 60_000,
  })

  return { tags: query.data ?? [], loading: query.isPending, error: query.error }
}
