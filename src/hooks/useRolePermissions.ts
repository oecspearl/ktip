import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  PermissionDefinitionRow,
  PermissionKey,
  Profile,
  RoleDefinitionRow,
  RolePermissionEvent,
  RolePermissionRow,
  RoleSlug,
} from '../types'

/** Role catalog. Public read, so this also drives role labels elsewhere. */
export function useRoleDefinitions() {
  const query = useQuery({
    queryKey: keys.list('role-definitions'),
    queryFn: async (): Promise<RoleDefinitionRow[]> => {
      const { data, error } = await (supabase as any)
        .from('role_definitions')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data as RoleDefinitionRow[]) || []
    },
    staleTime: 5 * 60_000,
  })

  return { roles: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function usePermissionDefinitions() {
  const query = useQuery({
    queryKey: keys.list('permission-definitions'),
    queryFn: async (): Promise<PermissionDefinitionRow[]> => {
      const { data, error } = await (supabase as any)
        .from('permission_definitions')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data as PermissionDefinitionRow[]) || []
    },
    staleTime: 5 * 60_000,
  })

  return {
    permissions: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** The live matrix, keyed `${role}:${permission}` for O(1) cell lookup. */
export function useRolePermissions() {
  const query = useQuery({
    queryKey: keys.list('role-permissions'),
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await (supabase as any)
        .from('role_permissions')
        .select('role_slug, permission_key, allowed')

      if (error) throw error

      const map: Record<string, boolean> = {}
      for (const row of (data as RolePermissionRow[]) || []) {
        map[`${row.role_slug}:${row.permission_key}`] = row.allowed
      }
      return map
    },
  })

  return { matrix: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSetRolePermission() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      roleSlug: RoleSlug
      permissionKey: PermissionKey
      allowed: boolean
    }) => {
      const { error } = await (supabase as any)
        .from('role_permissions')
        .update({ allowed: params.allowed })
        .eq('role_slug', params.roleSlug)
        .eq('permission_key', params.permissionKey)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('role-permissions') })
      queryClient.invalidateQueries({ queryKey: keys.all('role-permission-events') })
      // The editor's own capability set can change with the matrix.
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
    },
  })

  const setPermission = (roleSlug: RoleSlug, permissionKey: PermissionKey, allowed: boolean) =>
    mutation.mutateAsync({ roleSlug, permissionKey, allowed })

  return { setPermission, loading: mutation.isPending, error: mutation.error }
}

export function useResetRolePermissions() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any).rpc('reset_role_permissions')
      if (error) throw error
      return (data as number) ?? 0
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('role-permissions') })
      queryClient.invalidateQueries({ queryKey: keys.all('role-permission-events') })
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
    },
  })

  return { resetToDefaults: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/** Audit trail for the matrix. Requires audit:view. */
export function useRolePermissionEvents(limit = 50) {
  const query = useQuery({
    queryKey: keys.list('role-permission-events', { limit }),
    queryFn: async (): Promise<RolePermissionEvent[]> => {
      const { data, error } = await (supabase as any)
        .from('role_permission_events')
        .select('*, actor:profiles!actor_id(*)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data as RolePermissionEvent[]) || []
    },
  })

  return { events: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Members list for the role-assignment table above the matrix. */
export function useRoleMembers(search?: string) {
  const query = useQuery({
    queryKey: keys.list('role-members', { search }),
    queryFn: async (): Promise<Profile[]> => {
      let request = (supabase as any)
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (search) request = request.ilike('display_name', `%${search}%`)

      const { data, error } = await request
      if (error) throw error
      return (data as Profile[]) || []
    },
  })

  return { members: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Role assignment. Routed through set_user_roles() rather than a bare UPDATE
 * so the privileged-column guard has one auditable entry point.
 */
export function useSetUserRoles() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { userId: string; roles: RoleSlug[] }) => {
      const { data, error } = await (supabase as any).rpc('set_user_roles', {
        p_user: params.userId,
        p_roles: params.roles,
      })

      if (error) throw error
      if (data && data.ok === false) {
        throw new Error(
          data.reason === 'forbidden'
            ? 'You do not have permission to change roles.'
            : `Unknown role: ${(data.roles || []).join(', ')}`
        )
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('role-members') })
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
    },
  })

  const setUserRoles = (userId: string, roles: RoleSlug[]) =>
    mutation.mutateAsync({ userId, roles })

  return { setUserRoles, loading: mutation.isPending, error: mutation.error }
}
