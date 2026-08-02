import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Feedback, FeedbackStatus } from '../types'

// User: own submitted feedback
export function useMyFeedback(userId: string | undefined) {
  const fetchFeedback = async (uid: string): Promise<Feedback[]> => {
    const { data, error } = await (supabase as any)
      .from('feedback')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('feedback', 'mine', userId),
    queryFn: () => fetchFeedback(userId as string),
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
      const { data, error } = await (supabase as any)
        .from('feedback')
        .insert(feedbackData)
        .select()
        .single()

      if (error) throw error
      return data
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

// Admin: triage (status + note)
export function useUpdateFeedback() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      feedbackId,
      updates,
    }: {
      feedbackId: string
      updates: { status?: FeedbackStatus; admin_note?: string }
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

  const updateFeedback = (feedbackId: string, updates: { status?: FeedbackStatus; admin_note?: string }) =>
    mutation.mutateAsync({ feedbackId, updates })

  return { updateFeedback, loading: mutation.isPending, error: mutation.error }
}
