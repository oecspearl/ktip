import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Profile, GrantApplication, GrantApplicationStatus, UserRole } from '../types'

// ============================================================
// Dashboard Stats
// ============================================================

export interface AdminStats {
  userCount: number
  eventCount: number
  grantCount: number
  applicationCount: number
  postCount: number
  climateProjectCount: number
  climateEventCount: number
  climateGrantCount: number
}

export function useAdminStats() {
  const fetchStats = async (): Promise<AdminStats> => {
    // Climate queries may fail with 400 if is_climate_action column doesn't exist yet
    const climateFallback = { count: 0, error: true, data: null }

    const [users, events, grants, applications, posts, climateProjects, climateEvents, climateGrants] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('grants').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('grant_applications').select('*', { count: 'exact', head: true }),
      supabase.from('forum_posts').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('is_climate_action', true)
        .then((r) => r, () => climateFallback),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('is_climate_action', true)
        .then((r) => r, () => climateFallback),
      supabase.from('grants').select('*', { count: 'exact', head: true }).eq('is_climate_action', true)
        .then((r) => r, () => climateFallback),
    ])

    return {
      userCount: users.count || 0,
      eventCount: events.count || 0,
      grantCount: grants.count || 0,
      applicationCount: applications.count || 0,
      postCount: posts.count || 0,
      climateProjectCount: climateProjects.error ? 0 : (climateProjects.count || 0),
      climateEventCount: climateEvents.error ? 0 : (climateEvents.count || 0),
      climateGrantCount: climateGrants.error ? 0 : (climateGrants.count || 0),
    }
  }

  const [stats, { refetch }] = createResource(fetchStats)

  return { stats, refetch }
}

// ============================================================
// User Management
// ============================================================

export function useAdminUsers(filters?: {
  search?: string
  role?: string
  verified?: string
}) {
  const filterKey = () => JSON.stringify({
    search: filters?.search,
    role: filters?.role,
    verified: filters?.verified,
  })

  const fetchUsers = async (_key: string): Promise<Profile[]> => {
    let query = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.ilike('display_name', `%${sanitized}%`)
      }
    }

    if (filters?.role) {
      query = query.contains('roles', [filters.role])
    }

    if (filters?.verified === 'true') {
      query = query.eq('is_verified', true)
    } else if (filters?.verified === 'false') {
      query = query.eq('is_verified', false)
    }

    const { data, error } = await query

    if (error) throw error
    return (data as Profile[]) || []
  }

  const [users, { refetch }] = createResource(filterKey, fetchUsers)

  return { users, refetch }
}

export function useAdminUserActions() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    return `Bearer ${session.access_token}`
  }

  const updateRoles = async (userId: string, roles: UserRole[]) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ roles } as any)
        .eq('id', userId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const toggleVerified = async (userId: string, verified: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: verified })
        .eq('id', userId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const createUser = async (data: {
    email: string
    password: string
    display_name?: string
    roles?: string[]
  }) => {
    setLoading(true)
    setError(null)

    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create user')
      return json.user
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (userId: string, newPassword: string) => {
    setLoading(true)
    setError(null)

    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reset password')
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteUser = async (userId: string) => {
    setLoading(true)
    setError(null)

    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete user')
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateRoles, toggleVerified, createUser, resetPassword, deleteUser, loading, error }
}

// ============================================================
// Grant Application Management
// ============================================================

export function useAdminGrantApplications(filters?: {
  grantId?: string
  status?: string
}) {
  const filterKey = () => JSON.stringify({
    grantId: filters?.grantId,
    status: filters?.status,
  })

  const fetchApplications = async (_key: string): Promise<GrantApplication[]> => {
    let query = supabase
      .from('grant_applications')
      .select(`
        *,
        grant:grants(*),
        applicant:profiles(*)
      `)
      .order('created_at', { ascending: false })

    if (filters?.grantId) {
      query = query.eq('grant_id', filters.grantId)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status as any)
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const [applications, { refetch }] = createResource(filterKey, fetchApplications)

  return { applications, refetch }
}

export function useAdminApplicationActions() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateApplicationStatus = async (applicationId: string, status: GrantApplicationStatus) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('grant_applications')
        .update({ status: status as any })
        .eq('id', applicationId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateApplicationStatus, loading, error }
}

// ============================================================
// Forum Moderation Actions
// ============================================================

export function useAdminForumActions() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const togglePin = async (postId: string, pinned: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('forum_posts')
        .update({ is_pinned: pinned })
        .eq('id', postId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { togglePin, loading, error }
}

// ============================================================
// All Forum Posts (cross-board, for admin moderation)
// ============================================================

export function useAdminAllPosts(filters?: {
  search?: string
  boardId?: string
}) {
  const filterKey = () => JSON.stringify({
    search: filters?.search,
    boardId: filters?.boardId,
  })

  const fetchPosts = async (_key: string) => {
    let query = supabase
      .from('forum_posts')
      .select('*, author:profiles(*), board:forum_boards(*)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (filters?.boardId) {
      query = query.eq('board_id', filters.boardId)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,content.ilike.%${sanitized}%`
        )
      }
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const [posts, { refetch }] = createResource(filterKey, fetchPosts)

  return { posts, refetch }
}
