import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
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

  const filterKey = () => JSON.stringify({ search: filters?.search })
  const [documents, { refetch }] = createResource(filterKey, fetchDocuments)

  return { documents, refetch }
}

export function useSharedDocuments() {
  const fetchShared = async (): Promise<Document[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Get document IDs shared with this user
    const { data: shares, error: sharesError } = await (supabase
      .from('document_shares') as any)
      .select('document_id')
      .eq('shared_with', user.id)

    if (sharesError || !shares || shares.length === 0) return []

    const docIds = shares.map((s: any) => s.document_id)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .in('id', docIds)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const [documents, { refetch }] = createResource(fetchShared)

  return { documents, refetch }
}

export function useDocument(id: () => string | undefined) {
  const fetchDocument = async (documentId: string): Promise<Document | null> => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (error) throw error
    return data as any
  }

  const [document, { refetch }] = createResource(id, fetchDocument)

  return { document, refetch }
}

export function useCreateDocument() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createDocument = async (docData: {
    title?: string
    content?: string
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('documents')
        .insert({
          title: docData.title || 'Untitled Document',
          content: docData.content || '',
          owner_id: user.id,
        } as any)
        .select()
        .single()

      if (error) throw error
      return data as any as Document
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createDocument, loading, error }
}

export function useUpdateDocument() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateDocument = async (
    documentId: string,
    updates: { title?: string; content?: string }
  ) => {
    setLoading(true)
    setError(null)

    try {
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
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateDocument, loading, error }
}

export function useDeleteDocument() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteDocument = async (documentId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteDocument, loading, error }
}
