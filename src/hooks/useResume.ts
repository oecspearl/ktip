import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_DESIGN } from '../lib/resume-designs'
import {
  normalizeResumeData,
  RESUME_TEMPLATE_KEY,
  type Resume,
  type ResumeData,
  type ResumePath,
  type ResumeSources,
} from '../types/resume'

/** Shape of POST /api/cv/generate. */
export interface GenerateResult {
  ok?: boolean
  created?: boolean
  filled?: string[]
  skipped?: string[]
  error?: string
}

/** Shape of POST /api/vc/sync. */
export interface SyncResult {
  ok?: boolean
  courses?: number
  completed?: number
  skipped?: string[]
  coursesUnavailable?: boolean
  error?: string
}

async function postAuthed<T>(path: string): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Not signed in')

  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })

  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? 'Request failed')
  return body
}

/**
 * The signed-in member's CV.
 *
 * A member who has never arrived from the Virtual Campus used to have no
 * `resumes` row at all, and the document was rebuilt in the browser on every
 * render — so nothing was shareable at /user/:id/cv and the campus sync had nothing
 * to merge into. Now the row is created for them on first view by
 * /api/cv/generate, from their KTIP profile, projects and badges.
 */
export function useResume(template: string = RESUME_TEMPLATE_KEY) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = ['resume', user?.id, template]

  const query = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async (): Promise<Resume | null> => {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', user!.id)
        .eq('template', template)
        .maybeSingle()

      if (error) throw error
      return (data as unknown as Resume | null) ?? null
    },
  })

  /**
   * The document, repaired.
   *
   * `data = '{}'` is a reachable state — it is the table default, so any insert
   * that omits `data` produces one — and a row written before a section existed
   * is missing that key. normalizeResumeData is the single place both are fixed;
   * without it a sheet reading `data.projects.length` white-screens the page.
   */
  const data: ResumeData = normalizeResumeData(query.data?.data)

  /**
   * Persists a document.
   *
   * `touched` names the paths the user actually edited, and each one is stamped
   * 'manual' so neither generator overwrites it again. Everything else keeps
   * whatever provenance it had — a user who edits their summary has not thereby
   * taken ownership of their course list.
   *
   * The payload deliberately omits `design`: PostgREST derives the upsert's
   * DO UPDATE SET from the keys present, so leaving it out is what guarantees a
   * save cannot revert the member's chosen look to the column default. It is
   * written only by `setDesign`.
   */
  const save = useMutation({
    mutationFn: async ({
      data: next,
      touched = [],
      isPublic,
    }: {
      data: ResumeData
      touched?: ResumePath[]
      isPublic?: boolean
    }) => {
      if (!user?.id) throw new Error('Not signed in')

      const sources: ResumeSources = { ...(query.data?.sources ?? {}) }
      for (const path of touched) sources[path] = 'manual'

      const { data: saved, error } = await supabase
        .from('resumes')
        .upsert(
          {
            user_id: user.id,
            template,
            // database.ts describes `data` loosely on purpose — the document
            // shape is versioned by the `template` column, not by the table.
            data: next as unknown as Record<string, unknown>,
            sources,
            ...(isPublic === undefined ? {} : { is_public: isPublic }),
          },
          { onConflict: 'user_id,template' }
        )
        .select()
        .single()

      if (error) throw error
      return saved as unknown as Resume
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  })

  /**
   * Re-reads the learner's Virtual Campus enrollments and folds them in.
   *
   * Runs server-side because the campus API key is a platform credential that
   * can read any learner's history by email — it must never reach the browser.
   */
  const sync = useMutation({
    mutationFn: () => postAuthed<SyncResult>('/api/vc/sync'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  /**
   * Fills the CV from KTIP's own records — profile, public projects, badges,
   * institution membership.
   *
   * Server-side rather than in the browser so there is exactly one profile→CV
   * mapping (`buildKtipResumeData`). There used to be two client-side copies, a
   * `seeded()` here and a "fill blanks from my profile" in the editor, and they
   * had already drifted: one derived the skill-circle abbreviation, the other
   * hardcoded 'Sk'.
   */
  const generate = useMutation({
    mutationFn: () => postAuthed<GenerateResult>('/api/cv/generate'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  /**
   * First view creates the row.
   *
   * Safe to do unprompted because everything it writes is stamped 'ktip', the
   * lowest provenance rank: a campus sync still overwrites it and a hand edit
   * outranks both. The ref is not an optimisation — without it the effect
   * re-fires on every render until the query settles, and a 429 would make it
   * re-fire forever.
   */
  const autoGenerated = useRef<string | null>(null)
  useEffect(() => {
    if (!user?.id || query.isLoading || query.data) return
    if (autoGenerated.current === user.id) return
    autoGenerated.current = user.id
    generate.mutate()
    // `generate` is a stable mutation object; listing it would re-run this on
    // every status change, which is exactly what the ref exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, query.isLoading, query.data])

  const setPublic = useMutation({
    mutationFn: async (isPublic: boolean) => {
      if (!user?.id) throw new Error('Not signed in')
      const { data: saved, error } = await supabase
        .from('resumes')
        .update({ is_public: isPublic })
        .eq('user_id', user.id)
        .eq('template', template)
        .select()
        .single()
      if (error) throw error
      return saved as unknown as Resume
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  })

  /**
   * The chosen design.
   *
   * A targeted write, never folded into `save`: PostgREST builds the upsert's
   * DO UPDATE SET from the columns present in the payload, so `save` leaving
   * `design` out is exactly what stops a document save from resetting the look.
   * Keep it that way — never put `design` in a payload that also carries `data`.
   *
   * Still an upsert rather than an UPDATE. The auto-generate above usually wins
   * the race, but a member who picks a design in the first moment after signing
   * up would otherwise hit an UPDATE that matches no row and a .single() that
   * throws. `sources: {}` on that insert leaves every path unclaimed, so the
   * generate that lands a moment later still fills the whole document.
   */
  const setDesign = useMutation({
    mutationFn: async (design: string) => {
      if (!user?.id) throw new Error('Not signed in')

      const { data: saved, error } = await supabase
        .from('resumes')
        .upsert(
          {
            user_id: user.id,
            template,
            design,
            ...(query.data
              ? {}
              : { data: data as unknown as Record<string, unknown>, sources: {} }),
          },
          { onConflict: 'user_id,template' }
        )
        .select()
        .single()

      if (error) throw error
      return saved as unknown as Resume
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  })

  return {
    resume: query.data ?? null,
    /** Resolved by resolveDesign() at the call site — may be a stale id. */
    design: query.data?.design ?? DEFAULT_DESIGN,
    data,
    /**
     * Covers the first-view generate too. Without it the pages render a sheet
     * with nothing on it for as long as that request takes, which reads as a
     * broken CV rather than as one still being built.
     */
    isLoading: query.isLoading || (!query.data && generate.isPending),
    error: query.error as Error | null,
    exists: !!query.data,
    save,
    sync,
    generate,
    setPublic,
    setDesign,
  }
}

/**
 * A public CV at /user/:id/cv.
 *
 * Goes through the public_resume() function rather than a table select: the
 * viewer may be signed out, and the function returns nothing at all unless the
 * document is published and the owner is not suspended.
 */
export function usePublicResume(userId: string | undefined, template: string = RESUME_TEMPLATE_KEY) {
  return useQuery({
    queryKey: ['public-resume', userId, template],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_resume', {
        p_user: userId!,
        p_template: template,
      })
      if (error) throw error
      const row = data as {
        template: string
        /** Absent when the deploy is ahead of migration 078; resolveDesign copes. */
        design?: string
        data: unknown
        updated_at: string
        display_name: string | null
        avatar_url: string | null
      } | null
      if (!row) return null
      // Same repair as useResume — a published row can predate a section too.
      return { ...row, data: normalizeResumeData(row.data) }
    },
  })
}
