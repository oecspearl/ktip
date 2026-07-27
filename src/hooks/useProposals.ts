import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { Proposal, ProposalType, ProposalStatus } from '../types'

// --- List proposals for current user ---

export function useProposals(filters?: {
  type?: ProposalType
  status?: ProposalStatus
  search?: string
}) {
  const fetchProposals = async (): Promise<Proposal[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    let query = supabase
      .from('proposals')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (filters?.type) {
      query = query.eq('type', filters.type as any)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status as any)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.ilike('title', `%${sanitized}%`)
      }
    }

    const { data, error } = await query
    if (error) throw error
    return (data as Proposal[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('proposals', filters),
    queryFn: fetchProposals,
  })

  return { proposals: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// --- List proposals for a specific project ---

export function useProjectProposals(projectId: string | undefined) {
  const fetchProjectProposals = async (pid: string): Promise<Proposal[]> => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('project_id', pid)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data as Proposal[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('proposals', 'project', projectId),
    queryFn: () => fetchProjectProposals(projectId as string),
    enabled: !!projectId,
  })

  return { proposals: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// --- Get single proposal ---

export function useProposal(id: string | undefined) {
  const fetchProposal = async (proposalId: string): Promise<Proposal | null> => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single()

    if (error) throw error
    return data as Proposal
  }

  const query = useQuery({
    queryKey: keys.detail('proposals', id),
    queryFn: () => fetchProposal(id as string),
    enabled: !!id,
  })

  return { proposal: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// --- Create proposal ---

export function useCreateProposal() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (proposalData: {
      type: ProposalType
      title: string
      proposal_data?: Record<string, any>
      current_step?: number
      project_id?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const insertData: Record<string, any> = {
        user_id: user.id,
        type: proposalData.type as any,
        title: proposalData.title,
        status: 'draft' as any,
        proposal_data: proposalData.proposal_data || {},
        current_step: proposalData.current_step || 0,
      }
      if (proposalData.project_id) {
        insertData.project_id = proposalData.project_id
      }

      const { data, error } = await supabase
        .from('proposals')
        .insert(insertData as any)
        .select()
        .single()

      if (error) throw error
      return data as Proposal
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('proposals') })
    },
  })

  return { createProposal: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

// --- Update proposal ---

export function useUpdateProposal() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      proposalId,
      updates,
    }: {
      proposalId: string
      updates: {
        title?: string
        status?: ProposalStatus
        proposal_data?: Record<string, any>
        current_step?: number
      }
    }) => {
      const updateData: Record<string, any> = { ...updates, updated_at: new Date().toISOString() }
      if (updates.status) updateData.status = updates.status as any

      const { data, error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId)
        .select()
        .single()

      if (error) throw error
      return data as Proposal
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('proposals') })
    },
  })

  const updateProposal = (
    proposalId: string,
    updates: {
      title?: string
      status?: ProposalStatus
      proposal_data?: Record<string, any>
      current_step?: number
    }
  ) => mutation.mutateAsync({ proposalId, updates })

  return { updateProposal, loading: mutation.isPending, error: mutation.error }
}

// --- Delete proposal ---

export function useDeleteProposal() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', proposalId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('proposals') })
    },
  })

  return { deleteProposal: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
