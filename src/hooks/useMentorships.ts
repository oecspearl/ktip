import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Profile } from '../types'

export type MentorshipStatus = 'requested' | 'active' | 'completed' | 'declined'

export interface Mentorship {
  id: string
  mentor_id: string
  mentee_id: string
  status: MentorshipStatus
  focus: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  mentor?: Profile
  mentee?: Profile
}

/**
 * Mentorship relationships (migration 133).
 *
 * `mentorship:offer` has been a permission since 063 with no schema behind it,
 * so "20 active mentorship relationships" (roadmap §14 T35) was not merely
 * unmeasured — it was unmeasurable, because the thing being counted did not
 * exist. This is the feature; the KPI is a by-product of it.
 */
export function useMyMentorships(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('mentorships', 'mine', userId),
    queryFn: async (): Promise<Mentorship[]> => {
      const { data, error } = await (supabase as any)
        .from('mentorships')
        .select('*, mentor:profiles!mentorships_mentor_id_fkey(*), mentee:profiles!mentorships_mentee_id_fkey(*)')
        .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as Mentorship[]) || []
    },
    enabled: !!userId,
  })

  const all = query.data || []

  return {
    mentorships: query.data,
    // Split at the hook rather than in each consumer: "requests waiting on me"
    // and "requests I am waiting on" are different screens and get confused
    // constantly when the caller has to work out the direction itself.
    incoming: all.filter((m) => m.status === 'requested' && m.mentor_id === userId),
    outgoing: all.filter((m) => m.status === 'requested' && m.mentee_id === userId),
    active: all.filter((m) => m.status === 'active'),
    past: all.filter((m) => m.status === 'completed' || m.status === 'declined'),
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Ask someone to mentor you.
 *
 * The direction is fixed by 133's INSERT policy: the requester is always the
 * mentee, so nobody can appoint themselves another member's mentor.
 */
export function useRequestMentorship() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: { mentorId: string; menteeId: string; focus?: string }) => {
      const { data, error } = await (supabase as any)
        .from('mentorships')
        .insert({
          mentor_id: input.mentorId,
          mentee_id: input.menteeId,
          focus: input.focus?.trim() || null,
          status: 'requested',
        })
        .select()
        .single()

      if (error) {
        // The partial unique index is the likeliest refusal by far, and
        // "duplicate key value violates unique constraint" tells a member
        // nothing about what they should do instead.
        if (error.code === '23505') {
          throw new Error('You already have a request or an active mentorship with this person.')
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('mentorships') })
    },
  })

  return { requestMentorship: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * Accept, decline, or end a mentorship.
 *
 * The accept/decline half is enforced server-side by 133's transition trigger —
 * only the mentor may move a request out of `requested`. This is the UI path,
 * not the guard.
 */
export function useUpdateMentorship() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: { id: string; status: MentorshipStatus }) => {
      const { data, error } = await (supabase as any)
        .from('mentorships')
        .update({ status: input.status })
        .eq('id', input.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('mentorships') })
    },
  })

  return { updateMentorship: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
