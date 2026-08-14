import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type TakedownStatus =
  | 'received'
  | 'reviewing'
  | 'actioned'
  | 'rejected'
  | 'counter_received'
  | 'restored'
  | 'withdrawn'

/** A row of the moderation queue. Read through RLS, not an RPC — staff see all. */
export interface TakedownNotice {
  id: string
  kind: 'takedown' | 'counter_notice'
  parent_id: string | null
  reference: string
  claimant_name: string
  claimant_email: string
  claimant_org: string | null
  claimant_role: 'owner' | 'authorised_agent'
  target_type: string | null
  target_id: string | null
  target_author_id: string | null
  target_url: string
  content_snapshot: string | null
  work_description: string
  infringement_detail: string
  status: TakedownStatus
  counts_as_strike: boolean
  admin_notes: string | null
  resolved_at: string | null
  created_at: string
}

/** One row of get_my_takedown_notices() — the accused author's view. */
export interface MyTakedownNotice {
  id: string
  reference: string
  claimant_name: string
  claimant_org: string | null
  target_url: string
  work_description: string
  infringement_detail: string
  status: TakedownStatus
  counts_as_strike: boolean
  created_at: string
  answered: boolean
}

/**
 * The staff queue. A plain select rather than an RPC: the RLS policy on
 * takedown_notices already scopes it — `moderation:view` sees everything, and an
 * ordinary member sees only notices filed against their own content — so an RPC
 * would restate the same rule in a second place that could drift from it.
 */
export function useTakedownQueue(status?: TakedownStatus | 'all') {
  return useQuery({
    queryKey: ['takedowns', status ?? 'open'],
    queryFn: async (): Promise<TakedownNotice[]> => {
      let query = supabase
        .from('takedown_notices')
        .select('*')
        .eq('kind', 'takedown')
        .order('created_at', { ascending: false })

      if (status && status !== 'all') query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as TakedownNotice[]
    },
    staleTime: 30_000,
  })
}

/** Counter-notices filed against a given notice, so the queue can show the answer. */
export function useCounterNotices(parentId: string | null) {
  return useQuery({
    queryKey: ['takedowns', 'counter', parentId],
    queryFn: async (): Promise<TakedownNotice[]> => {
      const { data, error } = await supabase
        .from('takedown_notices')
        .select('*')
        .eq('parent_id', parentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TakedownNotice[]
    },
    enabled: !!parentId,
  })
}

/**
 * Records an outcome. The RPC owns the strike arithmetic and the audit row, so
 * a moderator never has to reason about either — and cannot get them wrong.
 */
export function useApplyTakedownOutcome() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      noticeId,
      status,
      notes,
    }: {
      noticeId: string
      status: Extract<TakedownStatus, 'reviewing' | 'actioned' | 'rejected' | 'restored' | 'withdrawn'>
      notes?: string
    }) => {
      const { data, error } = await (supabase as any).rpc('apply_takedown_outcome', {
        p_notice_id: noticeId,
        p_status: status,
        p_notes: notes ?? null,
      })
      if (error) throw error
      if (data?.ok !== true) throw new Error(String(data?.reason ?? 'failed'))
      return data as { ok: true; strikes: number; limit: number; at_limit: boolean }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['takedowns'] })
    },
  })
}

/** Notices filed against the signed-in member's own content. */
export function useMyTakedownNotices() {
  const auth = useAuth()

  return useQuery({
    queryKey: ['my-takedowns', auth.user?.id],
    queryFn: async (): Promise<MyTakedownNotice[]> => {
      const { data, error } = await (supabase as any).rpc('get_my_takedown_notices')
      if (error) throw error
      return (data as MyTakedownNotice[]) ?? []
    },
    enabled: !!auth.user?.id,
  })
}

/** The accused author's answer. Restoration remains a moderator's decision. */
export function useFileCounterNotice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ noticeId, statement }: { noticeId: string; statement: string }) => {
      const { data, error } = await (supabase as any).rpc('file_counter_notice', {
        p_notice_id: noticeId,
        p_statement: statement,
      })
      if (error) throw error
      if (data?.ok !== true) throw new Error(String(data?.reason ?? 'failed'))
      return data as { ok: true; reference: string }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-takedowns'] })
      void queryClient.invalidateQueries({ queryKey: ['takedowns'] })
    },
  })
}
