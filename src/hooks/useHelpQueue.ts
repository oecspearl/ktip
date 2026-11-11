import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uniqueTopic } from '../lib/realtime'
import { keys } from '../queries/keys'

type Person = { id: string; display_name: string | null; avatar_url: string | null } | null

export interface HelpRequest {
  id: string
  room_id: string
  user_id: string
  body: string
  tags: string[]
  lang: string | null
  status: 'waiting' | 'helping'
  mentor_id: string | null
  created_at: string
  asker: Person
  mentor: Person
}

/**
 * The Help Desk line for one room, oldest first (migration 211).
 *
 * Only open requests: waiting, or being helped. `available` is false when the
 * table is not there yet, so the room can say so plainly.
 *
 * Both embeds name their foreign key: the table points at profiles twice
 * (who asked and who is helping), and a bare embed is ambiguous.
 */
export function useHelpQueue(roomId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'help-queue', roomId)

  const query = useQuery({
    queryKey: key,
    enabled: !!roomId,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; rows: HelpRequest[] }> => {
      const { data, error } = await (supabase as any)
        .from('venue_help_requests')
        .select(
          'id, room_id, user_id, body, tags, lang, status, mentor_id, created_at, asker:profiles!venue_help_requests_user_id_fkey(id, display_name, avatar_url), mentor:profiles!venue_help_requests_mentor_id_fkey(id, display_name, avatar_url)'
        )
        .eq('room_id', roomId)
        .in('status', ['waiting', 'helping'])
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) return { available: false, rows: [] }
      return { available: true, rows: (data as HelpRequest[]) || [] }
    },
  })

  useEffect(() => {
    if (!roomId) return
    const channel = supabase
      .channel(uniqueTopic(`venue_help_requests:${roomId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'venue_help_requests', filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'help-queue', roomId) })
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, queryClient])

  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await (supabase as any).rpc(name, args)
    if (error) throw error
  }

  const ask = useMutation({
    mutationFn: ({ body, tags, lang }: { body: string; tags: string[]; lang: string | null }) =>
      rpc('ask_for_help', { p_room_id: roomId, p_body: body, p_tags: tags, p_lang: lang }),
    onSuccess: refresh,
  })
  const withdraw = useMutation({
    mutationFn: (id: string) => rpc('withdraw_help_request', { p_request_id: id }),
    onSuccess: refresh,
  })
  const pick = useMutation({
    mutationFn: (id: string) => rpc('pick_help_request', { p_request_id: id }),
    onSuccess: refresh,
  })
  const close = useMutation({
    mutationFn: (id: string) => rpc('close_help_request', { p_request_id: id }),
    onSuccess: refresh,
  })

  return {
    requests: query.data?.rows ?? [],
    loading: query.isPending,
    available: query.data?.available ?? true,
    ask,
    withdraw,
    pick,
    close,
  }
}
