import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { CourseEnrollmentResult } from '../types'

/** Enrolls the signed-in user in a Virtual Campus course via /api/ktip/enroll. */
export function useEnrollInCourse() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (courseId: string): Promise<CourseEnrollmentResult> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('You must be signed in to enroll.')

      const res = await fetch('/api/ktip/enroll', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ course_id: courseId }),
      })

      const body = await res.json().catch(() => ({ error: 'Enrollment failed' }))
      if (!res.ok) throw new Error(body.error || 'Enrollment failed')
      return body as CourseEnrollmentResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.list('ktip-enrollments') })
    },
  })

  return {
    enroll: mutation.mutateAsync,
    enrolling: mutation.isPending,
    error: mutation.error,
  }
}
