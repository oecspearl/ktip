#!/usr/bin/env node
/**
 * Creates (or promotes) a platform-admin account for local/staging testing.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/create-admin.mjs <email> [password]
 *   node --env-file=.env scripts/create-admin.mjs admin@ktip.test 'Passw0rd!23'
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SECRET_KEY. Never run this against
 * production with a password you intend to reuse.
 *
 * WHY THIS IS A SCRIPT AND NOT AN INSERT
 * --------------------------------------
 * `super_admin` cannot be granted by writing it into the profile at creation
 * time. Two triggers from migration 063 stand in the way:
 *
 *   1. guard_profile_insert_roles (BEFORE INSERT) silently rewrites `roles` to
 *      only the self-assignable slugs. It has NO service-role bypass, so even
 *      the secret key gets `super_admin` stripped to `{}`. Signup metadata is
 *      untrusted input, so this is correct — it just means an INSERT can never
 *      mint an admin.
 *   2. guard_profile_privileged_columns (BEFORE UPDATE) blocks the same thing
 *      on UPDATE, but DOES bypass when `auth.uid()` is NULL — which is the case
 *      for the secret key, since it carries no JWT subject.
 *
 * So the only path is: create the auth user (the on_auth_user_created trigger
 * makes the profile with `roles = {}`), then UPDATE the roles with the secret
 * key. That is exactly what this script does, and why the order matters.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !secret) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY.')
  console.error('Run as: node --env-file=.env scripts/create-admin.mjs <email> [password]')
  process.exit(1)
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: node --env-file=.env scripts/create-admin.mjs <email> [password]')
  process.exit(1)
}

// Generated when omitted so a throwaway account never ends up with a guessable
// password that someone later reuses.
const password = process.argv[3] || `Ktip!${crypto.randomUUID().slice(0, 12)}`

// The role granted. `super_admin` is what AdminRoute and every api/admin guard
// resolve against; `oecs` is its legacy alias and is what the top-nav Admin
// link still checks, so both are set to light up the whole admin surface.
const ROLES = ['super_admin', 'oecs']

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const step = (n, msg) => console.log(`\n[${n}] ${msg}`)

// ── 1. Create, or find an existing account ────────────────────────────────
step(1, `Creating auth user ${email}`)
let userId
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // skips the verification mail; the account can log in at once
  user_metadata: { display_name: 'Test Admin' },
})

if (created.error) {
  const alreadyExists =
    created.error.status === 422 || /already/i.test(created.error.message)
  if (!alreadyExists) {
    console.error('   FAILED:', created.error.message)
    process.exit(1)
  }
  console.log('   Already exists — locating and resetting its password instead.')

  // listUsers is paginated and has no server-side email filter, so page until found.
  let page = 1
  while (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error('   FAILED to list users:', error.message)
      process.exit(1)
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) userId = match.id
    else if (data.users.length < 200) break
    else page += 1
  }
  if (!userId) {
    console.error('   Could not find the existing user. Aborting.')
    process.exit(1)
  }
  const reset = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  })
  if (reset.error) {
    console.error('   FAILED to reset password:', reset.error.message)
    process.exit(1)
  }
} else {
  userId = created.data.user.id
}
console.log('   user id:', userId)

// ── 2. Ensure the profile row exists ──────────────────────────────────────
// on_auth_user_created normally creates it, but it is AFTER INSERT and this
// script may read faster than the trigger commits on a cold connection.
step(2, 'Ensuring profile row exists')
let profile = null
for (let attempt = 0; attempt < 5 && !profile; attempt += 1) {
  const { data } = await admin.from('profiles').select('id, roles').eq('id', userId).maybeSingle()
  if (data) profile = data
  else await new Promise((r) => setTimeout(r, 300))
}
if (!profile) {
  const { error } = await admin.from('profiles').insert({ id: userId, display_name: 'Test Admin' })
  if (error) {
    console.error('   FAILED to create profile:', error.message)
    process.exit(1)
  }
  console.log('   created manually (trigger did not fire)')
} else {
  console.log('   present, roles currently:', JSON.stringify(profile.roles ?? []))
}

// ── 3. Grant the roles by UPDATE (the only path the triggers permit) ──────
step(3, `Granting roles ${JSON.stringify(ROLES)}`)
const { data: updated, error: updateError } = await admin
  .from('profiles')
  .update({ roles: ROLES, is_suspended: false, active_role: null })
  .eq('id', userId)
  .select('roles, is_suspended')
  .single()

if (updateError) {
  console.error('   FAILED:', updateError.message)
  process.exit(1)
}
console.log('   roles now:', JSON.stringify(updated.roles), '| suspended:', updated.is_suspended)

if (!updated.roles?.includes('super_admin')) {
  console.error('\n   The roles were stripped. That means auth.uid() was NOT null for this')
  console.error('   connection, so guard_profile_privileged_columns rejected the change.')
  console.error('   Confirm SUPABASE_SECRET_KEY is the secret key, not the publishable one.')
  process.exit(1)
}

// ── 4. Verify the permissions the app actually gates on ───────────────────
step(4, 'Verifying permissions via has_permission()')
const GATES = [
  ['org:manage', 'AdminRoute, /admin/errors proxy, /api/admin/api-clients'],
  ['moderation:view', 'AdminRoute (alternative), /api/moderate'],
  ['members:manage', '/api/admin/create-user, delete-user, reset-password'],
  ['role:manage', '/admin/roles matrix editing'],
]
let allOk = true
for (const [permission, used] of GATES) {
  const { data, error } = await admin.rpc('has_permission', {
    p_user: userId,
    p_permission: permission,
  })
  const ok = data === true && !error
  if (!ok) allOk = false
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${permission.padEnd(16)} ${used}`)
}

// ── 5. Prove the account can actually sign in ─────────────────────────────
step(5, 'Test sign-in with the publishable key (as the browser would)')
const publishable =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!publishable) {
  console.log('   SKIPPED — no publishable key in the environment')
} else {
  const asUser = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await asUser.auth.signInWithPassword({ email, password })
  if (error) {
    console.log('   FAILED:', error.message)
    allOk = false
  } else {
    console.log('   signed in, session token acquired')
    // get_my_permissions() is what AuthContext calls to build `can()`.
    const { data: perms, error: permError } = await asUser.rpc('get_my_permissions')
    if (permError) console.log('   get_my_permissions() failed:', permError.message)
    else console.log(`   get_my_permissions() returned ${perms?.length ?? 0} permissions`)
    await asUser.auth.signOut()
  }
}

console.log('\n' + '─'.repeat(64))
console.log(allOk ? 'READY — log in with:' : 'COMPLETED WITH FAILURES — credentials:')
console.log('  email:    ', email)
console.log('  password: ', password)
console.log('  user id:  ', userId)
console.log('─'.repeat(64))
console.log('\nThen visit:')
console.log('  /admin           admin dashboard')
console.log('  /admin/errors    Sentry issues (read-only with the current token)')
console.log('  /admin/errors/simulate   send test events')
process.exit(allOk ? 0 : 1)
