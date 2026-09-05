import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type PropsWithChildren,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { purgeSupabaseResponseCache } from '../lib/service-worker'
import {
  defaultPermissionsFor,
  expandRoles,
  VERIFICATION_GATED_PERMISSIONS,
} from '../lib/permissions'
import type { User, Session } from '@supabase/supabase-js'
import type { PermissionKey, Profile, RoleSlug } from '../types'

export interface SignupMetadata {
  display_name?: string
  role?: string
  /**
   * `YYYY-MM-DD`. handle_new_user() (091) moves it into `account_age` and
   * derives `is_minor` from it; it is never written to `profiles`, so it stays
   * out of every public read of a member.
   */
  date_of_birth?: string
  /**
   * The account-bundle document keys the signup form displayed. handle_new_user()
   * (115) writes the matching `user_consents` rows in the same transaction that
   * creates the profile.
   *
   * Metadata rather than an RPC for a specific reason: with email confirmation
   * enabled `signUp()` returns no session, so `auth.uid()` is null and
   * `record_consent()` would refuse — while the auth user and profile already
   * exist. The same constraint that put `date_of_birth` here.
   *
   * The VERSION is not sent. The trigger reads it from `legal_documents`.
   */
  legal_consent?: string[]
  /** Which catalog the documents were read in — evidence, not a preference. */
  legal_consent_locale?: string
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
  /**
   * True while the profile row is still in flight. Guards must wait on this:
   * `profile` is null both for "not loaded yet" and "has no profile", and a
   * check that treats those the same either flashes a denial at legitimate
   * users or waves through a user whose roles it has not seen.
   */
  profileLoading: boolean
  /** Roles held, with legacy slugs resolved (oecs -> super_admin). */
  roles: RoleSlug[]
  /**
   * Effective capability set from the get_my_permissions() RPC. Rendering only
   * — RLS is what actually enforces this, so a stale set can hide a control
   * but can never grant one.
   */
  permissions: Set<PermissionKey>
  can: (permission: PermissionKey) => boolean
  /**
   * Migration 139 — has an admin approved this account? Admin seats read TRUE
   * so the queue is never blocked by itself. Publishing and applying keys are
   * absent from `permissions` until this is true, so `can()` already answers
   * correctly; this is here for the UI that has to say WHY.
   */
  verified: boolean
  /** super_admin or admin — the two seats is_platform_admin() admits (124). */
  isAdmin: boolean
  /**
   * The top seat only (124). Rendering: it decides whether the console offers
   * the controls that act on another administrator. SQL enforces the ceiling
   * whatever this says.
   */
  isSuperAdmin: boolean
  /**
   * This session holds a verified second factor but has not proven it yet (118).
   *
   * Assurance level is a property of the SESSION, not of the account, which is
   * why it lives here rather than on `profile`. It is false for anyone with no
   * verified factor — GoTrue reports nextLevel 'aal1' for them — so it can never
   * collide with the enrolment gate on `profile.requires_mfa_enrollment`.
   */
  mfaChallengeRequired: boolean
  /** Recompute the flag above after a challenge swaps the access token. */
  recheckMfaChallenge: () => Promise<void>
  /** Refetch the profile row — the MFA pages need the gate flags to be current. */
  refreshProfile: () => Promise<void>
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

