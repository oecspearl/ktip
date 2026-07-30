import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '../queries/keys'
import type { ExternalCourse } from '../types'

/**
 * The live OECS Virtual Campus course catalog (see ktip-catalog-api.md),
 * proxied through /api/ktip/catalog so the browser never talks to the campus
 * directly.
 *
 * Unlike useResources/useIntegrations, filters are NOT pushed into the query
 * key: the campus endpoint has no search param, and subject_area/grade_level
 * are free text set by campus course admins, not a fixed KTIP enum — so the
 * whole catalog is fetched and filtered client-side.
 */
export function useExternalCourses(filters?: {
  subjectArea?: string
  gradeLevel?: string
  search?: string
}) {
  const fetchCourses = async (): Promise<ExternalCourse[]> => {
    const res = await fetch('/api/ktip/catalog')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Could not load courses')
    const items = (body.items as ExternalCourse[]) || []
    return [...items].sort((a, b) => a.title.localeCompare(b.title))
  }

  const query = useQuery({
    queryKey: keys.list('external-courses'),
    queryFn: fetchCourses,
    // The proxy itself is uncached (see api/_lib/ktip-catalog.ts) — a course
    // removed on the campus side should disappear on the next fetch, not
    // linger because the browser held onto an old response. staleTime: 0
    // (React Query's default, spelled out for clarity) means every mount and
    // window focus revalidates.
    staleTime: 0,
  })

  const courses = useMemo(() => {
    if (!query.data) return query.data
    const search = filters?.search?.trim().toLowerCase()
    return query.data.filter((c) => {
      if (filters?.subjectArea && c.subject_area !== filters.subjectArea) return false
      if (filters?.gradeLevel && c.grade_level !== filters.gradeLevel) return false
      if (search) {
        const haystack = `${c.title} ${c.short_description ?? ''}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [query.data, filters?.subjectArea, filters?.gradeLevel, filters?.search])

  return {
    courses,
    allCourses: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
