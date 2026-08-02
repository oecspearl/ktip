import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { parseMapConfig, type MapCell, type VenueMapConfig } from '../lib/venue-map'
import type { Event, VenueRoom } from '../types'

/** What the editor sends for one room. Everything else the row keeps. */
export interface VenueMapRoomInput {
  key: string
  name: string
  kind: VenueRoom['kind']
  description: string | null
  capacity: number | null
  audio_mode: VenueRoom['audio_mode']
  recording_enabled: boolean
  is_open: boolean
  sort_order: number
  floor: number
  cells: MapCell[]
  color: string
  wall_height: number
  allowed_roles: VenueRoom['allowed_roles']
  sponsor_name?: string | null
  sponsor_url?: string | null
}

/**
 * Save the whole floorplan in one call.
 *
 * Whole-map rather than per-room because that is what the editor is: the host
 * drags six rooms around and presses save once. The RPC matches on `key`, so a
 * room that survives an edit keeps its id and its chat history — the save is
 * not a delete-and-recreate however much moved.
 */
export function useSaveVenueMap() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      map,
      rooms,
    }: {
      eventId: string
      map: VenueMapConfig
      rooms: VenueMapRoomInput[]
    }) => {
      const { data, error } = await (supabase as any).rpc('save_venue_map', {
        p_event_id: eventId,
        p_map: map,
        p_rooms: rooms,
      })
      if (error) throw error
      return (data as VenueRoom[]) || []
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'rooms', variables.eventId) })
      queryClient.invalidateQueries({ queryKey: keys.detail('events', variables.eventId) })
      queryClient.invalidateQueries({ queryKey: keys.all('events') })
    },
  })

  return {
    saveMap: mutation.mutateAsync,
    saving: mutation.isPending,
    error: mutation.error,
  }
}

/**
 * The event's map config, normalised. An event that has never been drawn gets
 * the default single-floor grid rather than null, so every caller can assume a
 * grid exists and only has to ask whether any room is actually placed.
 */
export function mapConfigOf(event: Pick<Event, 'venue_map'> | null | undefined): VenueMapConfig {
  return parseMapConfig(event?.venue_map)
}
