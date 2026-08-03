import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { Document } from '../types'

export function useDocuments(filters?: { search?: string }) {
  const fetchDocuments = async (): Promise<Document[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    let query = supabase
      .from('documents')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.ilike('title', `%${sanitized}%`)
      }
    }

    query = query.limit(50)

    const { data, error } = await query
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('documents', { search: filters?.search }),
    queryFn: fetchDocuments,
  })

  return { documents: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** A document shared with me, carrying the share's own permission. */
export type SharedDocument = Document & { share_permission: 'view' | 'edit' }

export function useSharedDocuments() {
  const fetchShared = async (): Promise<SharedDocument[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Get document IDs shared with this user. The permission comes along: the
    // list used to label every shared row "View only" regardless, which was
    // wrong for anyone actually granted edit.
    const { data: shares, error: sharesError } = await (supabase
      .from('document_shares') as any)
      .select('document_id, permission')
      .eq('shared_with', user.id)
      // A pending invitation is not access yet — it lives in /invitations.
      .eq('status', 'accepted')

    if (sharesError || !shares || shares.length === 0) return []

    const permissionByDoc = new Map<string, 'view' | 'edit'>(
      shares.map((s: any) => [s.document_id as string, (s.permission || 'view') as 'view' | 'edit'])
    )
    const docIds = shares.map((s: any) => s.document_id)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .in('id', docIds)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return ((data as any[]) || []).map((doc) => ({
      ...doc,
      share_permission: permissionByDoc.get(doc.id) ?? 'view',
    }))
  }

  const query = useQuery({
    queryKey: keys.sub('documents', 'shared'),
    queryFn: fetchShared,
  })

  return { documents: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useDocument(id: string | undefined) {
  const fetchDocument = async (documentId: string): Promise<Document | null> => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('documents', id),
    queryFn: () => fetchDocument(id as string),
    enabled: !!id,
  })

  return { document: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * The caller's permission on a document they don't own. Null means no accepted
 * share exists. Documents only gained shared-edit in migration 053; before
 * that every sharee was read-only.
 */
export function useDocumentPermission(id: string | undefined) {
  const fetchPermission = async (documentId: string): Promise<'view' | 'edit' | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await (supabase.from('document_shares') as any)
      .select('permission')
      .eq('document_id', documentId)
      .eq('shared_with', user.id)
      .eq('status', 'accepted')
      .maybeSingle()

    if (error || !data) return null
    return data.permission
  }

  const query = useQuery({
    queryKey: keys.sub('documents', 'permission', id),
    queryFn: () => fetchPermission(id as string),
    enabled: !!id,
  })

  return { permission: query.data ?? null, loading: query.isPending, error: query.error }
}

export function useCreateDocument() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (docData: { title?: string; content?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(t`Not authenticated`)

      const { data, error } = await supabase
        .from('documents')
        .insert({
          title: docData.title || t`Untitled Document`,
          content: docData.content || '',
          owner_id: user.id,
        } as any)
        .select()
        .single()

      if (error) throw error
      return data as any as Document
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('documents') })
    },
  })

  return { createDocument: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      documentId,
      updates,
    }: {
      documentId: string
      updates: { title?: string; content?: string }
    }) => {
      const { data, error } = await (supabase
        .from('documents') as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .select()
        .single()

      if (error) throw error
      return data as any as Document
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('documents') })
    },
  })

  const updateDocument = (documentId: string, updates: { title?: string; content?: string }) =>
    mutation.mutateAsync({ documentId, updates })

  return { updateDocument, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('documents') })
    },
  })

  return { deleteDocument: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
