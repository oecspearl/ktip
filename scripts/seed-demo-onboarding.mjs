/**
 * Finish onboarding for the twelve demo personas in supabase/seed.sql.
 *
 * The SQL seed creates the accounts and fills their profiles, but two steps
 * can only be taken by the account itself: declaring a date of birth (150) and
 * recording consent (201). Until both are done, ProtectedRoute sends a demo
 * login to /onboarding instead of the page someone wanted to show. This signs
 * in as each persona with the seed's shared password and does both, then
 * reports anything the account still owes.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-demo-onboarding.mjs
 *
 * Run after supabase/seed.sql. Safe to re-run: an account that has already
 * declared or consented is reported as such and left alone.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !publishable) {
  console.error('Missing VITE_SUPABASE_URL or the publishable key. Run with --env-file=.env')
  process.exit(1)
}

// Must match the crypt() password in supabase/seed.sql.
const PASSWORD = 'DemoPass123!'
const PERSONAS = [
  'marcia.joseph', 'devon.charles', 'althea.williams', 'james.pierre',
  'keisha.baptiste', 'rashid.mohammed', 'camille.fontaine', 'tariq.phillip',
  'shania.lewis', 'marcus.george', 'sandra.mitchell', 'andre.williams',
].map((name) => `${name}@demo.forge.oecs`)

let failed = 0
for (const email of PERSONAS) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  try {
    const { data: session, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (error) throw new Error(`sign-in: ${error.message}`)

    const dob = await client.rpc('declare_date_of_birth', { p_dob: '1990-01-01', p_source: 'onboarding' })
    if (dob.error) throw new Error(`declare_date_of_birth: ${dob.error.message}`)
    if (dob.data?.ok !== true && dob.data?.reason !== 'already_declared') {
      throw new Error(`declare_date_of_birth: ${dob.data?.reason}`)
    }

    const consent = await client.rpc('record_consent', {
      p_keys: ['terms', 'privacy', 'acceptable-use', 'safeguarding'],
      p_locale: 'en',
      p_context: 'onboarding',
      p_user_agent: 'scripts/seed-demo-onboarding.mjs',
      p_expected_version: 1,
    })
    if (consent.error) throw new Error(`record_consent: ${consent.error.message}`)
    if (consent.data?.ok !== true) throw new Error(`record_consent: ${consent.data?.reason}`)

    await client.rpc('ensure_my_mfa_status')
    const { data: p } = await client
      .from('profiles')
      .select('requires_age_declaration, requires_consent, requires_mfa_enrollment')
      .eq('id', session.user.id)
      .single()
    // Errors before migration 204 is applied; only a definite "no" counts.
    const { data: backup } = await client.rpc('my_secondary_email_status')
    await client.auth.signOut()

    const owed = [
      p?.requires_age_declaration && 'age declaration',
      p?.requires_consent && 'consent',
      p?.requires_mfa_enrollment && 'MFA enrolment',
      backup?.compliant === false && 'backup email',
    ].filter(Boolean)
    console.log(`${email.padEnd(36)} ${owed.length ? `still owes: ${owed.join(', ')}` : 'ok'}`)
  } catch (e) {
    failed++
    console.log(`${email.padEnd(36)} FAILED: ${e.message}`)
  }
}

if (failed) process.exit(1)
