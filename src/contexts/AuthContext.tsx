import {
  createContext,
  useContext,
  type ParentComponent,
  createSignal,
  createEffect,
  onCleanup,
} from 'solid-js'
import { supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '../types'

interface AuthContextType {
  user: () => User | null
  session: () => Session | null
  profile: () => Profile | null
  loading: () => boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    metadata?: { display_name?: string; role?: string }
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

const AuthContext = createContext<AuthContextType>()

/** Detect AbortError regardless of whether it's a native Error or Supabase error object */
function isAbortError(err: any): boolean {
  if (!err) return false
  if (err.name === 'AbortError') return true
  if (typeof err.message === 'string' && err.message.includes('AbortError')) return true
  if (typeof err.message === 'string' && err.message.includes('signal is aborted')) return true
  return false
}

export const AuthProvider: ParentComponent = (props) => {
  const [user, setUser] = createSignal<User | null>(null)
  const [session, setSession] = createSignal<Session | null>(null)
  const [profile, setProfile] = createSignal<Profile | null>(null)
  const [loading, setLoading] = createSignal(true)

  // Fetch user profile from database, auto-create if missing
  const fetchProfile = async (userId: string, userData?: User) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet — create it (handles users created before trigger was installed)
        const u = userData || user()
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            display_name: u?.user_metadata?.display_name || u?.email || null,
            roles: u?.user_metadata?.role ? [u.user_metadata.role] : [],
          })
          .select()
          .single()

        if (insertError) throw insertError
        setProfile(newProfile as Profile)
        return
      }

      if (error) throw error
      setProfile(data as Profile)
    } catch (error: any) {
      // Ignore AbortError — happens when SolidJS effects re-run and cancel previous requests
      if (isAbortError(error)) return
      console.error('Error fetching profile:', error)

      // If it's an auth error, the session is corrupt — force clear it
      const status = error?.status || error?.code
      const msg = error?.message || ''
      if (status === 401 || status === 403 || msg.includes('JWT') || msg.includes('token')) {
        console.warn('Auth error fetching profile — clearing corrupt session')
        setUser(null)
        setSession(null)
        setProfile(null)
        try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
        return
      }

      setProfile(null)
    }
  }

  // Initialize auth state — use onAuthStateChange as single source of truth
  createEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      // Set loading false IMMEDIATELY — we now know the auth state.
      // Profile fetch happens separately and shouldn't block navigation.
      if (loading()) {
        setLoading(false)
      }

      if (session?.user) {
        // Fire-and-forget — fetchProfile has its own try/catch internally.
        // .catch() prevents unhandled promise rejection from surfacing.
        fetchProfile(session.user.id, session.user).catch((err) => {
          if (!isAbortError(err)) console.error('Profile fetch failed:', err)
        })
      } else {
        setProfile(null)
      }
    })

    // Safety net: if onAuthStateChange doesn't fire within 3 seconds
    // (e.g., network issues, stale service worker), fall back to getSession()
    const timeout = setTimeout(async () => {
      if (loading()) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user) {
            await fetchProfile(session.user.id, session.user)
          }
        } catch (e: any) {
          if (!isAbortError(e)) {
            console.error('Fallback getSession failed:', e)
          }
        } finally {
          setLoading(false)
        }
      }
    }, 3000)

    onCleanup(() => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    })
  })

  // Recovery: if user is logged in but profile is null, retry up to 3 times
  createEffect(() => {
    const currentUser = user()
    const currentProfile = profile()
    if (currentUser && !currentProfile && !loading()) {
      let attempts = 0
      const interval = setInterval(() => {
        attempts++
        // Stop retrying if profile loaded or max attempts reached
        if (profile() || !user() || attempts > 3) {
          clearInterval(interval)
          return
        }
        fetchProfile(currentUser.id, currentUser).catch((err) => {
          if (!isAbortError(err)) console.error('Profile retry failed:', err)
        })
      }, 2000)
      onCleanup(() => clearInterval(interval))
    }
  })

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  // Sign up with email and password
  const signUp = async (
    email: string,
    password: string,
    metadata?: { display_name?: string; role?: string }
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
  }

  // Sign out — always clears local state even if server call fails (stale JWT)
  const signOut = async () => {
    // Clear local state immediately so the UI updates
    setUser(null)
    setSession(null)
    setProfile(null)
    try {
      await supabase.auth.signOut()
    } catch {
      // Server signout failed (e.g. expired token) — force clear local session
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
    }
  }

  // Sign in with Google
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    if (error) throw error
  }

  // Sign in with Microsoft
  const signInWithMicrosoft = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/`,
        scopes: 'email',
      },
    })
    if (error) throw error
  }

  // Update password
  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  // Update email
  const updateEmail = async (newEmail: string) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) throw error
  }

  // Send password reset email
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  // Delete account
  const deleteAccount = async () => {
    const currentUser = user()
    if (!currentUser) throw new Error('No user logged in')

    // Delete profile first (cascade should handle related data)
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', currentUser.id)

    if (profileError) throw profileError

    // Sign out after deletion
    await supabase.auth.signOut()
  }

  // Update user profile
  const updateProfile = async (updates: Partial<Profile>) => {
    const currentUser = user()
    if (!currentUser) throw new Error('No user logged in')

    const { error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id)

    if (error) throw error

    // Refresh profile
    await fetchProfile(currentUser.id)
  }

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
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

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
