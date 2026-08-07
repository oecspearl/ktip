import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { SavedVenueTemplate } from '../components/venue/map/VenueTemplatePicker'

/** One venue_templates row (107), as the picker and the save dialog use it. */
export interface VenueTemplateRow extends SavedVenueTemplate {
  owner_id: string
  source_event_id: string | null
  is_shared: boolean
  created_at: string
}

/**
 * The templates this user may apply: their own plus anything shared. RLS is
 * the actual gate — this query just asks for everything it is allowed to see.
 */
export function useVenueTemplates(enabled = true) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'templates'),
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('venue_templates')
        .select('id, owner_id, name, description, source_event_id, map, rooms, is_shared, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as VenueTemplateRow[]) || []
    },
  })

  return { templates: query.data, loading: query.isLoading, error: query.error }
}

/** Snapshot an event's drawn venue into a named template (save_venue_template). */
export function useSaveVenueTemplate() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      name,
      description,
    }: {
      eventId: string
      name: string
      description?: string
    }) => {
      const { data, error } = await (supabase as any).rpc('save_venue_template', {
        p_event_id: eventId,
        p_name: name,
        p_description: description ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'templates') })
    },
  })

  return {
    saveTemplate: mutation.mutateAsync,
    saving: mutation.isPending,
    error: mutation.error,
  }
}

/** Delete one of the caller's templates. RLS refuses anyone else's. */
export function useDeleteVenueTemplate() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('venue_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'templates') })
    },
  })

  return {
    deleteTemplate: mutation.mutateAsync,
    deleting: mutation.isPending,
    error: mutation.error,
  }
}
