import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
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

  const query = useQuery({
    queryKey: keys.list('admin-stats'),
    queryFn: fetchStats,
  })

  return { stats: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// ============================================================
// User Management
// ============================================================

export function useAdminUsers(filters?: {
  search?: string
  role?: string
  verified?: string
}) {
  const fetchUsers = async (): Promise<Profile[]> => {
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

  const query = useQuery({
    queryKey: keys.list('admin-users', filters),
    queryFn: fetchUsers,
  })

  return { users: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useAdminUserActions() {
  const queryClient = useQueryClient()

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    return `Bearer ${session.access_token}`
  }

  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: UserRole[] }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ roles } as any)
        .eq('id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
    },
  })

  const toggleVerifiedMutation = useMutation({
    mutationFn: async ({ userId, verified }: { userId: string; verified: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: verified })
        .eq('id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
    },
  })

  const createUserMutation = useMutation({
    mutationFn: async (data: {
      email: string
      password: string
      display_name?: string
      roles?: string[]
    }) => {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create user')
      return json.user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reset password')
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete user')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
    },
  })

  const updateRoles = (userId: string, roles: UserRole[]) =>
    updateRolesMutation.mutateAsync({ userId, roles })

  const toggleVerified = (userId: string, verified: boolean) =>
    toggleVerifiedMutation.mutateAsync({ userId, verified })

  const createUser = (data: {
    email: string
    password: string
    display_name?: string
    roles?: string[]
  }) => createUserMutation.mutateAsync(data)

  const resetPassword = (userId: string, newPassword: string) =>
    resetPasswordMutation.mutateAsync({ userId, newPassword })

  const deleteUser = (userId: string) => deleteUserMutation.mutateAsync(userId)

  return {
    updateRoles,
    toggleVerified,
    createUser,
    resetPassword,
    deleteUser,
    loading:
      updateRolesMutation.isPending ||
      toggleVerifiedMutation.isPending ||
      createUserMutation.isPending ||
      resetPasswordMutation.isPending ||
      deleteUserMutation.isPending,
    error:
      updateRolesMutation.error ||
      toggleVerifiedMutation.error ||
      createUserMutation.error ||
      resetPasswordMutation.error ||
      deleteUserMutation.error,
  }
}

// ============================================================
// Grant Application Management
// ============================================================

export function useAdminGrantApplications(filters?: {
  grantId?: string
  status?: string
}) {
  const fetchApplications = async (): Promise<GrantApplication[]> => {
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
    } else {
      // Drafts are private to the applicant until submitted
      query = query.neq('status', 'draft')
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('admin-grant-applications', filters),
    queryFn: fetchApplications,
  })

  return { applications: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useAdminApplicationActions() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      applicationId,
      status,
    }: {
      applicationId: string
      status: GrantApplicationStatus
    }) => {
      const { error } = await supabase
        .from('grant_applications')
        .update({ status: status as any })
        .eq('id', applicationId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-grant-applications') })
    },
  })

  const updateApplicationStatus = (applicationId: string, status: GrantApplicationStatus) =>
    mutation.mutateAsync({ applicationId, status })

  return { updateApplicationStatus, loading: mutation.isPending, error: mutation.error }
}

// ============================================================
// Forum Moderation Actions
// ============================================================

export function useAdminForumActions() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ postId, pinned }: { postId: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('forum_posts')
        .update({ is_pinned: pinned })
        .eq('id', postId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-forum-posts') })
    },
  })

  const togglePin = (postId: string, pinned: boolean) => mutation.mutateAsync({ postId, pinned })

  return { togglePin, loading: mutation.isPending, error: mutation.error }
}

// ============================================================
// All Forum Posts (cross-board, for admin moderation)
// ============================================================

export function useAdminAllPosts(filters?: {
  search?: string
  boardId?: string
}) {
  const fetchPosts = async () => {
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

  const query = useQuery({
    queryKey: keys.list('admin-forum-posts', filters),
    queryFn: fetchPosts,
  })

  return { posts: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}
