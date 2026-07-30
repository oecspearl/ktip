import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { KtipEnrollment } from '../types'

/** Active Virtual Campus KTIP enrollments for the signed-in user. */
export function useMyKtipEnrollments() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: keys.list('ktip-enrollments'),
    queryFn: async (): Promise<KtipEnrollment[]> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return []

      const res = await fetch('/api/ktip/enrollments', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not load enrollments')
      return (body.enrollments as KtipEnrollment[]) ?? []
    },
    enabled: !!user,
    staleTime: 0,
  })

  const enrollmentsByCourseId = useMemo(() => {
    const map = new Map<string, KtipEnrollment>()
    for (const enrollment of query.data ?? []) {
      map.set(enrollment.course_id, enrollment)
    }
    return map
  }, [query.data])

  return {
    enrollments: query.data ?? [],
    enrollmentsByCourseId,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
