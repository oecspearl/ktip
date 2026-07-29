import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { SubmissionReceipt } from '../types'

/**
 * The signed-in user's copies of everything they have submitted — grant
 * applications, event registrations and grievance reports. Rows are written
 * by DB triggers and are read-only; RLS scopes them to the owner.
 */
export function useSubmissionReceipts(userId: string | undefined, limit?: number) {
  const query = useQuery({
    queryKey: keys.list('submissions', { userId, limit }),
    enabled: !!userId,
    queryFn: async (): Promise<SubmissionReceipt[]> => {
      let request = (supabase as any)
        .from('submission_receipts')
        .select('*')
        .eq('user_id', userId as string)
        .order('submitted_at', { ascending: false })

      if (limit) request = request.limit(limit)

      const { data, error } = await request
      if (error) throw error
      return (data as SubmissionReceipt[]) || []
    },
  })

  return { receipts: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSubmissionReceipt(id: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail('submissions', id),
    enabled: !!id,
    queryFn: async (): Promise<SubmissionReceipt | null> => {
      const { data, error } = await (supabase as any)
        .from('submission_receipts')
        .select('*')
        .eq('id', id as string)
        .maybeSingle()

      if (error) throw error
      return (data as SubmissionReceipt) || null
    },
  })

  return { receipt: query.data, loading: query.isPending, error: query.error }
}

/**
 * Looks up the receipt for a source row (e.g. a grant application id) so the
 * submit flow can redirect straight to the copy the trigger just wrote.
 */
export async function fetchReceiptBySource(
  sourceTable: string,
  sourceId: string
): Promise<SubmissionReceipt | null> {
  const { data, error } = await (supabase as any)
    .from('submission_receipts')
    .select('*')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle()

  if (error) throw error
  return (data as SubmissionReceipt) || null
}
