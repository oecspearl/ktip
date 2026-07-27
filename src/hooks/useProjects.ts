import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Project, ProjectComment } from '../types'

export function useProjects(filters?: {
  category?: string
  phase?: string
  search?: string
  climateAction?: boolean
}) {
  const fetchProjects = async (): Promise<Project[]> => {
    let query = supabase
      .from('projects')
      .select(`
        *,
        owner:profiles(*)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    if (filters?.phase) {
      query = query.eq('phase', filters.phase as any)
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

    query = query.limit(50)

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const [projects, { refetch }] = createResource(fetchProjects)

  return { projects, refetch }
}

export function useFeaturedProjects() {
  const fetchFeatured = async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        owner:profiles(*)
      `)
      .eq('is_public', true)
      .eq('is_featured', true as any)
      .order('created_at', { ascending: false })
      .limit(6)

    // Gracefully degrade — if column doesn't exist yet, return empty array
    if (error) {
      console.warn('useFeaturedProjects error (column may not exist yet):', error.message)
      return []
    }
    return (data as any[]) || []
  }

  const [projects, { refetch }] = createResource(fetchFeatured)

  return { projects, refetch }
}

export function useProject(id: () => string | undefined) {
  const fetchProject = async (projectId: string): Promise<Project | null> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        owner:profiles(*)
      `)
      .eq('id', projectId)
      .single()

    if (error) throw error
    return data as any
  }

  const [project, { refetch }] = createResource(id, fetchProject)

  return { project, refetch }
}

export function useCreateProject() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createProject = async (projectData: {
    title: string
    description?: string
    category?: string
    phase?: string
    hashtags?: string[]
    is_public?: boolean
    owner_id: string
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...projectData,
          phase: (projectData.phase || 'concept') as any,
          is_public: projectData.is_public ?? true,
          hashtags: projectData.hashtags || [],
        } as any)
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

  return { createProject, loading, error }
}

export function useUpdateProject() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateProject = async (
    projectId: string,
    updates: Partial<Project>
  ) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('projects')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
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

  return { updateProject, loading, error }
}

export function useDeleteProject() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteProject = async (projectId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteProject, loading, error }
}

// Like / Unlike hooks
export function useProjectLike() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const likeProject = async (projectId: string, userId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('project_likes')
        .insert({ project_id: projectId, user_id: userId })
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const unlikeProject = async (projectId: string, userId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('project_likes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const checkLike = async (projectId: string, userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('project_likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return !!data
  }

  const getLikeCount = async (projectId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('project_likes')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
    if (error) throw error
    return count || 0
  }

  return { likeProject, unlikeProject, checkLike, getLikeCount, loading, error }
}

// Comments hooks
export function useProjectComments(projectId: () => string | undefined) {
  const fetchComments = async (pid: string): Promise<ProjectComment[]> => {
    const { data, error } = await supabase
      .from('project_comments')
      .select('*, author:profiles(*)')
      .eq('project_id', pid)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as any[]) || []
  }

  const [comments, { refetch }] = createResource(projectId, fetchComments)
  return { comments, refetch }
}

export function useCreateProjectComment() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createComment = async (data: {
    project_id: string
    user_id: string
    content: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const { data: comment, error } = await supabase
        .from('project_comments')
        .insert(data)
        .select('*, author:profiles(*)')
        .single()
      if (error) throw error
      return comment
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteComment = async (commentId: string) => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('project_comments')
        .delete()
        .eq('id', commentId)
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createComment, deleteComment, loading, error }
}
