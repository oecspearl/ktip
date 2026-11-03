import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

/**
 * Cross-team bridges (migration 197). A bridge lets one team into another
 * team's Homebase call and chat for a set time. Reads degrade to empty before
 * the migration is applied.
 */
export interface TeamBridge {
  id: string
  event_id: string
  from_team_id: string
  to_team_id: string
  message: string | null
  minutes: number
  status: 'pending' | 'open' | 'declined' | 'ended'
  expires_at: string | null
  created_at: string
}

export const isLive = (b: TeamBridge, now = Date.now()) =>
  b.status === 'open' && !!b.expires_at && new Date(b.expires_at).getTime() > now

/** Team ids whose Homebase this team may visit right now. */
export function guestOf(bridges: TeamBridge[], myTeamId: string | undefined, now = Date.now()): Set<string> {
  const out = new Set<string>()
  if (!myTeamId) return out
  for (const b of bridges) if (b.from_team_id === myTeamId && isLive(b, now)) out.add(b.to_team_id)
  return out
}

export function useBridges(eventId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'bridges', eventId)

  const query = useQuery({
    queryKey: key,
    enabled: !!eventId,
    // Bridges expire on the clock; a minute is close enough for a door.
    refetchInterval: 60_000,
    queryFn: async (): Promise<TeamBridge[]> => {
      const { data, error } = await (supabase as any)
        .from('event_team_bridges')
        .select('id, event_id, from_team_id, to_team_id, message, minutes, status, expires_at, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
      return error ? [] : data || []
    },
  })

  const after = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'rooms', eventId) })
    },
  }

  const request = useMutation({
    mutationFn: async (args: { toTeam: string; minutes: number; message?: string }) => {
      const { error } = await (supabase as any).rpc('request_team_bridge', {
        p_to_team: args.toTeam,
        p_minutes: args.minutes,
        p_message: args.message || null,
      })
      if (error) throw error
    },
    ...after,
  })

  const respond = useMutation({
    mutationFn: async (args: { id: string; accept: boolean }) => {
      const { error } = await (supabase as any).rpc('respond_team_bridge', { p_bridge_id: args.id, p_accept: args.accept })
      if (error) throw error
    },
    ...after,
  })

  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc('end_team_bridge', { p_bridge_id: id })
      if (error) throw error
    },
    ...after,
  })

  return { bridges: query.data ?? [], request, respond, end }
}