  const {
    data: profileData,
    error: profileError,
    isPending: profilePending,
  } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfileQuery(user!.id, user),
    enabled: !!user?.id,
    // One retry, not three.
    //
    // ProtectedRoute holds a full-screen RouteSplash until this resolves — it
    // has to, because the role check below it decides whether an account still
    // needs onboarding. That makes this query's failure path the app's
    // time-to-anything on every authenticated route. At `retry: 3` with the
    // backoff below (1s, 2s, 4s, 8s) a phone on a bad connection sat on a
    // blank splash for up to ~15 seconds before being told anything at all.
    //
    // One retry still covers what retries are actually for here — a single
    // dropped request as the radio changes cell — while capping the worst case
    // at about a second.
    retry: 1,
    retryDelay: 1000,
  })

  const profile = user ? profileData ?? null : null
  // A disabled query also reports `pending`, so the signed-out case has to be
  // excluded or every guard would wait forever on the login screen.
  const profileLoading = !!user && profilePending

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

  // profiles.is_minor is a cache of a value that changes on a birthday, and
  // this project has no pg_cron to sweep it (see 068). So it is corrected here,
  // once per signed-in account, in the same opportunistic-housekeeping spirit
  // the SQL side uses: the account that turned 18 overnight is fixed the next
  // time it appears. Only refetches when the RPC actually moved something.
  //
  // Failure is ignored on purpose. This is a UI hint; every check that has to be
  // right calls account_is_minor() server-side and never reads this column.
  const minorCheckedFor = useRef<string | null>(null)
  useEffect(() => {
    const id = user?.id
    if (!id || profileLoading || minorCheckedFor.current === id) return
    minorCheckedFor.current = id
    let cancelled = false
    void (async () => {
      const { data, error } = await (supabase as any).rpc('ensure_my_minor_status')
      if (cancelled || error) return
      if (data !== profile?.is_minor) {
        await queryClient.invalidateQueries({ queryKey: ['profile', id] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, profileLoading, profile?.is_minor, queryClient])

  // What this account has and has not agreed to (115).
  //
  // Owned here rather than prefetched, so one place invalidates it and every
  // page that calls useConsents() reads the same cache entry synchronously.
  // That is what makes the publishing gate cost zero requests per create form
  // instead of one. `staleTime: Infinity` because the answer only moves on a
  // deploy or on an acceptance, and both invalidate explicitly.
  useQuery({
    queryKey: ['consents', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_consents')
      if (error) throw error
      return data ?? []
    },
    enabled: !!user?.id,
    staleTime: Infinity,
    retry: 1,
  })

  // The consent counterpart to the minor sweep above, and the mechanism by
  // which a NEW VERSION reaches a live session with no pg_cron: the RPC
  // recomputes profiles.requires_consent against whatever is currently in
  // force. Failure is ignored — the gate is enforced by RLS and by the
  // publishing check, never by this cached flag alone.
  const consentCheckedFor = useRef<string | null>(null)
  useEffect(() => {
    const id = user?.id
    if (!id || profileLoading || consentCheckedFor.current === id) return
    consentCheckedFor.current = id
    let cancelled = false
    void (async () => {
      const { data, error } = await (supabase as any).rpc('ensure_my_consent_state')
      if (cancelled || error) return
      if (data !== profile?.requires_consent) {
        await queryClient.invalidateQueries({ queryKey: ['profile', id] })
        await queryClient.invalidateQueries({ queryKey: ['consents', id] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, profileLoading, profile?.requires_consent, queryClient])

  // Two-factor state (118), and the two halves are genuinely different things.
  //
  // Enrolment lives on the profile row, and nothing on the SQL side writes it —
  // there is deliberately no trigger on auth.mfa_factors, so this once-per-
  // session call is the only thing that keeps the column true. It also catches
  // the accounts the guard triggers structurally cannot: every service-role
  // write, set_user_roles(), and vc_provision_identity() set
  // ktip.bypass_profile_guard and skip the derive entirely.
  //
  // Failure is ignored on purpose, exactly as the minor check above: the column
  // is a UI hint, and everything that has to be right calls
  // account_mfa_satisfied() server-side.
  const mfaCheckedFor = useRef<string | null>(null)
  useEffect(() => {
    const id = user?.id
    if (!id || profileLoading || mfaCheckedFor.current === id) return
    mfaCheckedFor.current = id
    let cancelled = false
    void (async () => {
      const { data, error } = await (supabase as any).rpc('ensure_my_mfa_status')
      if (cancelled || error) return
      if (data !== profile?.requires_mfa_enrollment) {
        await queryClient.invalidateQueries({ queryKey: ['profile', id] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, profileLoading, profile?.requires_mfa_enrollment, queryClient])

  // The challenge half is session state and cannot be cached on the profile.
  //
  // Keyed on the access token as well as the user id: verifying a factor swaps
  // the token within one account, and that is precisely the moment the answer
  // changes from true to false.
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false)

  const readAssuranceLevel = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) return false
    return data?.nextLevel === 'aal2' && data?.currentLevel === 'aal1'
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setMfaChallengeRequired(false)
      return
    }
    let cancelled = false
    void (async () => {
      const required = await readAssuranceLevel()
      if (!cancelled) setMfaChallengeRequired(required)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, session?.access_token, readAssuranceLevel])

  const recheckMfaChallenge = useCallback(async () => {
    setMfaChallengeRequired(await readAssuranceLevel())
  }, [readAssuranceLevel])

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return
    await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
  }, [user?.id, queryClient])

  const roles = useMemo(() => expandRoles(profile?.roles), [profile?.roles])

  const activeRole = (profile?.active_role as RoleSlug | null) ?? null

  // Falls back to the compiled defaults until the RPC resolves, so the first
  // paint after sign-in does not flash an empty navigation.
  //
  // The fallback narrows to the active context the same way get_my_permissions()
  // does (migration 099), or the bar would show the union of every held role for
  // the length of one round trip and then visibly shed half of it. Intersected
  // with the full held set rather than computed from the active role alone: that
  // is what keeps the safeguard denials — which are a property of everything the
  // account is, not of the hat it is currently wearing — from being switched off
  // by choosing a context that never had them.
  // Migration 139. Admin seats read verified so the review queue is never
  // blocked by itself — is_verified_member() makes the same exception.
  const verified =
    roles.includes('oecs') ||
    roles.includes('admin') ||
    roles.includes('super_admin') ||
    !!profile?.is_verified

  const permissions = useMemo(() => {
    // get_my_permissions() has already applied the verification gate, so a
    // resolved set needs nothing further.
    if (permissionData) return new Set(permissionData)
    const held = defaultPermissionsFor(profile?.roles)
    const scopedSet =
      !activeRole || !roles.includes(activeRole)
        ? held
        : new Set([...held].filter((key) => defaultPermissionsFor([activeRole]).has(key)))
    // The fallback is computed from the compiled matrix, which knows nothing
    // about this account's verification. Without this subtraction an unverified
    // member sees every create button for the length of one round trip, clicks
    // one, and is refused by RLS — worse than never having been offered it.
    if (verified) return scopedSet
    return new Set([...scopedSet].filter((key) => !VERIFICATION_GATED_PERMISSIONS.includes(key)))
  }, [permissionData, profile?.roles, activeRole, roles, verified])

  const can = useCallback((permission: PermissionKey) => permissions.has(permission), [permissions])

  const isSuperAdmin = roles.includes('super_admin')
  const isAdmin = isSuperAdmin || roles.includes('admin')

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
    // Account the caches currently hold data for. `undefined` until the first
    // event, which is what keeps an ordinary page load from wiping a warm cache
    // before it has anything to compare against.
    let cachedUserId: string | null | undefined

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      resolved = true
      const nextUserId = newSession?.user?.id ?? null

      // A different account now owns this tab. Most query keys carry no user
      // id, so without this every one of them keeps serving the previous
      // user's rows — and the ones pinned to staleTime: Infinity would never
      // refetch at all. Signing out and back in with a second Google account
      // is the ordinary way to hit this.
      //
      // TOKEN_REFRESHED and USER_UPDATED leave the id alone, so the common
      // events cost nothing.
      if (cachedUserId !== undefined && cachedUserId !== nextUserId) {
        queryClient.clear()
        void purgeSupabaseResponseCache()
      }
      cachedUserId = nextUserId

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
  }, [queryClient])

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
    // Everything, not only profile and permissions. Most query keys do not
    // carry a user id, so whatever is left behind is handed to whoever signs in
    // next; several hooks also set staleTime: Infinity, which means it is never
    // refetched away.
    queryClient.clear()
    void purgeSupabaseResponseCache()
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
        // GoTrue asks Azure for `openid` and appends whatever is passed here.
        // `email` alone is not enough: `profile` is what carries the `name`
        // claim, and without it handle_new_user() falls all the way through to
        // NEW.email, so Microsoft users land in the member directory with
        // their email address as their display name. Azure has no `picture`
        // claim at any scope, so their avatar starts empty either way.
        scopes: 'openid profile email',
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

  // Memoized so the 100+ useAuth consumers only re-render when a field
  // actually changes, not on every provider render.
  const value: AuthContextType = useMemo(
    () => ({
      user,
      session,
      profile,
      loading,
      profileLoading,
      roles,
      permissions,
      can,
      verified,
      isAdmin,
      isSuperAdmin,
      mfaChallengeRequired,
      recheckMfaChallenge,
      refreshProfile,
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
    }),
    [
      user,
      session,
      profile,
      loading,
      profileLoading,
      roles,
      permissions,
      can,
      verified,
      isAdmin,
      isSuperAdmin,
      mfaChallengeRequired,
      recheckMfaChallenge,
      refreshProfile,
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
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
