import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { SharePermission, Snippet, SnippetLanguage } from '../types'

/** Snippets the current user owns. */
export function useSnippets(filters?: { search?: string }) {
  const fetchSnippets = async (): Promise<Snippet[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    let query = (supabase.from('snippets') as any)
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) query = query.ilike('title', `%${sanitized}%`)
    }

    const { data, error } = await query.limit(50)
    if (error) throw error
    return (data as Snippet[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('snippets', { search: filters?.search }),
    queryFn: fetchSnippets,
  })

  return { snippets: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Snippets shared with the current user and accepted by them. */
export function useSharedSnippets() {
  const fetchShared = async (): Promise<Snippet[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: shares, error: sharesError } = await (supabase.from('snippet_shares') as any)
      .select('snippet_id')
      .eq('shared_with', user.id)
      .eq('status', 'accepted')

    if (sharesError || !shares || shares.length === 0) return []

    const { data, error } = await (supabase.from('snippets') as any)
      .select('*')
      .in('id', shares.map((s: any) => s.snippet_id))
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data as Snippet[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('snippets', 'shared'),
    queryFn: fetchShared,
  })

  return { snippets: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSnippet(id: string | undefined) {
  const fetchSnippet = async (snippetId: string): Promise<Snippet | null> => {
    const { data, error } = await (supabase.from('snippets') as any)
      .select('*')
      .eq('id', snippetId)
      .single()

    if (error) throw error
    return data as Snippet
  }

  const query = useQuery({
    queryKey: keys.detail('snippets', id),
    queryFn: () => fetchSnippet(id as string),
    enabled: !!id,
  })

  return { snippet: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * The caller's permission on a snippet they don't own — mirrors
 * useWhiteboardPermission. Null means no accepted share exists.
 */
export function useSnippetPermission(id: string | undefined) {
  const fetchPermission = async (snippetId: string): Promise<SharePermission | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await (supabase.from('snippet_shares') as any)
      .select('permission')
      .eq('snippet_id', snippetId)
      .eq('shared_with', user.id)
      .eq('status', 'accepted')
      .maybeSingle()

    if (error) throw error
    return (data?.permission as SharePermission) ?? null
  }

  const query = useQuery({
    queryKey: keys.sub('snippets', 'permission', id),
    queryFn: () => fetchPermission(id as string),
    enabled: !!id,
  })

  return { permission: query.data ?? null, loading: query.isPending, error: query.error }
}

export function useCreateSnippet() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: { title?: string; language: SnippetLanguage; content?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(t`Not authenticated`)

      const { data, error } = await (supabase.from('snippets') as any)
        .insert({
          title: input.title || t`Untitled Snippet`,
          language: input.language,
          content: input.content || '',
          owner_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data as Snippet
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all('snippets') }),
  })

  return { createSnippet: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateSnippet() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      snippetId,
      updates,
    }: {
      snippetId: string
      updates: { title?: string; language?: SnippetLanguage; content?: string }
    }) => {
      const { data, error } = await (supabase.from('snippets') as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', snippetId)
        .select()
        .single()

      if (error) throw error
      return data as Snippet
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all('snippets') }),
  })

  const updateSnippet = (
    snippetId: string,
    updates: { title?: string; language?: SnippetLanguage; content?: string }
  ) => mutation.mutateAsync({ snippetId, updates })

  return { updateSnippet, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteSnippet() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (snippetId: string) => {
      const { error } = await (supabase.from('snippets') as any).delete().eq('id', snippetId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all('snippets') }),
  })

  return { deleteSnippet: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
