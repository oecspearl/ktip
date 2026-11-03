import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { deckObjectPath, type ChecklistEvidence, type MissingCode } from '../lib/submission-checklist'
import type { AiUse, EventCriterionKind, SubmissionReceipt } from '../types'

/**
 * The Submission Desk (migration 192): one team entry per team, edited by any
 * teammate until the deadline, then locked by the database.
 *
 * Reads go through my_team_submission() so the desk gets the team, the entry,
 * its evidence, the brief and the latest receipt in one round trip. Before 192
 * is applied that function does not exist; the query then resolves to null and
 * the panel says the desk is not open, rather than throwing.
 */

export const SUBMISSION_BUCKET = 'submission-files'
export const MAX_DECK_BYTES = 25 * 1024 * 1024

export interface DeskCriterion {
  id: string
  kind: Extract<EventCriterionKind, 'objective' | 'deliverable'>
  title: string
  description: string | null
  is_required: boolean
}

export interface DeskTeamMember {
  user_id: string
  role: 'captain' | 'member'
  display_name: string | null
}

export interface TeamEntry {
  id: string
  event_id: string
  team_id: string | null
  title: string
  description: string | null
  repo_url: string | null
  demo_video_url: string | null
  demo_video_seconds: number | null
  pitch_deck_url: string | null
  pitch_deck_path: string | null
  ai_use: AiUse | null
  ai_tools: string | null
  submitted_at: string | null
  last_edited_at: string | null
  receipt_id: string | null
  status?: string
}

export interface TeamSubmissionState {
  deadline: string | null
  locked: boolean
  results_published_at: string | null
  /** No team, and allowed to enter alone (198): a venue participant who neither judges nor runs it. */
  solo_allowed: boolean
  criteria: DeskCriterion[]
  team: { id: string; name: string; members: DeskTeamMember[] } | null
  solution: TeamEntry | null
  evidence: ChecklistEvidence[]
  missing: MissingCode[] | null
  receipt: SubmissionReceipt | null
}

export type EntryFields = Partial<
  Pick<
    TeamEntry,
    | 'title'
    | 'description'
    | 'repo_url'
    | 'demo_video_url'
    | 'demo_video_seconds'
    | 'pitch_deck_url'
    | 'pitch_deck_path'
    | 'ai_use'
    | 'ai_tools'
  >
>

const deskKey = (eventId: string | undefined) => keys.sub('events', 'team-submission', eventId)

export function useTeamSubmission(eventId: string | undefined) {
  const query = useQuery({
    queryKey: deskKey(eventId),
    enabled: !!eventId,
    queryFn: async (): Promise<TeamSubmissionState | null> => {
      const { data, error } = await (supabase as any).rpc('my_team_submission', {
        p_event_id: eventId,
      })
      if (error || !data) return null
      return {
        deadline: data.deadline ?? null,
        locked: !!data.locked,
        results_published_at: data.results_published_at ?? null,
        solo_allowed: !!data.solo_allowed,
        criteria: data.criteria ?? [],
        team: data.team ?? null,
        solution: data.solution ?? null,
        evidence: data.evidence ?? [],
        missing: data.missing ?? null,
        receipt: data.receipt ?? null,
      }
    },
  })
  return { desk: query.data ?? null, loading: query.isPending, refetch: query.refetch }
}

export function useSaveSubmission(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { fields: EntryFields; evidence?: ChecklistEvidence[] }) => {
      const { data, error } = await (supabase as any).rpc('save_submission', {
        p_event_id: eventId,
        p_fields: args.fields,
        p_evidence: args.evidence ?? null,
      })
      if (error) throw error
      return data as TeamEntry
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deskKey(eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'solutions', eventId) })
    },
  })
}

export interface SubmitResult {
  ok: boolean
  missing?: MissingCode[]
  receipt_id?: string
  submitted_at?: string
}

export function useSubmitSubmission(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (solutionId: string): Promise<SubmitResult> => {
      const { data, error } = await (supabase as any).rpc('submit_team_submission', {
        p_solution_id: solutionId,
      })
      if (error) throw error
      return data as SubmitResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deskKey(eventId) })
      queryClient.invalidateQueries({ queryKey: keys.list('submissions') })
    },
  })
}

/**
 * Uploads a deck into the entry's own folder, then points the entry at it. The
 * previous file is removed afterwards, so a failed save never strands the
 * entry without a deck.
 */
export function useUploadDeck(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { entry: TeamEntry; file: File }) => {
      if (args.file.size > MAX_DECK_BYTES) throw new Error('too_large')
      const path = deckObjectPath(args.entry.id, args.file.name)
      const { error: upErr } = await supabase.storage
        .from(SUBMISSION_BUCKET)
        .upload(path, args.file, { contentType: args.file.type || undefined })
      if (upErr) throw upErr

      const { error } = await (supabase as any).rpc('save_submission', {
        p_event_id: eventId,
        p_fields: { pitch_deck_path: path },
        p_evidence: null,
      })
      if (error) {
        await supabase.storage.from(SUBMISSION_BUCKET).remove([path])
        throw error
      }
      if (args.entry.pitch_deck_path && args.entry.pitch_deck_path !== path) {
        await supabase.storage.from(SUBMISSION_BUCKET).remove([args.entry.pitch_deck_path])
      }
      return path
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deskKey(eventId) }),
  })
}

export function useRemoveDeck(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entry: TeamEntry) => {
      const { error } = await (supabase as any).rpc('save_submission', {
        p_event_id: eventId,
        p_fields: { pitch_deck_path: null },
        p_evidence: null,
      })
      if (error) throw error
      if (entry.pitch_deck_path) {
        await supabase.storage.from(SUBMISSION_BUCKET).remove([entry.pitch_deck_path])
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deskKey(eventId) }),
  })
}

/** A five-minute link to an entry's deck. Storage RLS decides who gets one. */
export async function openDeck(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) throw error || new Error('no_link')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

/** The file name a deck path was uploaded as, without the folder and stamp. */
export function deckFileName(path: string | null | undefined): string {
  if (!path) return ''
  const name = path.split('/').pop() || ''
  return name.replace(/^[a-z0-9]+-/, '')
}
