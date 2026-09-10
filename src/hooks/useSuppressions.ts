import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { RankableEntity } from '../lib/personalization'

/**
 * "Not interested" (migration 153).
 *
 * A suppression is the one thing that HIDES rather than demotes: the member
 * said so explicitly. Both ranker entry points filter suppressed ids before
 * scoring, so a save has to invalidate every content domain the same way a
 * personalization save does — otherwise the card comes back on the next tab.
 */
const CONTENT_DOMAINS = ['projects', 'resources', 'events', 'grants'] as const

export interface Suppression {
  entity: RankableEntity
  content_id: string
  created_at: string
  /** Resolved from the entity's own table; null when it has since been removed. */
  title: string | null
}

const TITLE_TABLE: Record<RankableEntity, string> = {
  project: 'projects',
  resource: 'resources',
  event: 'events',
  grant: 'grants',
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: keys.all('personalization') })
  queryClient.invalidateQueries({ queryKey: keys.all('suppressions') })
  for (const domain of CONTENT_DOMAINS) {
    queryClient.invalidateQueries({ queryKey: keys.all(domain) })
  }
}

/** The member's hidden items, with titles, newest first. */
export function useMySuppressions(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.list('suppressions', userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Suppression[]> => {
      const { data, error } = await (supabase as any)
        .from('content_suppressions')
        .select('entity, content_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error || !data) return []

      const rows = data as Omit<Suppression, 'title'>[]
      const titles = new Map<string, string>()
      await Promise.all(
        (Object.keys(TITLE_TABLE) as RankableEntity[]).map(async (entity) => {
          const ids = rows.filter((r) => r.entity === entity).map((r) => r.content_id)
          if (!ids.length) return
          const { data: found } = await (supabase as any)
            .from(TITLE_TABLE[entity])
            .select('id, title')
            .in('id', ids)
          for (const row of (found as { id: string; title: string }[]) || []) {
            titles.set(`${entity}:${row.id}`, row.title)
          }
        })
      )

      return rows.map((r) => ({ ...r, title: titles.get(`${r.entity}:${r.content_id}`) ?? null }))
    },
  })

  return { suppressions: query.data ?? [], loading: query.isPending && !!userId }
}

/** Hide one item from every ranked surface. */
export function useSuppressContent() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (params: { userId: string; entity: RankableEntity; id: string }) => {
      const { error } = await (supabase as any)
        .from('content_suppressions')
        .upsert(
          { user_id: params.userId, entity: params.entity, content_id: params.id },
          { onConflict: 'user_id,entity,content_id' }
        )
      if (error) throw error
    },
    onSuccess: () => invalidate(queryClient),
  })
  return {
    suppress: (userId: string, entity: RankableEntity, id: string) =>
      mutation.mutateAsync({ userId, entity, id }),
    loading: mutation.isPending,
  }
}

/** Bring a hidden item back. */
export function useUnsuppressContent() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (params: { userId: string; entity: RankableEntity; id: string }) => {
      const { error } = await (supabase as any)
        .from('content_suppressions')
        .delete()
        .eq('user_id', params.userId)
        .eq('entity', params.entity)
        .eq('content_id', params.id)
      if (error) throw error
    },
    onSuccess: () => invalidate(queryClient),
  })
  return {
    unsuppress: (userId: string, entity: RankableEntity, id: string) =>
      mutation.mutateAsync({ userId, entity, id }),
    loading: mutation.isPending,
  }
}
