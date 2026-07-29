import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
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

  const query = useQuery({
    queryKey: keys.list('whiteboards', { search: filters?.search }),
    queryFn: fetchWhiteboards,
  })

  return { whiteboards: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSharedWhiteboards() {
  const fetchShared = async (): Promise<(Whiteboard & { permission: string })[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: shares, error: sharesError } = await (supabase
      .from('whiteboard_shares') as any)
      .select('whiteboard_id, permission')
      .eq('shared_with', user.id)
      // A pending invitation is not access yet — it lives in /invitations.
      .eq('status', 'accepted')

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

  const query = useQuery({
    queryKey: keys.sub('whiteboards', 'shared'),
    queryFn: fetchShared,
  })

  return { whiteboards: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useWhiteboardPermission(id: string | undefined) {
  const fetchPermission = async (whiteboardId: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await (supabase
      .from('whiteboard_shares') as any)
      .select('permission')
      .eq('whiteboard_id', whiteboardId)
      .eq('shared_with', user.id)
      // Edit rights only exist once the invitation has been accepted.
      .eq('status', 'accepted')
      .maybeSingle()

    if (error || !data) return null
    return data.permission
  }

  const query = useQuery({
    queryKey: keys.sub('whiteboards', 'permission', id),
    queryFn: () => fetchPermission(id as string),
    enabled: !!id,
  })

  return { permission: query.data }
}

export function useWhiteboard(id: string | undefined) {
  const fetchWhiteboard = async (whiteboardId: string): Promise<Whiteboard | null> => {
    const { data, error } = await (supabase
      .from('whiteboards') as any)
      .select('*')
      .eq('id', whiteboardId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('whiteboards', id),
    queryFn: () => fetchWhiteboard(id as string),
    enabled: !!id,
  })

  return { whiteboard: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateWhiteboard() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (wbData: { title?: string; snapshot?: Record<string, any> }) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('whiteboards') })
    },
  })

  return { createWhiteboard: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateWhiteboard() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      whiteboardId,
      updates,
    }: {
      whiteboardId: string
      updates: { title?: string; snapshot?: Record<string, any> }
    }) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('whiteboards') })
    },
  })

  const updateWhiteboard = (
    whiteboardId: string,
    updates: { title?: string; snapshot?: Record<string, any> }
  ) => mutation.mutateAsync({ whiteboardId, updates })

  return { updateWhiteboard, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteWhiteboard() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (whiteboardId: string) => {
      const { error } = await (supabase
        .from('whiteboards') as any)
        .delete()
        .eq('id', whiteboardId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('whiteboards') })
    },
  })

  return { deleteWhiteboard: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
