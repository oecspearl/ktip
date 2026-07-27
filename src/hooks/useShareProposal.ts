import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Proposal } from '../types'

// --- Share / unshare a proposal ---

export function useShareProposal() {
  const queryClient = useQueryClient()

  const invalidate = (proposalId: string) => {
    queryClient.invalidateQueries({ queryKey: keys.detail('proposals', proposalId) })
    queryClient.invalidateQueries({ queryKey: keys.list('proposals') })
  }

  const enableMutation = useMutation({
    mutationFn: async (proposalId: string): Promise<string> => {
      const token = crypto.randomUUID()
      const { error } = await supabase
        .from('proposals')
        .update({ share_token: token } as any)
        .eq('id', proposalId)

      if (error) throw error
      return token
    },
    onSuccess: (_data, proposalId) => invalidate(proposalId),
  })

  const disableMutation = useMutation({
    mutationFn: async (proposalId: string): Promise<void> => {
      const { error } = await supabase
        .from('proposals')
        .update({ share_token: null } as any)
        .eq('id', proposalId)

      if (error) throw error
    },
    onSuccess: (_data, proposalId) => invalidate(proposalId),
  })

  const enableSharing = async (proposalId: string): Promise<string | null> => {
    try {
      return await enableMutation.mutateAsync(proposalId)
    } catch {
      return null
    }
  }

  const disableSharing = async (proposalId: string): Promise<boolean> => {
    try {
      await disableMutation.mutateAsync(proposalId)
      return true
    } catch {
      return false
    }
  }

  return {
    enableSharing,
    disableSharing,
    loading: enableMutation.isPending || disableMutation.isPending,
    error: enableMutation.error || disableMutation.error,
  }
}

// --- Fetch a proposal by share token (public, no auth required) ---

export function useSharedProposal(token: string | undefined) {
  const fetchShared = async (t: string): Promise<Proposal | null> => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('share_token', t)
      .single()

    if (error) return null
    return data as Proposal
  }

  const query = useQuery({
    queryKey: keys.sub('proposals', 'shared', token),
    queryFn: () => fetchShared(token as string),
    enabled: !!token,
  })

  return { proposal: query.data, refetch: query.refetch }
}
