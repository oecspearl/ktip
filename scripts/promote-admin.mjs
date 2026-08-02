#!/usr/bin/env node
/**
 * Promotes an EXISTING account to platform admin, without touching its password.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/promote-admin.mjs <email>
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 *
 * This is the sibling of create-admin.mjs. That script creates the account and
 * resets its password, which is wrong for a real account someone is already
 * signed in with. This one only adds the admin roles.
 *
 * The roles are MERGED, not replaced — an account that is already an investor
 * or entrepreneur keeps those hats, so its dashboards and role switcher are
 * unchanged and it simply gains the admin console on top.
 *
 * Why an UPDATE and not an INSERT: guard_profile_insert_roles (migration 063)
 * strips non-self-assignable slugs on INSERT with no service-role bypass, while
 * guard_profile_privileged_columns bypasses on UPDATE when auth.uid() is NULL —
 * which is the case for the secret key. See create-admin.mjs for the long form.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !secret) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY.')
  console.error('Run as: node --env-file=.env scripts/promote-admin.mjs <email>')
  process.exit(1)
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: node --env-file=.env scripts/promote-admin.mjs <email>')
  process.exit(1)
}

// `super_admin` is what AdminRoute and the api/admin guards resolve against;
// `oecs` is its legacy alias and is what the top-nav Admin link still checks.
const ADMIN_ROLES = ['super_admin', 'oecs']

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const step = (n, msg) => console.log(`\n[${n}] ${msg}`)

// ── 1. Find the account ───────────────────────────────────────────────────
step(1, `Locating ${email}`)
// listUsers is paginated with no server-side email filter, so page until found.
// PER_PAGE is deliberately tiny: this project's GoTrue returns "Database error
// finding users" for any page size of ~50 or more, so a big page never returns
// at all. Small pages cost a few extra round trips and always work.
const PER_PAGE = 5
const MAX_PAGES = 400 // backstop so a listing bug cannot spin forever
let userId
for (let page = 1; page <= MAX_PAGES && !userId; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
  if (error) {
    console.error('   FAILED to list users:', error.message)
    process.exit(1)
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (match) userId = match.id
  else if (data.users.length < PER_PAGE) break
}
if (!userId) {
  console.error(`   No account found for ${email}. Use create-admin.mjs to make one.`)
  process.exit(1)
}
console.log('   user id:', userId)

// ── 2. Read the current roles ─────────────────────────────────────────────
step(2, 'Reading current profile')
const { data: profile, error: readError } = await admin
  .from('profiles')
  .select('id, roles, active_role, is_suspended')
  .eq('id', userId)
  .maybeSingle()

if (readError) {
  console.error('   FAILED:', readError.message)
  process.exit(1)
}
if (!profile) {
  console.error('   No profile row for that auth user. Aborting.')
  process.exit(1)
}
const current = profile.roles ?? []
console.log('   roles currently:', JSON.stringify(current))

// ── 3. Merge in the admin roles ───────────────────────────────────────────
const next = [...new Set([...current, ...ADMIN_ROLES])]
if (next.length === current.length) {
  console.log('\n   Already an admin — nothing to change.')
} else {
  step(3, `Granting ${JSON.stringify(ADMIN_ROLES)} (merged, keeping existing roles)`)
  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({ roles: next })
    .eq('id', userId)
    .select('roles')
    .single()

  if (updateError) {
    console.error('   FAILED:', updateError.message)
    process.exit(1)
  }
  console.log('   roles now:', JSON.stringify(updated.roles))

  if (!updated.roles?.includes('super_admin')) {
    console.error('\n   The role was stripped. That means auth.uid() was NOT null for this')
    console.error('   connection, so guard_profile_privileged_columns rejected the change.')
    console.error('   Confirm SUPABASE_SECRET_KEY is the secret key, not the publishable one.')
    process.exit(1)
  }
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

console.log('\n' + '─'.repeat(64))
console.log(allOk ? 'READY' : 'COMPLETED WITH FAILURES')
console.log('  email:   ', email)
console.log('  user id: ', userId)
console.log('  password unchanged')
console.log('─'.repeat(64))
console.log('\nSign out and back in (or hard-refresh) so AuthContext re-reads the')
console.log('permissions, then visit /admin.')
process.exit(allOk ? 0 : 1)
