import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EmployerMemberRole, EmployerRosterEntry } from '../types'

/**
 * The organisation's team (migration 111).
 *
 * Reads go through `employer_roster()` rather than the table: the page needs
 * names and avatars, and `profiles` is separately RLS'd. Writes go through
 * RPCs, not a policy — "not the last owner" and "only an owner grants
 * ownership" are counts over sibling rows, which WITH CHECK cannot express.
 *
 * Until 111 the table was unreadable from a browser at all: 058's SELECT policy
 * embedded a self-referencing EXISTS and raised 42P17.
 */

const DOMAIN = 'employer-members'

export function useEmployerRoster(employerId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'roster', employerId),
    queryFn: async (): Promise<EmployerRosterEntry[]> => {
      const { data, error } = await (supabase as any).rpc('employer_roster', {
        p_employer_id: employerId,
      })
      if (error) throw error
      return (data as EmployerRosterEntry[]) || []
    },
    enabled: !!employerId,
  })

  return { roster: query.data ?? [], loading: query.isPending, error: query.error }
}

export function useEmployerMemberMutations() {
  const queryClient = useQueryClient()

  // Removing or re-roling yourself changes your OWN verdict, so the engagement
  // query has to go too — otherwise the Apply button stays wrong until reload.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    queryClient.invalidateQueries({ queryKey: keys.all('engagement') })
    queryClient.invalidateQueries({ queryKey: keys.all('employers') })
  }

  const addMember = useMutation({
    mutationFn: async (params: {
      employerId: string
      userId: string
      role?: EmployerMemberRole
    }) => {
      const { error } = await (supabase as any).rpc('add_employer_member', {
        p_employer_id: params.employerId,
        p_user_id: params.userId,
        p_role: params.role ?? 'recruiter',
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setMemberRole = useMutation({
    mutationFn: async (params: { memberId: string; role: EmployerMemberRole }) => {
      const { error } = await (supabase as any).rpc('set_employer_member_role', {
        p_member_id: params.memberId,
        p_role: params.role,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any).rpc('remove_employer_member', {
        p_member_id: memberId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    addMember: addMember.mutateAsync,
    addingMember: addMember.isPending,
    setMemberRole: setMemberRole.mutateAsync,
    removeMember: removeMember.mutateAsync,
  }
}
