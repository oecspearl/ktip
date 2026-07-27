import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { Proposal } from '../types'

// --- Share / unshare a proposal ---

export function useShareProposal() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const enableSharing = async (proposalId: string): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const token = crypto.randomUUID()
      const { error } = await supabase
        .from('proposals')
        .update({ share_token: token } as any)
        .eq('id', proposalId)

      if (error) throw error
      return token
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const disableSharing = async (proposalId: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ share_token: null } as any)
        .eq('id', proposalId)

      if (error) throw error
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      setLoading(false)
    }
  }

  return { enableSharing, disableSharing, loading, error }
}

// --- Fetch a proposal by share token (public, no auth required) ---

export function useSharedProposal(token: () => string | undefined) {
  const fetchShared = async (t: string): Promise<Proposal | null> => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('share_token', t)
      .single()

    if (error) return null
    return data as Proposal
  }

  const [proposal, { refetch }] = createResource(token, fetchShared)

  return { proposal, refetch }
}
