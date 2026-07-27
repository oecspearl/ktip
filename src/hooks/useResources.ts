import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Resource } from '../types'

export function useResources(filters?: {
  type?: string
  category?: string
  search?: string
  climateAction?: boolean
}) {
  const filterKey = () => JSON.stringify({
    type: filters?.type,
    category: filters?.category,
    search: filters?.search,
    climateAction: filters?.climateAction,
  })

  const fetchResources = async (_key: string): Promise<Resource[]> => {
    let query = (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (filters?.type) {
      query = query.eq('resource_type', filters.type)
    }

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    if (filters?.climateAction) {
      query = query.eq('is_climate_action', true)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
        )
      }
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const [resources, { refetch }] = createResource(filterKey, fetchResources)

  return { resources, refetch }
}

export function useResource(id: () => string | undefined) {
  const fetchResource = async (resourceId: string): Promise<Resource | null> => {
    const { data, error } = await (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .eq('id', resourceId)
      .single()

    if (error) throw error
    return data as any
  }

  const [resource, { refetch }] = createResource(id, fetchResource)

  return { resource, refetch }
}

export function useAdminResources() {
  const fetchResources = async (): Promise<Resource[]> => {
    const { data, error } = await (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const [resources, { refetch }] = createResource(fetchResources)

  return { resources, refetch }
}

export function useCreateResource() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createResource = async (resourceData: {
    title: string
    description?: string
    content?: string
    resource_type: string
    category?: string
    tags?: string[]
    download_url?: string
    thumbnail_url?: string
    is_climate_action?: boolean
    is_published?: boolean
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await (supabase as any)
        .from('resources')
        .insert(resourceData)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createResource, loading, error }
}

export function useUpdateResource() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateResource = async (resourceId: string, updates: Record<string, any>) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await (supabase as any)
        .from('resources')
        .update(updates)
        .eq('id', resourceId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateResource, loading, error }
}

export function useDeleteResource() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteResource = async (resourceId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await (supabase as any)
        .from('resources')
        .delete()
        .eq('id', resourceId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteResource, loading, error }
}
