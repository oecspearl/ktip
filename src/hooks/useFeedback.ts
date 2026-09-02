import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Feedback, FeedbackStatus } from '../types'

// User: own submitted feedback
//
// Read through the my_feedback() RPC rather than the table. 127 took the
// reporter's SELECT on `feedback` away — RLS is row-level, so any policy that
// let them read their own row handed them `admin_note` with it. The function
// projects the member-facing columns only.
export function useMyFeedback(userId: string | undefined) {
  const fetchFeedback = async (): Promise<Feedback[]> => {
    const { data, error } = await (supabase as any).rpc('my_feedback')

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('feedback', 'mine', userId),
    queryFn: fetchFeedback,
    enabled: !!userId,
  })

  return { feedback: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateFeedback() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (feedbackData: {
      user_id: string | null
      category: string
      subject: string
      message: string
      /** 1-5 stars, or null when the report is not a review */
      rating?: number | null
      /** Route the report was filed from, captured automatically */
      page_path?: string | null
      /** Object key in the private feedback-screenshots bucket */
      screenshot_path?: string | null
    }) => {
      // No .select() on the way out: PostgREST applies the SELECT policy to
      // RETURNING, and 127 made `feedback` admin-read-only. Asking for the row
      // back would turn every member's report into a 42501. Nothing reads the
      // return value.
      const { error } = await (supabase as any).from('feedback').insert(feedbackData)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('feedback') })
    },
  })

  return { createFeedback: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

// Admin: all feedback with filters
export function useAdminFeedback(filters?: { status?: string; category?: string }) {
  const fetchFeedback = async (): Promise<Feedback[]> => {
    let query = (supabase as any)
      .from('feedback')
      .select('*, user:profiles!user_id(*)')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('feedback', filters),
    queryFn: fetchFeedback,
  })

  return { feedback: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** What triage may write. `admin_reply` and its two stamps move together — a
 *  reply with no date on it cannot be shown to the reporter honestly. */
export interface FeedbackTriageUpdate {
  status?: FeedbackStatus
  admin_note?: string
  admin_reply?: string
  replied_at?: string
  replied_by?: string
}

// Admin: triage (status + notes + reply)
export function useUpdateFeedback() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      feedbackId,
      updates,
    }: {
      feedbackId: string
      updates: FeedbackTriageUpdate
    }) => {
      const { data, error } = await (supabase as any)
        .from('feedback')
        .update(updates)
        .eq('id', feedbackId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('feedback') })
    },
  })

  const updateFeedback = (feedbackId: string, updates: FeedbackTriageUpdate) =>
    mutation.mutateAsync({ feedbackId, updates })

  return { updateFeedback, loading: mutation.isPending, error: mutation.error }
}
