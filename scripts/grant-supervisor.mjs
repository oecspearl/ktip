#!/usr/bin/env node
/**
 * Grants one of the two supervisor seats to an EXISTING account, without
 * touching its password.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/grant-supervisor.mjs <email> people
 *   node --env-file=.env scripts/grant-supervisor.mjs <email> programmes
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY),
 * and migration 116 to have been applied first.
 *
 * This is the third sibling of create-admin.mjs and promote-admin.mjs. The
 * first creates an account and resets its password; the second makes an
 * existing account a Super Admin. This one hands out a seat that is
 * deliberately NOT the Super Admin: neither supervisor can assign roles, edit
 * the permission matrix, or create and delete accounts.
 *
 * The roles are MERGED, not replaced — an account that is already an
 * entrepreneur keeps that hat, so its dashboards keep working and it gains a
 * role switcher on top. That matters for docs/QA-RELAY-SESSION.md, where each
 * supervisor has to act as an ordinary member for half the handoffs.
 *
 * Why an UPDATE and not an INSERT: guard_profile_insert_roles (063) strips
 * non-self-assignable slugs on INSERT with no service-role bypass, while
 * guard_profile_privileged_columns bypasses on UPDATE when auth.uid() is NULL —
 * which is the case for the secret key. See create-admin.mjs for the long form.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

const USAGE = 'Usage: node --env-file=.env scripts/grant-supervisor.mjs <email> people|programmes'

if (!url || !secret) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY.')
  console.error(USAGE)
  process.exit(1)
}

const email = process.argv[2]
const seatArg = (process.argv[3] || '').toLowerCase()

/**
 * Each seat lists the keys it MUST hold and the keys it must NOT, and step 4
 * checks both. A one-sided check would pass for a super_admin, which is the
 * mistake most likely to go unnoticed — the account would work perfectly and
 * the split would not exist.
 */
const SEATS = {
  people: {
    slug: 'people_supervisor',
    label: 'People & Trust Supervisor (Marvin)',
    owns: 'users (read-only), verification, institutions, chamber review, moderation, grievances',
    expect: [
      ['members:view', '/admin/users, read-only'],
      ['verification:review', '/admin/verification and the verified badge'],
      ['moderation:view', '/admin/moderation, /admin/grievances'],
      ['moderation:action', 'quarantine, restore, remove'],
      ['moderation:escalate', 'suspensions'],
      ['sme:verify', '/admin/chamber'],
      ['institution:verify', '/admin/institutions'],
      ['audit:view', 'the permission and moderation trails'],
    ],
    deny: [
      ['role:manage', 'the permission matrix stays with the Super Admin'],
      ['members:manage', 'creating and deleting accounts stays with the Super Admin'],
      ['org:manage', 'analytics, partner API and the error console'],
      ['event:manage', 'events and the venue stay with the Super Admin'],
      ['grant:manage', "the Programmes seat's"],
      ['project:manage_all', "the Programmes seat's"],
    ],
  },
  programmes: {
    slug: 'programme_supervisor',
    label: 'Programmes Supervisor (Royston)',
    owns: 'projects, grants, forums, resources, achievements, employers',
    expect: [
      ['project:manage_all', '/admin/projects'],
      ['grant:manage', '/admin/grants and the applications to them'],
      ['grant:manage_funds', 'award and disbursement records'],
      ['forum:manage', '/admin/forums'],
      ['resource:manage', '/admin/resources'],
      ['achievement:manage', '/admin/achievements'],
      ['employer:manage', '/admin/employers'],
    ],
    deny: [
      ['role:manage', 'the permission matrix stays with the Super Admin'],
      ['members:manage', 'creating and deleting accounts stays with the Super Admin'],
      ['members:view', "the People seat's"],
      ['org:manage', 'analytics, partner API and the error console'],
      ['event:manage', 'events and the venue stay with the Super Admin'],
      ['moderation:view', "the People seat's"],
      ['verification:review', "the People seat's"],
    ],
  },
}

const seat = SEATS[seatArg]
if (!email || !seat) {
  console.error(USAGE)
  console.error('\nSeats:')
  for (const [key, s] of Object.entries(SEATS)) {
    console.error(`  ${key.padEnd(11)} ${s.label}`)
    console.error(`  ${' '.repeat(11)} owns: ${s.owns}`)
  }
  process.exit(1)
}

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
  console.error(`   No account found for ${email}.`)
  console.error('   Have them sign up first, then re-run this. create-admin.mjs')
  console.error('   would also work but resets the password, which is wrong for')
  console.error('   an account somebody is already signed in with.')
  process.exit(1)
}
console.log('   user id:', userId)

