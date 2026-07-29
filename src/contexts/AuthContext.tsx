import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type PropsWithChildren,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { defaultPermissionsFor, expandRoles } from '../lib/permissions'
import type { User, Session } from '@supabase/supabase-js'
import type { PermissionKey, Profile, RoleSlug } from '../types'

export interface SignupMetadata {
  display_name?: string
  role?: string
  organization?: string
  industry?: string
  country?: string
  bio?: string
  skills?: string[]
  interests?: string[]
  open_to?: string[]
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Roles held, with legacy slugs resolved (oecs -> super_admin). */
  roles: RoleSlug[]
  /**
   * Effective capability set from the get_my_permissions() RPC. Rendering only
   * — RLS is what actually enforces this, so a stale set can hide a control
   * but can never grant one.
   */
  permissions: Set<PermissionKey>
  can: (permission: PermissionKey) => boolean
  isAdmin: boolean
  /** Current operating context for multi-role accounts; null means all roles. */
  activeRole: RoleSlug | null
  setActiveRole: (role: RoleSlug | null) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    metadata?: SignupMetadata
  ) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithMicrosoft: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  updateEmail: (newEmail: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Detect AbortError regardless of whether it's a native Error or Supabase error object */
function isAbortError(err: any): boolean {
  if (!err) return false
  if (err.name === 'AbortError') return true
  if (typeof err.message === 'string' && err.message.includes('AbortError')) return true
  if (typeof err.message === 'string' && err.message.includes('signal is aborted')) return true
  return false
}

// Fetch (and auto-create if missing) a user's profile from the database.
async function fetchProfileQuery(userId: string, userData?: User | null): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error && error.code === 'PGRST116') {
    // Profile doesn't exist yet — create it (handles users created before trigger was installed)
    // OAuth providers (Google/Microsoft) supply full_name/name/picture instead of our keys
    const meta = userData?.user_metadata
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        display_name:
          meta?.display_name || meta?.full_name || meta?.name || userData?.email || null,
        avatar_url: meta?.avatar_url || meta?.picture || null,
        roles: meta?.role ? [meta.role] : [],
        bio: meta?.bio || null,
        country: meta?.country || null,
        organization: meta?.organization || null,
        industry: meta?.industry || null,
        skills: Array.isArray(meta?.skills) ? meta.skills : [],
        interests: Array.isArray(meta?.interests) ? meta.interests : [],
        open_to: Array.isArray(meta?.open_to) ? meta.open_to : [],
      })
      .select()
      .single()

    if (insertError) throw insertError
    return newProfile as Profile
  }

  if (error) throw error
  return data as Profile
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  const { data: profileData, error: profileError } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfileQuery(user!.id, user),
    enabled: !!user?.id,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })

  const profile = user ? profileData ?? null : null

  // Authoritative capability set. Kept as its own query rather than derived
  // from profile.roles so an admin toggling the matrix reaches every client on
  // the next refetch without a schema change or a sign-out.
  const { data: permissionData } = useQuery({
    queryKey: ['permissions', user?.id],
    queryFn: async (): Promise<PermissionKey[]> => {
      // Cast: src/types/database.ts is hand-written and does not list RPCs.
      const { data, error } = await (supabase as any).rpc('get_my_permissions')
      if (error) throw error
      return (data as PermissionKey[]) || []
    },
    enabled: !!user?.id,
    retry: 1,
  })

  const roles = useMemo(() => expandRoles(profile?.roles), [profile?.roles])

  // Falls back to the compiled defaults until the RPC resolves, so the first
  // paint after sign-in does not flash an empty navigation.
  const permissions = useMemo(
    () => (permissionData ? new Set(permissionData) : defaultPermissionsFor(profile?.roles)),
    [permissionData, profile?.roles]
  )

  const can = useCallback((permission: PermissionKey) => permissions.has(permission), [permissions])

  const isAdmin = roles.includes('super_admin')
  const activeRole = (profile?.active_role as RoleSlug | null) ?? null

  // If profile fetch fails with an auth error, the session is corrupt — force clear it.
  useEffect(() => {
    if (!profileError || isAbortError(profileError)) return
    const err = profileError as any
    const status = err?.status || err?.code
    const msg = err?.message || ''
    if (status === 401 || status === 403 || msg.includes('JWT') || msg.includes('token')) {
      console.warn('Auth error fetching profile — clearing corrupt session')
      setUser(null)
      setSession(null)
      supabase.auth.signOut({ scope: 'local' }).catch(() => {
        /* ignore */
      })
    } else {
      console.error('Error fetching profile:', profileError)
    }
  }, [profileError])

  // Initialize auth state — use onAuthStateChange as single source of truth
  useEffect(() => {
    let resolved = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      resolved = true
      setSession(newSession)
      setUser(newSession?.user ?? null)

      // Set loading false IMMEDIATELY — we now know the auth state.
      // Profile fetch happens separately (via useQuery) and shouldn't block navigation.
      setLoading(false)
    })

    // Safety net: if onAuthStateChange doesn't fire within 3 seconds
    // (e.g., network issues, stale service worker), fall back to getSession()
    const timeout = setTimeout(async () => {
      if (resolved) return
      try {
        const {
          data: { session: fallbackSession },
        } = await supabase.auth.getSession()
        resolved = true
        setSession(fallbackSession)
        setUser(fallbackSession?.user ?? null)
      } catch (e: any) {
        if (!isAbortError(e)) {
          console.error('Fallback getSession failed:', e)
        }
      } finally {
        setLoading(false)
      }
    }, 3000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  // Sign in with email and password.
  //
  // The primary address takes the direct path, exactly as before. Only a
  // credential mismatch triggers the secondary-email fallback, so ordinary
  // logins keep their current latency and GoTrue's own rate limiting. Keep that
  // regex narrow: widening it would add a round trip to every failed login,
  // including 'Email not confirmed'.
  const signIn = useCallback(async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    })
    if (!error) return
    if (!/invalid login credentials/i.test(error.message)) throw error

    const res = await fetch('/api/auth/login-alias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, password }),
    })
    const body = await res.json().catch(() => ({} as any))

    if (!res.ok || !body?.access_token) {
      if (body?.error === 'unverified_alias') {
        throw new Error('Confirm your secondary email address before signing in with it.')
      }
      // Falls back to GoTrue's original message, which LoginPage already maps.
      throw new Error(body?.error || error.message)
    }

    const { error: setErr } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    if (setErr) throw setErr
  }, [])

  // Sign up with email and password
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: SignupMetadata
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      })

      if (error) throw error

      // Profile is auto-created by the handle_new_user() database trigger
      // No manual insert needed — the trigger runs with SECURITY DEFINER
    },
    []
  )

  // Sign out — always clears local state even if server call fails (stale JWT)
  const signOut = useCallback(async () => {
    // Clear local state immediately so the UI updates
    setUser(null)
    setSession(null)
    queryClient.removeQueries({ queryKey: ['profile'] })
    queryClient.removeQueries({ queryKey: ['permissions'] })
    try {
      await supabase.auth.signOut()
    } catch {
      // Server signout failed (e.g. expired token) — force clear local session
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        /* ignore */
      }
    }
  }, [queryClient])

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }, [])

  // Sign in with Microsoft
  const signInWithMicrosoft = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email',
      },
    })
    if (error) throw error
  }, [])

  // Update password
  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }, [])

  // Update email
  const updateEmail = useCallback(async (newEmail: string) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) throw error
  }, [])

  // Send password reset email.
  //
  // The alias route runs in PARALLEL rather than as a fallback:
  // resetPasswordForEmail deliberately succeeds for unknown addresses, so there
  // is no error to branch on. Firing both is safe because resolve_email_alias'
  // primary_conflict check guarantees at most one of them ever sends mail.
  const resetPassword = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase()
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    // Result intentionally ignored — the route is silent by design and must not
    // reveal whether the address is a known alias.
    void fetch('/api/auth/reset-alias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    }).catch(() => {})

    if (error) throw error
  }, [])

  // Delete account — server endpoint removes profile AND auth user via service role
  const deleteAccount = useCallback(async () => {
    if (!user) throw new Error('No user logged in')

    const { data: { session: current } } = await supabase.auth.getSession()
    if (!current) throw new Error('No active session')

    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${current.access_token}` },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Account deletion failed' }))
      throw new Error(body.error || 'Account deletion failed')
    }

    // Sign out after deletion
    await supabase.auth.signOut()
  }, [user])

  // Update user profile
  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user) throw new Error('No user logged in')

      const { error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) throw error

      // Refresh profile
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
    },
    [user, queryClient]
  )

  // Switching context is a profile write, not a re-authentication: the JWT is
  // untouched and no sign-out is needed. The 063 guard trigger rejects an
  // active_role the account does not actually hold.
  const setActiveRole = useCallback(
    async (role: RoleSlug | null) => {
      if (!user) throw new Error('No user logged in')

      const { error } = await supabase
        .from('profiles')
        .update({ active_role: role, updated_at: new Date().toISOString() } as any)
        .eq('id', user.id)

      if (error) throw error

      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['permissions', user.id] })
    },
    [user, queryClient]
  )

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    roles,
    permissions,
    can,
    isAdmin,
    activeRole,
    setActiveRole,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    signInWithMicrosoft,
    updateProfile,
    updatePassword,
    updateEmail,
    resetPassword,
    deleteAccount,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
