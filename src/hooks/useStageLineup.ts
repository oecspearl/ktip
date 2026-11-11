import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uniqueTopic } from '../lib/realtime'
import { keys } from '../queries/keys'

export interface LineupItem {
  id: string
  room_id: string
  position: number
  title: string
  detail: string | null
  team_id: string | null
  speaker_id: string | null
  starts_at: string
  minutes: number
  status: 'upcoming' | 'live' | 'done'
}

/**
 * Every stage's running order at one event (migration 213), by start time.
 *
 * Event-wide rather than per room because the Green Room reads it too: it
 * shows the next speaker their slot on whichever stage it is.
 */
export function useStageLineup(eventId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'lineup', eventId)

  const query = useQuery({
    queryKey: key,
    enabled: !!eventId,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; rows: LineupItem[] }> => {
      const { data, error } = await (supabase as any)
        .from('venue_stage_lineup')
        .select('id, room_id, position, title, detail, team_id, speaker_id, starts_at, minutes, status')
        .eq('event_id', eventId)
        .order('starts_at')
        .order('position')
      if (error) return { available: false, rows: [] }
      return { available: true, rows: data || [] }
    },
  })

  useEffect(() => {
    if (!eventId) return
    const channel = supabase
      .channel(uniqueTopic(`venue_stage_lineup:${eventId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_stage_lineup', filter: `event_id=eq.${eventId}` }, () =>
        queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'lineup', eventId) })
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [eventId, queryClient])

  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await (supabase as any).rpc(name, args)
    if (error) throw error
  }

  return {
    lineup: query.data?.rows ?? [],
    loading: query.isPending,
    available: query.data?.available ?? true,
    setLive: useMutation({
      mutationFn: ({ roomId, id }: { roomId: string; id: string | null }) => rpc('set_lineup_live', { p_room_id: roomId, p_id: id }),
      onSuccess: refresh,
    }),
  }
}
