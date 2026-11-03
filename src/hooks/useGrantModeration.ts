import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { PROFILE_CHIP } from '../lib/profile-columns'
import { memberPath } from '../lib/slug'
import { emailAdminNote } from './useAdminNotes'
import type { Grant, Profile } from '../types'

/** The organisation a call was posted for, as much as the console shows. */
export interface GrantEmployerChip {
  id: string
  slug: string
  legal_name: string
  trading_name: string | null
}

/** A funding call with who posted it and for which organisation. */
export interface AdminGrantRow extends Grant {
  poster: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'country' | 'roles'> | null
  employer: GrantEmployerChip | null
}

/**
 * Both embeds carry an explicit FK hint. grants has one FK to profiles today
 * (created_by, 077) and one to employers (employer_id, 111); 181 deliberately
 * pointed suspended_by at auth.users so the profiles embed stays unambiguous,
 * but the hint keeps it that way if somebody adds a second one later.
 */
export const ADMIN_GRANT_SELECT = `*, poster:profiles!created_by(${PROFILE_CHIP}), employer:employers!employer_id(id, slug, legal_name, trading_name)`

/** Every funding call, for /admin/grants. Suspended ones included (grant:manage reads them). */
export function useAdminGrants() {
  const query = useQuery({
    queryKey: keys.list('admin-grants'),
    queryFn: async (): Promise<AdminGrantRow[]> => {
      const { data, error } = await (supabase as any)
        .from('grants')
        .select(ADMIN_GRANT_SELECT)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data as AdminGrantRow[]) ?? []
    },
  })

  return { grants: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** The name the console shows for whoever is behind a call. */
export function grantOrganisationName(employer: GrantEmployerChip | null | undefined): string | null {
  if (!employer) return null
  return employer.trading_name || employer.legal_name || null
}

/** Where "the posting organisation" links to: the org page, else the poster's page. */
export function grantOwnerHref(row: {
  employer?: GrantEmployerChip | null
  poster?: { id: string; username?: string | null } | null
}): string | null {
  if (row.employer?.slug) return `/org/${row.employer.slug}`
  if (row.poster) return memberPath(row.poster)
  return null
}

/**
 * Suspend (with a reason) or restore a call through set_grant_suspension()
 * (181). From 182 the reason is filed as a note to the poster, and the note's
 * id comes back so it can be emailed.
 */
export function useSetGrantSuspension() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      grantId,
      suspended,
      reason,
    }: {
      grantId: string
      suspended: boolean
      reason?: string
    }) => {
      const { data, error } = await (supabase as any).rpc('set_grant_suspension', {
        p_grant: grantId,
        p_suspended: suspended,
        p_reason: reason ?? null,
      })
      if (error) throw error
      return (data ?? {}) as { ok?: boolean; changed?: boolean; note_id?: string | null }
    },
    onSuccess: (result) => {
      if (result.note_id) emailAdminNote(result.note_id)
      queryClient.invalidateQueries({ queryKey: keys.all('admin-grants') })
      queryClient.invalidateQueries({ queryKey: keys.all('grants') })
      queryClient.invalidateQueries({ queryKey: keys.all('admin-notes') })
    },
  })

  const setSuspension = (grantId: string, suspended: boolean, reason?: string) =>
    mutation.mutateAsync({ grantId, suspended, reason })

  return { setSuspension, loading: mutation.isPending, error: mutation.error }
}
