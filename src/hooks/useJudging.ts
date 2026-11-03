import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { AiUse } from '../types'

/**
 * Judging, results and People's Choice (migration 192).
 *
 * Every read is one SECURITY DEFINER function that decides what the caller may
 * see: a judge never gets an entry they declared a conflict with, and a
 * participant gets nothing from the results until an organiser publishes. The
 * hooks pass that through untouched. Before 192 is applied the functions do
 * not exist, and each query resolves to null so the panels show an empty
 * state instead of an error.
 */

export interface JudgingCriterionRow {
  id: string
  title: string
  description?: string | null
  weight: number | null
}

export interface JudgeEvidence {
  criterion_id: string
  title: string
  kind: 'objective' | 'deliverable'
  note: string | null
  url: string | null
}

export interface JudgeEntry {
  id: string
  title: string
  summary: string | null
  team_id: string | null
  team_name: string | null
  repo_url: string | null
  link_url: string | null
  demo_video_url: string | null
  demo_video_seconds: number | null
  pitch_deck_url: string | null
  pitch_deck_path: string | null
  ai_use: AiUse | null
  ai_tools: string | null
  submitted_at: string
  evidence: JudgeEvidence[]
  my_scores: Record<string, number>
  my_comment: string | null
}

export interface JudgingConsoleState {
  allowed: boolean
  is_host: boolean
  deadline: string | null
  locked: boolean
  results_published_at: string | null
  declared_at: string | null
  criteria: JudgingCriterionRow[]
  teams: Array<{ id: string; name: string; members: string[] }>
  solo_entries: Array<{ id: string; title: string; author: string | null }>
  conflicts: { team_ids: string[]; solution_ids: string[] }
  entries: JudgeEntry[]
}

const consoleKey = (eventId: string | undefined) => keys.sub('events', 'judging-console', eventId)
const resultsKey = (eventId: string | undefined) => keys.sub('events', 'judging-results', eventId)
const ballotKey = (eventId: string | undefined) => keys.sub('events', 'peoples-choice', eventId)

export function useJudgingConsole(eventId: string | undefined) {
  const query = useQuery({
    queryKey: consoleKey(eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<JudgingConsoleState | null> => {
      const { data, error } = await (supabase as any).rpc('judging_console', { p_event_id: eventId })
      if (error || !data) return null
      if (!data.allowed) return { ...EMPTY_CONSOLE, allowed: false }
      return {
        ...EMPTY_CONSOLE,
        ...data,
        criteria: data.criteria ?? [],
        teams: data.teams ?? [],
        solo_entries: data.solo_entries ?? [],
        conflicts: {
          team_ids: data.conflicts?.team_ids ?? [],
          solution_ids: data.conflicts?.solution_ids ?? [],
        },
        entries: data.entries ?? [],
      }
    },
  })
  return { console: query.data ?? null, loading: query.isPending, refetch: query.refetch }
}

const EMPTY_CONSOLE: JudgingConsoleState = {
  allowed: true,
  is_host: false,
  deadline: null,
  locked: false,
  results_published_at: null,
  declared_at: null,
  criteria: [],
  teams: [],
  solo_entries: [],
  conflicts: { team_ids: [], solution_ids: [] },
  entries: [],
}

export function useDeclareConflicts(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { teamIds: string[]; solutionIds: string[] }) => {
      const { error } = await (supabase as any).rpc('declare_judge_conflicts', {
        p_event_id: eventId,
        p_team_ids: args.teamIds,
        p_solution_ids: args.solutionIds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consoleKey(eventId) })
      queryClient.invalidateQueries({ queryKey: resultsKey(eventId) })
    },
  })
}

export function useSaveScores(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      solutionId: string
      scores: Record<string, number | null>
      comment?: string | null
    }) => {
      const { error } = await (supabase as any).rpc('save_judge_scores', {
        p_solution_id: args.solutionId,
        p_scores: args.scores,
        p_comment: args.comment ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consoleKey(eventId) })
      queryClient.invalidateQueries({ queryKey: resultsKey(eventId) })
    },
  })
}

// ---------------------------------------------------------------------------
// results
// ---------------------------------------------------------------------------

export interface RankingRow {
  solution_id: string
  title: string
  team_name: string | null
  judges: number
  weighted: number | null
  normalised: number | null
  place: number | null
}

export interface JudgingResults {
  visible: boolean
  is_host: boolean
  published_at: string | null
  ranking: RankingRow[]
  criteria: JudgingCriterionRow[]
  judges: Array<{ id: string; name: string | null; declared_at: string | null }>
  scores: Array<{ judge_id: string; solution_id: string; criterion_id: string; score: number }>
  comments: Array<{ judge_id: string; solution_id: string; comment: string }>
  conflicts: Array<{ judge_id: string; team_id: string | null; solution_id: string | null }>
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export function useEventResults(eventId: string | undefined) {
  const query = useQuery({
    queryKey: resultsKey(eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<JudgingResults | null> => {
      const { data, error } = await (supabase as any).rpc('event_judging_results', {
        p_event_id: eventId,
      })
      if (error || !data) return null
      return {
        visible: !!data.visible,
        is_host: !!data.is_host,
        published_at: data.published_at ?? null,
        // numeric comes back as a string or a number depending on size.
        ranking: (data.ranking ?? []).map((r: any) => ({
          ...r,
          judges: Number(r.judges ?? 0),
          weighted: num(r.weighted),
          normalised: num(r.normalised),
          place: num(r.place),
        })),
        criteria: data.criteria ?? [],
        judges: data.judges ?? [],
        scores: data.scores ?? [],
        comments: data.comments ?? [],
        conflicts: data.conflicts ?? [],
      }
    },
  })
  return { results: query.data ?? null, loading: query.isPending, refetch: query.refetch }
}

export function usePublishResults(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (publish: boolean) => {
      const { data, error } = await (supabase as any).rpc('set_event_results_published', {
        p_event_id: eventId,
        p_published: publish,
      })
      if (error) throw error
      return (data as string | null) ?? null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resultsKey(eventId) })
      queryClient.invalidateQueries({ queryKey: ballotKey(eventId) })
      queryClient.invalidateQueries({ queryKey: consoleKey(eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'team-submission', eventId) })
    },
  })
}

// ---------------------------------------------------------------------------
// People's Choice
// ---------------------------------------------------------------------------

export interface BallotEntry {
  id: string
  title: string
  summary: string | null
  team_name: string | null
  demo_video_url: string | null
  repo_url: string | null
  is_mine: boolean
  votes: number | null
}

export interface Ballot {
  allowed: boolean
  is_host: boolean
  open: boolean
  results_published_at: string | null
  my_vote: string | null
  entries: BallotEntry[]
  total_votes: number | null
}

export function usePeoplesChoice(eventId: string | undefined) {
  const query = useQuery({
    queryKey: ballotKey(eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<Ballot | null> => {
      const { data, error } = await (supabase as any).rpc('peoples_choice_ballot', {
        p_event_id: eventId,
      })
      if (error || !data) return null
      return {
        allowed: !!data.allowed,
        is_host: !!data.is_host,
        open: !!data.open,
        results_published_at: data.results_published_at ?? null,
        my_vote: data.my_vote ?? null,
        entries: (data.entries ?? []).map((e: any) => ({ ...e, votes: num(e.votes) })),
        total_votes: num(data.total_votes),
      }
    },
  })
  return { ballot: query.data ?? null, loading: query.isPending }
}

export function useCastVote(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (solutionId: string) => {
      const { error } = await (supabase as any).rpc('cast_peoples_choice_vote', {
        p_solution_id: solutionId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ballotKey(eventId) }),
  })
}
