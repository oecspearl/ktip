import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  ContentReport,
  ModerationLogEntry,
  ModerationSettings,
  ModerationTargetType,
  ModerationTerm,
  ReportCategory,
} from '../types'

/** File a report. One per person per item — the DB enforces it. */
export function useReportContent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      reporterId: string
      targetType: ModerationTargetType
      targetId: string
      targetAuthorId?: string | null
      category: ReportCategory
      detail?: string
      contentSnapshot?: string | null
    }) => {
      const { error } = await (supabase as any).from('content_reports').insert({
        reporter_id: params.reporterId,
        target_type: params.targetType,
        target_id: params.targetId,
        target_author_id: params.targetAuthorId ?? null,
        category: params.category,
        detail: params.detail || null,
        content_snapshot: params.contentSnapshot ? params.contentSnapshot.slice(0, 2000) : null,
      })

      // 23505 = already reported by this user. Not an error worth surfacing.
      if (error && error.code !== '23505') throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('content-reports') })
    },
  })

  return { reportContent: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useModerationQueue(filters?: { status?: string; severity?: string }) {
  const query = useQuery({
    queryKey: keys.list('content-reports', filters),
    queryFn: async (): Promise<ContentReport[]> => {
      let request = (supabase as any)
        .from('content_reports')
        .select('*, reporter:profiles!reporter_id(*), target_author:profiles!target_author_id(*)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters?.status) request = request.eq('status', filters.status)
      if (filters?.severity) request = request.eq('severity', filters.severity)

      const { data, error } = await request
      if (error) throw error
      return (data as ContentReport[]) || []
    },
  })

  return { reports: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Triage action. Goes through moderate_report() so the content status change,
 * the report resolution and the audit entry are one transaction.
 */
export function useModerateReport() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      reportId: string
      action: 'restore' | 'quarantine' | 'remove' | 'dismiss'
      notes?: string
    }) => {
      const { data, error } = await (supabase as any).rpc('moderate_report', {
        p_report: params.reportId,
        p_action: params.action,
        p_notes: params.notes || null,
      })

      if (error) throw error
      if (data && data.ok === false) {
        throw new Error(
          data.reason === 'forbidden'
            ? 'You do not have permission to action moderation items.'
            : 'Could not action this report.'
        )
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('content-reports') })
      queryClient.invalidateQueries({ queryKey: keys.all('moderation-log') })
      queryClient.invalidateQueries({ queryKey: keys.all('forums') })
    },
  })

  return { moderateReport: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useModerationTerms() {
  const query = useQuery({
    queryKey: keys.list('moderation-terms'),
    queryFn: async (): Promise<ModerationTerm[]> => {
      const { data, error } = await (supabase as any)
        .from('moderation_terms')
        .select('*')
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as ModerationTerm[]) || []
    },
  })

  return { terms: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useManageModerationTerms() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('moderation-terms') })
    // The browser scans against its own cached copy of the rules (119), which
    // never refetches on its own. Without this a moderator adds a term and
    // watches their own composer ignore it until they reload.
    queryClient.invalidateQueries({ queryKey: keys.all('moderation-rules') })
  }

  const create = useMutation({
    mutationFn: async (term: Partial<ModerationTerm>) => {
      const { error } = await (supabase as any).from('moderation_terms').insert(term)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async (params: { id: string; patch: Partial<ModerationTerm> }) => {
      const { error } = await (supabase as any)
        .from('moderation_terms')
        .update({ ...params.patch, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('moderation_terms').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    createTerm: create.mutateAsync,
    updateTerm: (id: string, patch: Partial<ModerationTerm>) => update.mutateAsync({ id, patch }),
    deleteTerm: remove.mutateAsync,
    loading: create.isPending || update.isPending || remove.isPending,
  }
}

export function useModerationSettings() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: keys.detail('moderation-settings', 1),
    queryFn: async (): Promise<ModerationSettings | null> => {
      const { data, error } = await (supabase as any)
        .from('moderation_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (error) throw error
      return (data as ModerationSettings) || null
    },
  })

  const mutation = useMutation({
    mutationFn: async (patch: Partial<ModerationSettings>) => {
      const { error } = await (supabase as any)
        .from('moderation_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('moderation-settings') })
    },
  })

  return {
    settings: query.data,
    loading: query.isPending,
    updateSettings: mutation.mutateAsync,
    saving: mutation.isPending,
    refetch: query.refetch,
  }
}

export function useModerationLog(limit = 100) {
  const query = useQuery({
    queryKey: keys.list('moderation-log', { limit }),
    queryFn: async (): Promise<ModerationLogEntry[]> => {
      const { data, error } = await (supabase as any)
        .from('moderation_log')
        .select('*, actor:profiles!actor_id(*), user:profiles!user_id(*)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data as ModerationLogEntry[]) || []
    },
  })

  return { entries: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Optional LLM second opinion for an ambiguous item. Advisory only — the
 * deterministic trigger has already decided whether the content is visible.
 */
export async function requestModerationReview(reportId: string): Promise<{
  severity: string | null
  rationale: string
} | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const res = await fetch('/api/moderate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ report_id: reportId }),
  })

  if (!res.ok) return null
  return res.json()
}
