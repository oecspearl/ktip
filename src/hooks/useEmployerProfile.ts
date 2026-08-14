import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  Employer,
  EmployerPortfolioItem,
  PublicEmployer,
  PublicEmployerSummary,
} from '../types'

/**
 * The member-facing half of `employers` (migration 081).
 *
 * Public reads go through SECURITY DEFINER functions with explicit column
 * lists rather than through the table: RLS is column-blind, and `employers`
 * carries `verification_note` (internal reviewer commentary) and
 * `document_paths` (private bucket paths) that no public page may see.
 *
 * Editing is likewise an RPC, not an UPDATE. 058 deliberately left the table
 * with no member-facing UPDATE policy so a verified row could not be rewritten
 * behind its badge; update_my_employer_profile() writes only the presentation
 * columns, leaving everything the Chamber checked untouched.
 */

const DOMAIN = 'employers'

/**
 * The business this member belongs to, whatever its verification state.
 *
 * Migration 111 moved this off a `created_by` filter and onto `my_employer()`.
 * The filter meant only the registrant could reach the org pages: an owner
 * added to `employer_members` — which is now how the Team page adds people —
 * matched nothing and saw the register-your-business screen instead.
 */
export function useMyEmployer(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'mine', userId),
    queryFn: async (): Promise<Employer | null> => {
      const { data, error } = await (supabase as any).rpc('my_employer')
      if (error) throw error
      return ((data as Employer[]) || [])[0] ?? null
    },
    enabled: !!userId,
  })

  return { employer: query.data, loading: query.isPending, error: query.error }
}

export function usePublicEmployer(slug: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail(DOMAIN, slug),
    queryFn: async (): Promise<PublicEmployer | null> => {
      const { data, error } = await (supabase as any).rpc('public_employer', { p_slug: slug })
      if (error) throw error
      return ((data as PublicEmployer[]) || [])[0] ?? null
    },
    enabled: !!slug,
  })

  return { employer: query.data, loading: query.isPending, error: query.error }
}

/** The employer card on a member's public profile. */
export function useEmployerForUser(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'for-user', userId),
    queryFn: async (): Promise<PublicEmployer | null> => {
      const { data, error } = await (supabase as any).rpc('public_employer_for_user', {
        p_user_id: userId,
      })
      if (error) throw error
      return ((data as PublicEmployer[]) || [])[0] ?? null
    },
    enabled: !!userId,
  })

  return { employer: query.data, loading: query.isPending }
}

export function usePublicEmployers(filters?: { search?: string; country?: string }) {
  const query = useQuery({
    queryKey: keys.list(DOMAIN, filters),
    queryFn: async (): Promise<PublicEmployerSummary[]> => {
      const { data, error } = await (supabase as any).rpc('list_public_employers', {
        p_search: filters?.search?.trim() || null,
        p_country: filters?.country || null,
      })
      if (error) throw error
      return (data as PublicEmployerSummary[]) || []
    },
  })

  return { employers: query.data, loading: query.isPending, error: query.error }
}

export function useEmployerPortfolio(employerId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'portfolio', employerId),
    queryFn: async (): Promise<EmployerPortfolioItem[]> => {
      const { data, error } = await (supabase as any).rpc('public_employer_portfolio', {
        p_employer_id: employerId,
      })
      if (error) throw error
      return (data as EmployerPortfolioItem[]) || []
    },
    enabled: !!employerId,
  })

  return { items: query.data, loading: query.isPending, error: query.error }
}

export type PortfolioItemInput = {
  title: string
  summary?: string | null
  description?: string | null
  image_url?: string | null
  link_url?: string | null
  client_name?: string | null
  completed_on?: string | null
  tags?: string[]
  sort_order?: number
}

export function useEmployerProfileMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
  }

  /**
   * The master switch (migration 111). Its own RPC, kept apart from
   * update_my_employer_profile for the same reason setSharing is kept apart
   * from verification: neither should be flippable by accident while editing
   * the other. A direct UPDATE would fail anyway — `employers` still has no
   * member-facing UPDATE policy.
   */
  const setMemberEngagement = useMutation({
    mutationFn: async (params: { employerId: string; allow: boolean }) => {
      const { error } = await (supabase as any).rpc('set_employer_member_engagement', {
        p_employer_id: params.employerId,
        p_allow: params.allow,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      // The switch governs the caller's own Apply buttons too.
      queryClient.invalidateQueries({ queryKey: keys.all('engagement') })
    },
  })

  const updateProfile = useMutation({
    mutationFn: async (params: {
      employerId: string
      description?: string | null
      websiteUrl?: string | null
      industry?: string | null
      logoUrl?: string | null
    }) => {
      const { error } = await (supabase as any).rpc('update_my_employer_profile', {
        p_employer_id: params.employerId,
        p_description: params.description ?? null,
        p_website_url: params.websiteUrl ?? null,
        p_industry: params.industry ?? null,
        p_logo_url: params.logoUrl ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const savePortfolioItem = useMutation({
    mutationFn: async (params: { employerId: string; id?: string; item: PortfolioItemInput }) => {
      const row = {
        employer_id: params.employerId,
        title: params.item.title,
        summary: params.item.summary || null,
        description: params.item.description || null,
        image_url: params.item.image_url || null,
        link_url: params.item.link_url || null,
        client_name: params.item.client_name || null,
        completed_on: params.item.completed_on || null,
        tags: params.item.tags || [],
        sort_order: params.item.sort_order ?? 0,
      }

      const query = params.id
        ? (supabase as any).from('employer_portfolio_items').update(row).eq('id', params.id)
        : (supabase as any).from('employer_portfolio_items').insert(row)

      const { error } = await query
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deletePortfolioItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('employer_portfolio_items')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    updateProfile: updateProfile.mutateAsync,
    savingProfile: updateProfile.isPending,
    setMemberEngagement: setMemberEngagement.mutateAsync,
    savingEngagement: setMemberEngagement.isPending,
    savePortfolioItem: savePortfolioItem.mutateAsync,
    savingItem: savePortfolioItem.isPending,
    deletePortfolioItem: deletePortfolioItem.mutateAsync,
  }
}
