import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { listEntityUploadPaths, removeEntityUploads } from '../lib/entity-uploads'
import type { EventSolution } from '../types'

/**
 * Solutions submitted to an event challenge (migration 085).
 *
 * RLS decides what comes back: before entries close a participant sees only
 * their own, while the organizer and OECS admins see all of them. There is no
 * client-side filter here, and there must not be one — the row-level policy is
 * the only thing that can be trusted with "who may read a rival's entry".
 */
export function useEventSolutions(eventId: string | undefined) {
  const fetchSolutions = async (id: string): Promise<EventSolution[]> => {
    const { data, error } = await supabase
      .from('event_solutions')
      .select('*, author:profiles!author_id(*)')
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'solutions', eventId),
    queryFn: () => fetchSolutions(eventId as string),
    enabled: !!eventId,
  })

  return {
    solutions: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCreateSolution() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      author_id: string
      title: string
      description?: string | null
      link_url?: string | null
    }): Promise<EventSolution> => {
      const { data: result, error } = await supabase
        .from('event_solutions')
        .insert({
          event_id: data.event_id,
          author_id: data.author_id,
          title: data.title,
          description: data.description ?? null,
          link_url: data.link_url ?? null,
        } as any)
        .select()
        .single()

      if (error) throw error
      return result as EventSolution
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'solutions', variables.event_id) })
    },
  })

  return { createSolution: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateSolution() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      solutionId: string
      updates: { title?: string; description?: string | null; link_url?: string | null }
    }) => {
      const { error } = await supabase
        .from('event_solutions')
        .update(params.updates as any)
        .eq('id', params.solutionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'solutions') })
    },
  })

  const updateSolution = (solutionId: string, updates: Parameters<typeof mutation.mutateAsync>[0]['updates']) =>
    mutation.mutateAsync({ solutionId, updates })

  return { updateSolution, loading: mutation.isPending, error: mutation.error }
}

/**
 * Withdraws an entry. The document rows are reaped by the trigger in 085; the
 * blobs are the client's job, in the same order the delete-guard uses
 * elsewhere: enumerate, delete the parent, then remove the objects.
 */
export function useDeleteSolution() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (solutionId: string) => {
      const paths = await listEntityUploadPaths('event_solution', solutionId)

      const { error } = await supabase.from('event_solutions').delete().eq('id', solutionId)
      if (error) throw error

      await removeEntityUploads(paths)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'solutions') })
    },
  })

  return { deleteSolution: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
