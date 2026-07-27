import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { hasStaleSession, clearSupabaseSession } from './auth-utils'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
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
  },
})
