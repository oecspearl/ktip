import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { rankLeaderboard, type LeaderRow } from '../lib/quests'

export type { LeaderRow }

/**
 * Quest Board data (migration 196). Every read degrades to empty before the
 * migration is applied, so the panel renders an empty board, not an error.
 */
export interface Quest {
  id: string
  title: string
  description: string | null
  points: number
  is_active: boolean
}

export interface QuestClaim {
  id: string
  quest_id: string
  team_id: string
  claimed_by: string | null
  evidence: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function useRpcMutation(name: string, onSuccess: () => void) {
  return useMutation({
    mutationFn: async (args: Record<string, unknown>) => {
      const { error } = await (supabase as any).rpc(name, args)
      if (error) throw error
    },
    onSuccess,
  })
}

export function useQuests(eventId: string | undefined) {
  const queryClient = useQueryClient()
  const qKey = keys.sub('venue', 'quests', eventId)
  const cKey = keys.sub('venue', 'quest-claims', eventId)
  const lKey = keys.sub('venue', 'leaderboard', eventId)

  const quests = useQuery({
    queryKey: qKey,
    enabled: !!eventId,
    queryFn: async (): Promise<Quest[]> => {
      const { data, error } = await (supabase as any)
        .from('event_quests')
        .select('id, title, description, points, is_active')
        .eq('event_id', eventId)
        .order('sort_order')
      return error ? [] : data || []
    },
  })

  const claims = useQuery({
    queryKey: cKey,
    enabled: !!eventId,
    queryFn: async (): Promise<QuestClaim[]> => {
      const { data, error } = await (supabase as any)
        .from('event_quest_claims')
        .select('id, quest_id, team_id, claimed_by, evidence, status, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
      return error ? [] : data || []
    },
  })

  const leaderboard = useQuery({
    queryKey: lKey,
    enabled: !!eventId,
    queryFn: async (): Promise<LeaderRow[]> => {
      const { data, error } = await (supabase as any).rpc('event_leaderboard', { p_event_id: eventId })
      return error ? [] : rankLeaderboard(data || [])
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qKey })
    queryClient.invalidateQueries({ queryKey: cKey })
    queryClient.invalidateQueries({ queryKey: lKey })
  }

  const claim = useRpcMutation('claim_event_quest', refresh)
  const decide = useRpcMutation('decide_quest_claim', refresh)
  const save = useRpcMutation('save_event_quest', refresh)

  return {
    quests: quests.data ?? [],
    claims: claims.data ?? [],
    leaderboard: leaderboard.data ?? [],
    loading: quests.isPending,
    claim,
    decide,
    save,
  }
}

export function useMyStreak(userId: string | undefined) {
  return useQuery({
    queryKey: keys.sub('profile', 'streak', userId),
    enabled: !!userId,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await (supabase as any).rpc('current_streak', { p_user: userId })
      return error ? null : Number(data) || 0
    },
  })
}
