import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_DESIGN } from '../lib/resume-designs'
import {
  emptyResumeData,
  RESUME_TEMPLATE_KEY,
  type Resume,
  type ResumeData,
  type ResumePath,
  type ResumeSources,
} from '../types/resume'

/**
 * The signed-in member's CV.
 *
 * A member who has never arrived from the Virtual Campus has no `resumes` row
 * at all, and that is a normal state rather than an error — the query resolves
 * to null and the page offers to start one. The row is created on first save.
 */
export function useResume(template: string = RESUME_TEMPLATE_KEY) {
  const { user, profile } = useAuth()
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
   * Persists a document.
   *
   * `touched` names the paths the user actually edited, and each one is stamped
   * 'manual' so the Virtual Campus sync stops overwriting it. Everything else
   * keeps whatever provenance it had — a user who edits their summary has not
   * thereby taken ownership of their course list.
   *
   * The payload deliberately omits `design`: PostgREST derives the upsert's
   * DO UPDATE SET from the keys present, so leaving it out is what guarantees a
   * save cannot revert the member's chosen look to the column default. It is
   * written only by `setDesign`.
   */
  const save = useMutation({
    mutationFn: async ({
      data,
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
            data: data as unknown as Record<string, unknown>,
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
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('Not signed in')

      const res = await fetch('/api/vc/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      })

      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        courses?: number
        completed?: number
        skipped?: string[]
      }
      if (!res.ok) throw new Error(body.error ?? 'Sync failed')
      return body
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

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
   * It has to be an upsert rather than an UPDATE because the row usually does
   * not exist yet: `exists === false` is the normal state, and picking a design
   * is a very likely first action. An UPDATE would match nothing and .single()
   * would throw. The current in-memory document goes along for the ride so the
   * inserted row is a real CV rather than `data = {}`.
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
              : {
                  data: seeded() as unknown as Record<string, unknown>,
                  sources: {},
                }),
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
   * A usable document even before anything is stored, seeded from the profile
   * so a member who has never touched the Virtual Campus still opens a CV with
   * their own name on it rather than an empty form.
   *
   * Everything the profile actually holds is used. It has no education, work
   * history, languages or phone — those are the fields the Virtual Campus sync
   * and the editor fill in.
   */
  function seeded(): ResumeData {
    const base = emptyResumeData()
    const skills = profile?.skills ?? []
    return {
      ...base,
      profile: {
        ...base.profile,
        name: profile?.display_name ?? '',
        location: profile?.country ?? '',
        email: user?.email ?? '',
        about: profile?.bio ? [profile.bio] : [],
        role: [profile?.organization, profile?.industry].filter(Boolean).join(' · '),
      },
      skills:
        skills.length > 0 ? [{ area: 'Skills', abbr: skillAbbr(skills[0]), skills: [...skills] }] : [],
      professionalSkills: [...(profile?.open_to ?? [])],
      interests: (profile?.interests ?? []).join(' · '),
    }
  }

  /**
   * A stored row whose `data` is `{}` is reachable — it is the table default,
   * so any insert that omits `data` produces one. Keying the fallback off row
   * existence hands that empty object straight to a sheet, which reads
   * `data.profile.name` and white-screens the page. Key off the document
   * instead: no profile, no document.
   */
  const stored = query.data?.data
  const data: ResumeData = stored?.profile ? stored : seeded()

  return {
    resume: query.data ?? null,
    /** Resolved by resolveDesign() at the call site — may be a stale id. */
    design: query.data?.design ?? DEFAULT_DESIGN,
    data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    exists: !!query.data,
    save,
    sync,
    setPublic,
    setDesign,
  }
}

/** Two characters for a skill circle, matching what the VC generator derives. */
function skillAbbr(area: string): string {
  const trimmed = area.trim()
  if (trimmed === '') return '—'
  const words = trimmed.split(/\s+/)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  return trimmed.slice(0, 2).replace(/^./, (c) => c.toUpperCase())
}

/**
 * A public CV at /u/:id/cv.
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
      return (data as {
        template: string
        /** Absent when the deploy is ahead of migration 078; resolveDesign copes. */
        design?: string
        data: ResumeData
        updated_at: string
        display_name: string | null
        avatar_url: string | null
      } | null) ?? null
    },
  })
}
