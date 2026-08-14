import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import { resolveEngagement, type EngagementSubject, type EngagementVerdict } from '../lib/engagement'
import type { EmployerEngagement } from '../types'

/**
 * Whether the signed-in member's organisation lets them apply, join or register
 * (migration 111).
 *
 * One query per session, not one per item. `my_employer_engagement()` returns
 * every organisation the user belongs to with its master switch, which is
 * enough to resolve the rule locally for all 24 cards in a list — and enough to
 * name the organisation in the refusal, which is the whole reason the client
 * evaluates this at all. The database still decides; see engagement.ts.
 */

const DOMAIN = 'engagement'

export function useMyEngagement() {
  const auth = useAuth()
  const userId = auth.user?.id

  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'mine', userId),
    queryFn: async (): Promise<EmployerEngagement[]> => {
      const { data, error } = await (supabase as any).rpc('my_employer_engagement')
      if (error) throw error
      return (data as EmployerEngagement[]) || []
    },
    enabled: !!userId,
    // Memberships and a switch change rarely, and every gated page reads this.
    staleTime: 5 * 60 * 1000,
  })

  return {
    memberships: query.data ?? EMPTY,
    loading: query.isPending && !!userId,
  }
}

const EMPTY: EmployerEngagement[] = []

/**
 * The verdict for one item. `allowed` while the memberships are still loading,
 * so a signed-in member never sees the button flicker away — the database
 * refuses the write regardless, and a false "you are blocked" is the worse of
 * the two errors to show.
 */
export function useEngagementGate(item: EngagementSubject | null | undefined): EngagementVerdict {
  const { memberships } = useMyEngagement()
  return useMemo(() => resolveEngagement(memberships, item), [memberships, item])
}

/**
 * Organisations this member may publish on behalf of, for the picker on the
 * create/edit forms. Derived from the memberships already in cache rather than
 * a second query — and role-filtered to match can_manage_employer(), so the
 * form does not offer an option the claim trigger would then refuse. The
 * registrant is included because 111 backfilled them as an owner row.
 */
export function useManagedEmployers(): { id: string; label: string }[] {
  const { memberships } = useMyEngagement()
  return useMemo(
    () =>
      memberships
        .filter((m) => m.member_role === 'owner' || m.member_role === 'admin')
        .map((m) => ({ id: m.employer_id, label: m.legal_name })),
    [memberships]
  )
}
