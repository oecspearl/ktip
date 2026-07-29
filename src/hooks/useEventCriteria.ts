import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { EVENT_CRITERION_KINDS } from '../lib/constants'
import type { EventCriterion, EventCriterionKind } from '../types'

/** The brief for one event, in brief order (kind, then sort_order). */
export function useEventCriteria(eventId: string | undefined) {
  const fetchCriteria = async (id: string): Promise<EventCriterion[]> => {
    const { data, error } = await supabase
      .from('event_criteria')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })

    if (error) throw error

    // Kind order is editorial (objectives → constraints → deliverables →
    // judging), not alphabetical, so it can't come from the query.
    const rows = (data as any[]) || []
    return rows.sort(
      (a, b) =>
        EVENT_CRITERION_KINDS.indexOf(a.kind) - EVENT_CRITERION_KINDS.indexOf(b.kind) ||
        a.sort_order - b.sort_order
    )
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'criteria', eventId),
    queryFn: () => fetchCriteria(eventId as string),
    enabled: !!eventId,
  })

  return {
    criteria: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Groups a flat brief by kind, preserving the editorial kind order. */
export function groupCriteria(
  criteria: EventCriterion[] | undefined
): { kind: EventCriterionKind; items: EventCriterion[] }[] {
  if (!criteria?.length) return []
  return EVENT_CRITERION_KINDS.map((kind) => ({
    kind,
    items: criteria.filter((c) => c.kind === kind),
  })).filter((group) => group.items.length > 0)
}

export function useCreateCriterion() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      kind: EventCriterionKind
      title: string
      description?: string | null
      is_required?: boolean
      weight?: number | null
      sort_order?: number
    }) => {
      const { data: result, error } = await supabase
        .from('event_criteria')
        .insert({
          event_id: data.event_id,
          kind: data.kind,
          title: data.title,
          description: data.description ?? null,
          is_required: data.is_required ?? true,
          // Weight is meaningless outside judging and would show up in the
          // editor as a stale number if the kind is later switched.
          weight: data.kind === 'judging_criterion' ? data.weight ?? null : null,
          sort_order: data.sort_order ?? 0,
        } as any)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: keys.sub('events', 'criteria', variables.event_id),
      })
    },
  })

  return { createCriterion: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateCriterion() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      criterionId,
      updates,
    }: {
      criterionId: string
      updates: Record<string, any>
    }) => {
      const { data, error } = await supabase
        .from('event_criteria')
        .update(updates as any)
        .eq('id', criterionId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'criteria') })
    },
  })

  const updateCriterion = (criterionId: string, updates: Record<string, any>) =>
    mutation.mutateAsync({ criterionId, updates })

  return { updateCriterion, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteCriterion() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (criterionId: string) => {
      const { error } = await supabase.from('event_criteria').delete().eq('id', criterionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'criteria') })
    },
  })

  return { deleteCriterion: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * Renumbers a kind's rows to 0..n-1 in the order given. Swapping the two
 * moved rows' sort_order values is not enough — rows added before this
 * migration existed, or added in the same second, can share a value, and a
 * swap between equals is a no-op.
 */
export function useReorderCriteria() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ ordered }: { eventId: string; ordered: EventCriterion[] }) => {
      const changed = ordered
        .map((c, index) => ({ c, index }))
        .filter(({ c, index }) => c.sort_order !== index)

      for (const { c, index } of changed) {
        const { error } = await supabase
          .from('event_criteria')
          .update({ sort_order: index } as any)
          .eq('id', c.id)
        if (error) throw error
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: keys.sub('events', 'criteria', variables.eventId),
      })
    },
  })

  const reorder = (eventId: string, ordered: EventCriterion[]) =>
    mutation.mutateAsync({ eventId, ordered })

  return { reorder, loading: mutation.isPending, error: mutation.error }
}
