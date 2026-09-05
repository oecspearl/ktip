import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import { measuredCount, type Measured } from '../lib/measured'
import type { Profile, GrantApplication, GrantApplicationStatus, UserRole } from '../types'

// ============================================================
// Dashboard Stats
// ============================================================

/**
 * Every tile is a Measured, not a number.
 *
 * The page's own comment says it best: "A tile reading 0 is a claim about the
 * platform." It was true of the climate strip, which hard-fell-back to 0 on any
 * failure, and quietly true of the five head counts as well, where `count || 0`
 * turned a refused query into a confident zero.
 */
export interface AdminStats {
  userCount: Measured
  eventCount: Measured
  grantCount: Measured
  applicationCount: Measured
  postCount: Measured
  climateProjectCount: Measured
  climateEventCount: Measured
  climateGrantCount: Measured
}

export function useAdminStats() {
  const fetchStats = async (): Promise<AdminStats> => {
    // A rejected promise (the 400 the climate columns used to throw) has to
    // become a *failed* result, not a zero one.
    const failed = (message: string) => ({ count: null, error: { message } })
    const guarded = <T extends { count: number | null; error: unknown }>(
      promise: PromiseLike<T>,
      label: string
    ) => Promise.resolve(promise).then((r) => r, () => failed(`${label} query failed`))

    const now = new Date().toISOString()

    const [users, events, grants, applications, posts, climateProjects, climateEvents, climateGrants] =
      await Promise.all([
        guarded(supabase.from('profiles').select('*', { count: 'exact', head: true }), 'profiles'),
        // Drafts and cancellations are not events the platform hosted. The
        // status vocabulary is draft/published/cancelled/completed (007).
        guarded(
          supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .in('status', ['published', 'completed']),
          'events'
        ),
        // A NULL deadline means "no deadline" and stays active; a passed one
        // does not. The guided tour at src/data/tutorials/admin.ts already told
        // admins this was the rule — now it is.
        guarded(
          supabase
            .from('grants')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .or(`deadline.is.null,deadline.gte.${now}`),
          'grants'
        ),
        guarded(
          supabase.from('grant_applications').select('*', { count: 'exact', head: true }),
          'grant applications'
        ),
        guarded(supabase.from('forum_posts').select('*', { count: 'exact', head: true }), 'forum posts'),
        guarded(
          supabase.from('projects').select('*', { count: 'exact', head: true }).eq('is_climate_action', true),
          'climate projects'
        ),
        guarded(
          supabase.from('events').select('*', { count: 'exact', head: true }).eq('is_climate_action', true),
          'climate events'
        ),
        guarded(
          supabase.from('grants').select('*', { count: 'exact', head: true }).eq('is_climate_action', true),
          'climate grants'
        ),
      ])

    return {
      userCount: measuredCount(users, 'Could not read the member count'),
      eventCount: measuredCount(events, 'Could not read the event count'),
      grantCount: measuredCount(grants, 'Could not read the grant count'),
      applicationCount: measuredCount(applications, 'Could not read the application count'),
      postCount: measuredCount(posts, 'Could not read the discussion count'),
      climateProjectCount: measuredCount(climateProjects, 'Could not read climate projects'),
      climateEventCount: measuredCount(climateEvents, 'Could not read climate events'),
      climateGrantCount: measuredCount(climateGrants, 'Could not read climate grants'),
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

  // Goes through set_user_roles() rather than a bare UPDATE on profiles.
  //
  // Two reasons. The RPC is the one code path 063 built for role assignment,
  // so every change lands in the audit trail — a direct write is invisible.
  // And a direct write is filtered by RLS: when it matches no rows PostgREST
  // returns success with no error, so the console reported "saved" and nothing
  // changed. That is exactly what happened to any admin holding super_admin
  // without the legacy oecs slug, because the policy tested the slug.
  //
  // The RPC returns {ok:false, reason} instead of raising, so the reason has to
  // be turned into an error here or the same silent-success returns.
  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: UserRole[] }) => {
      const { data, error } = await (supabase as any).rpc('set_user_roles', {
        p_user: userId,
        p_roles: roles,
      })

      if (error) throw error
      if (data && data.ok === false) {
        const messages: Record<string, string> = {
          forbidden: 'You do not have permission to change roles.',
          unknown_role: `Unknown role: ${(data.roles || []).join(', ')}`,
          not_found: 'That account no longer exists.',
          // The Super Admin ceiling (124).
          seat_requires_super_admin:
            'Only a Super Admin can grant or remove the Admin or Super Admin role, or change the roles of an Admin.',
          last_super_admin: 'The last Super Admin cannot be demoted.',
        }
        throw new Error(messages[data.reason] || 'Could not update roles.')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
      // active_role may have been cleared server-side if the user lost the role
      // they were operating as, and permissions are derived from roles.
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
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

  // 118. The answer to "I lost my phone and my recovery codes" — without it a
  // blocking second factor is a one-way door.
  const resetMfaMutation = useMutation({
    mutationFn: async (userId: string) => {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/reset-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reset two-step verification')
      return json as { success: true; cleared: number; warning?: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
    },
  })

  // 124. Suspends the profile row through set_user_suspension() — where the
  // Super Admin ceiling lives — and then bans the auth user so the account
  // cannot sign in. Reinstating reverses both. See api/admin/suspend-user.ts.
  const setSuspensionMutation = useMutation({
    mutationFn: async ({
      userId,
      suspended,
      reason,
    }: {
      userId: string
      suspended: boolean
      reason?: string
    }) => {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/suspend-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ user_id: userId, suspended, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update the suspension')
      return json as { success: true; warning?: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
      queryClient.invalidateQueries({ queryKey: keys.all('role-members') })
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

  const resetMfa = (userId: string) => resetMfaMutation.mutateAsync(userId)

  const setSuspension = (userId: string, suspended: boolean, reason?: string) =>
    setSuspensionMutation.mutateAsync({ userId, suspended, reason })

  return {
    updateRoles,
    toggleVerified,
    createUser,
    resetPassword,
    resetMfa,
    setSuspension,
    deleteUser,
    loading:
      updateRolesMutation.isPending ||
      toggleVerifiedMutation.isPending ||
      createUserMutation.isPending ||
      resetPasswordMutation.isPending ||
      resetMfaMutation.isPending ||
      setSuspensionMutation.isPending ||
      deleteUserMutation.isPending,
    error:
      updateRolesMutation.error ||
      toggleVerifiedMutation.error ||
      createUserMutation.error ||
      resetPasswordMutation.error ||
      resetMfaMutation.error ||
      setSuspensionMutation.error ||
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
