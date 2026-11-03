import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { TeamOpening, TeamRequest } from '../lib/team-finder'

/**
 * Team Finder reads and writes (migration 191).
 *
 * Reads go straight to the tables, which RLS scopes: openings are public to
 * the venue, requests only to the person and the team involved. Writes go
 * through the RPCs, which are the only way in.
 *
 * Before 191 is applied the tables do not exist. Both reads then return an
 * empty list rather than an error, so the panel shows teams and people and
 * simply has no openings or requests yet.
 */

export function useTeamOpenings(eventId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'team-openings', eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<TeamOpening[]> => {
      const { data, error } = await (supabase as any)
        .from('event_team_openings')
        .select('id, team_id, event_id, title, skills, is_open, created_at')
        .eq('event_id', eventId)
        .eq('is_open', true)
        .order('created_at', { ascending: true })
      if (error) return []
      return ((data as any[]) || []).map((o) => ({ ...o, skills: o.skills || [] }))
    },
  })
  return { openings: query.data ?? [], loading: query.isPending }
}

export function useTeamRequests(eventId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'team-requests', eventId),
    enabled: !!eventId && enabled,
    queryFn: async (): Promise<TeamRequest[]> => {
      // The fk hint is required: requests point at profiles three times.
      const { data, error } = await (supabase as any)
        .from('event_team_requests')
        .select(
          'id, team_id, event_id, user_id, kind, status, message, opening_id, created_by, created_at, responded_at, person:profiles!event_team_requests_user_id_fkey(display_name, avatar_url)'
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return []
      return ((data as any[]) || []).map((r) => ({ ...r, person: r.person ?? null }))
    },
  })
  return { requests: query.data ?? [], loading: query.isPending && enabled }
}

/**
 * One mutation shape for every Team Finder write: call an RPC, throw its
 * error, and refresh everything the write could have changed. Accepting a
 * request changes the team list and the "looking" list as well as the
 * requests, so all four are invalidated rather than guessing which.
 */
function useFinderRpc<Args>(eventId: string | undefined, rpc: string, toParams: (args: Args) => Record<string, unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: Args) => {
      const { data, error } = await (supabase as any).rpc(rpc, toParams(args))
      if (error) throw error
      return data
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'teams', eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'team-openings', eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'team-requests', eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', eventId) })
    },
  })
}

export function usePostOpening(eventId: string | undefined) {
  return useFinderRpc(eventId, 'post_team_opening', (a: { teamId: string; title: string; skills: string[] }) => ({
    p_team_id: a.teamId,
    p_title: a.title,
    p_skills: a.skills,
  }))
}

export function useCloseOpening(eventId: string | undefined) {
  return useFinderRpc(eventId, 'close_team_opening', (openingId: string) => ({ p_opening_id: openingId }))
}

export function useApplyToTeam(eventId: string | undefined) {
  return useFinderRpc(
    eventId,
    'apply_to_team',
    (a: { teamId: string; message?: string; openingId?: string | null }) => ({
      p_team_id: a.teamId,
      p_message: a.message?.trim() || null,
      p_opening_id: a.openingId ?? null,
    })
  )
}

export function useInviteToTeam(eventId: string | undefined) {
  return useFinderRpc(eventId, 'invite_to_team', (a: { teamId: string; userId: string; message?: string }) => ({
    p_team_id: a.teamId,
    p_user_id: a.userId,
    p_message: a.message?.trim() || null,
  }))
}

export function useRespondToRequest(eventId: string | undefined) {
  return useFinderRpc(eventId, 'respond_team_request', (a: { requestId: string; accept: boolean }) => ({
    p_request_id: a.requestId,
    p_accept: a.accept,
  }))
}

export function useWithdrawRequest(eventId: string | undefined) {
  return useFinderRpc(eventId, 'withdraw_team_request', (requestId: string) => ({ p_request_id: requestId }))
}
