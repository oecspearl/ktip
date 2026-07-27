import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Whiteboard } from '../types'

export function useWhiteboards(filters?: { search?: string }) {
  const fetchWhiteboards = async (): Promise<Whiteboard[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    let query = (supabase.from('whiteboards') as any)
      .select('id, title, owner_id, created_at, updated_at')
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
  const [whiteboards, { refetch }] = createResource(filterKey, fetchWhiteboards)

  return { whiteboards, refetch }
}

export function useSharedWhiteboards() {
  const fetchShared = async (): Promise<(Whiteboard & { permission: string })[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: shares, error: sharesError } = await (supabase
      .from('whiteboard_shares') as any)
      .select('whiteboard_id, permission')
      .eq('shared_with', user.id)

    if (sharesError || !shares || shares.length === 0) return []

    const wbIds = shares.map((s: any) => s.whiteboard_id)
    const permMap = new Map(shares.map((s: any) => [s.whiteboard_id, s.permission]))

    const { data, error } = await (supabase
      .from('whiteboards') as any)
      .select('id, title, owner_id, created_at, updated_at')
      .in('id', wbIds)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return ((data as any[]) || []).map((wb: any) => ({
      ...wb,
      permission: permMap.get(wb.id) || 'view',
    }))
  }

  const [whiteboards, { refetch }] = createResource(fetchShared)

  return { whiteboards, refetch }
}

export function useWhiteboardPermission(id: () => string | undefined) {
  const fetchPermission = async (whiteboardId: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await (supabase
      .from('whiteboard_shares') as any)
      .select('permission')
      .eq('whiteboard_id', whiteboardId)
      .eq('shared_with', user.id)
      .single()

    if (error || !data) return null
    return data.permission
  }

  const [permission] = createResource(id, fetchPermission)

  return { permission }
}

export function useWhiteboard(id: () => string | undefined) {
  const fetchWhiteboard = async (whiteboardId: string): Promise<Whiteboard | null> => {
    const { data, error } = await (supabase
      .from('whiteboards') as any)
      .select('*')
      .eq('id', whiteboardId)
      .single()

    if (error) throw error
    return data as any
  }

  const [whiteboard, { refetch }] = createResource(id, fetchWhiteboard)

  return { whiteboard, refetch }
}

export function useCreateWhiteboard() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createWhiteboard = async (wbData: {
    title?: string
    snapshot?: Record<string, any>
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await (supabase
        .from('whiteboards') as any)
        .insert({
          title: wbData.title || 'Untitled Whiteboard',
          snapshot: wbData.snapshot || null,
          owner_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data as any as Whiteboard
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createWhiteboard, loading, error }
}

export function useUpdateWhiteboard() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateWhiteboard = async (
    whiteboardId: string,
    updates: { title?: string; snapshot?: Record<string, any> }
  ) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await (supabase
        .from('whiteboards') as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', whiteboardId)
        .select()
        .single()

      if (error) throw error
      return data as any as Whiteboard
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateWhiteboard, loading, error }
}

export function useDeleteWhiteboard() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteWhiteboard = async (whiteboardId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await (supabase
        .from('whiteboards') as any)
        .delete()
        .eq('id', whiteboardId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteWhiteboard, loading, error }
}