// ── 2. Confirm the role exists ────────────────────────────────────────────
step(2, `Checking the ${seat.slug} role is defined`)
const { data: roleRow, error: roleError } = await admin
  .from('role_definitions')
  .select('slug, label, tier')
  .eq('slug', seat.slug)
  .maybeSingle()

if (roleError) {
  console.error('   FAILED:', roleError.message)
  process.exit(1)
}
if (!roleRow) {
  console.error(`   The role '${seat.slug}' does not exist in role_definitions.`)
  console.error('   Apply supabase/migrations/116_supervisor_roles.sql first.')
  process.exit(1)
}
console.log(`   found: ${roleRow.label} (${roleRow.tier} tier)`)

// ── 3. Read the current roles and merge ───────────────────────────────────
step(3, 'Reading current profile')
const { data: profile, error: readError } = await admin
  .from('profiles')
  .select('id, display_name, roles, active_role, is_suspended')
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
console.log('   name: ', profile.display_name || '(none)')
console.log('   roles currently:', JSON.stringify(current))

if (profile.is_suspended) {
  // has_permission() returns FALSE for a suspended account before it reads the
  // matrix, so the grant would appear to work and every check below would fail.
  console.error('\n   This account is SUSPENDED. Lift the suspension first —')
  console.error('   has_permission() refuses a suspended account before it')
  console.error('   consults the permission matrix, so the seat would do nothing.')
  process.exit(1)
}

if (current.includes('super_admin') || current.includes('oecs')) {
  console.warn('\n   NOTE: this account is already a Super Admin, which holds every')
  console.warn('   key. Adding a supervisor seat on top changes nothing and the')
  console.warn('   negative checks in step 5 will fail — correctly. Remove the')
  console.warn('   admin roles first if the point is to test the split.')
}

const next = [...new Set([...current, seat.slug])]
if (next.length === current.length) {
  console.log('\n   Already holds this seat — nothing to change.')
} else {
  step(4, `Granting '${seat.slug}' (merged, keeping existing roles)`)
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

  if (!updated.roles?.includes(seat.slug)) {
    console.error('\n   The role was stripped. That means auth.uid() was NOT null for this')
    console.error('   connection, so guard_profile_privileged_columns rejected the change.')
    console.error('   Confirm SUPABASE_SECRET_KEY is the secret key, not the publishable one.')
    process.exit(1)
  }
}

// ── 5. Verify the seat, in both directions ────────────────────────────────
step(5, 'Verifying permissions via has_permission()')

async function check(permission) {
  const { data, error } = await admin.rpc('has_permission', {
    p_user: userId,
    p_permission: permission,
  })
  if (error) {
    console.error(`   RPC FAILED for ${permission}:`, error.message)
    return null
  }
  return data === true
}

let allOk = true

console.log('\n   Holds:')
for (const [permission, used] of seat.expect) {
  const held = await check(permission)
  const ok = held === true
  if (!ok) allOk = false
  console.log(`     ${ok ? 'PASS' : 'FAIL'}  ${permission.padEnd(20)} ${used}`)
}

console.log('\n   Does not hold:')
for (const [permission, why] of seat.deny) {
  const held = await check(permission)
  const ok = held === false
  if (!ok) allOk = false
  console.log(`     ${ok ? 'PASS' : 'FAIL'}  ${permission.padEnd(20)} ${why}`)
}

console.log('\n' + '─'.repeat(72))
console.log(allOk ? 'READY' : 'COMPLETED WITH FAILURES')
console.log('  email:   ', email)
console.log('  user id: ', userId)
console.log('  seat:    ', seat.label)
console.log('  owns:    ', seat.owns)
console.log('  password unchanged')
console.log('─'.repeat(72))
console.log('\nHave them sign out and back in (or hard-refresh) so AuthContext')
console.log('re-reads the permissions, then open /admin. The sidebar should show')
console.log('their pages and nothing else.')
console.log('\nTheir QA document is docs/QA-' + (seatArg === 'people' ? 'MARVIN-PEOPLE' : 'ROYSTON-PROGRAMMES') + '.md')
process.exit(allOk ? 0 : 1)
