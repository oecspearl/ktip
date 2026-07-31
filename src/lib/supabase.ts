import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { hasStaleSession, clearSupabaseSession } from './auth-utils'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Supabase's current key scheme issues a `sb_publishable_…` key; the older
// `anon` JWT is still accepted, so both names are read and the new one wins.
// Both are safe in the browser — they carry no privileges beyond RLS.
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or the legacy VITE_SUPABASE_ANON_KEY) are set.'
  )
}

// Proactively clear expired sessions from localStorage BEFORE the Supabase
// client initializes. This prevents the client's auto-refresh from attempting
// to refresh an expired/revoked token, which can hang and block all subsequent
// auth operations (signIn, signOut, etc.) due to the internal auth lock.
if (hasStaleSession()) {
  console.warn('Stale Supabase session detected — clearing before client init')
  clearSupabaseSession()
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // supabase-js still defaults to the implicit flow, which hands back the
    // access *and* refresh token in the URL fragment — through a document a
    // service worker is free to redirect, which is exactly how OAuth broke
    // here before. PKCE returns a single-use code instead, and it is what the
    // code-verifier carve-out in auth-utils.ts and the reload guard in
    // service-worker.ts were already written to protect.
    //
    // Trade-off, deliberately accepted: email links now carry `?code=` and can
    // only be redeemed in the browser that requested them, because the
    // verifier lives in that browser's localStorage. Opening a reset link in a
    // mail client's in-app browser therefore lands with no session, which is
    // why ResetPasswordPage now says so instead of failing at submit time.
    flowType: 'pkce',
  },
})
