import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Does this member accept optional email?
 *
 * The Email toggle under Settings › Preferences writes notification_preferences.email
 * (036). Until now only the feedback-reply sender read it; the event
 * registration sender did not, so the toggle promised something it did not do.
 * Every OPTIONAL sender goes through here. Security and legal mail — MFA codes,
 * verification proofs, retention warnings, takedown notices — must never call
 * this: those are not notifications the member may decline.
 *
 * A missing row means the member never touched the defaults, and 036 defaults
 * email to TRUE. A read error also reads as allowed: a broken preferences table
 * must not silently mute the platform.
 */
export async function emailAllowed(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return true
  return (data as { email: boolean | null }).email !== false
}
