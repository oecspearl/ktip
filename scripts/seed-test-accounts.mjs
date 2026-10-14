#!/usr/bin/env node
/**
 * Creates (or resets) one ready-to-use login per role, so testers can sign in
 * and go straight to work without signing up, onboarding or waiting on review.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/seed-test-accounts.mjs [--password 'Shared!Pass1'] [--domain ktip.test] [--only student,faculty]
 *
 * Requires VITE_SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * and the publishable key (VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY).
 *
 * Idempotent: re-running resets every account's password, roles and profile
 * to the values below. Credentials are printed and written to
 * docs/test-accounts.csv (docs/ is gitignored).
 *
 * WHAT A FRESH ACCOUNT OWES, AND HOW EACH IS SETTLED
 * --------------------------------------------------
 *   requires_age_declaration  declare_date_of_birth(), signed in AS the user,
 *                             exactly as OnboardingPage calls it.
 *   requires_consent          record_consent() for the `account` bundle only.
 *                             Publishing, competition and application consent
 *                             are left owing on purpose: they gate an action,
 *                             and testers should see those notices.
 *   roles = {}                service-key UPDATE, the only path the 063 guards
 *                             permit (see create-admin.mjs for the long form).
 *   requires_mfa_enrollment   mfa_grandfathered = TRUE. Entrepreneur requires
 *                             MFA (118), and the step-up mails a code to an
 *                             inbox a test domain does not have.
 *   verification              is_verified = TRUE, plus an approved
 *                             institution_members row for the roles whose
 *                             duties derive from one (student, faculty,
 *                             post-secondary institution, chamber).
 *
 * WHAT IS NOT CREATED
 * -------------------
 *   super_admin  migration 143 caps the seat at 1 and it is held. The cap's
 *                escape hatch is not something a seed script should reach for.
 *   oecs         legacy alias of super_admin; same seat.
 *   admin        capped at 2. Created if a seat is free, reported if not.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const USAGE =
  "Usage: node --env-file=.env scripts/seed-test-accounts.mjs [--password 'Shared!Pass1'] [--domain ktip.test] [--only slug,slug]"

if (!url || !secret || !publishable) {
  console.error('Missing VITE_SUPABASE_URL, SUPABASE_SECRET_KEY or the publishable key.')
  console.error(USAGE)
  process.exit(1)
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const domain = (arg('domain') || 'ktip.test').toLowerCase()
// One password for every account, so a tester can hop between roles. Generated
// when omitted so it is never a guessable default someone later reuses.
const password = arg('password') || `Ktip!${crypto.randomUUID().slice(0, 12)}`
const only = arg('only')?.split(',').map((s) => s.trim())

const COUNTRY = 'Saint Lucia'
const COUNTRY_CODE = 'LC'

// institution: which test institution the account sits in, and as what. The
// role's duties read from that row (chamber_countries(), student approval,
// faculty supervision), so without it the role is a label with nothing behind it.
const ACCOUNTS = [
  // Admin tier
  { slug: 'admin', name: 'Test Admin', org: 'OECS Commission' },
  { slug: 'people_supervisor', name: 'Test People Supervisor', org: 'OECS Commission' },
  { slug: 'programme_supervisor', name: 'Test Programmes Supervisor', org: 'OECS Commission' },
  { slug: 'safety_admin', name: 'Test Safety Admin', org: 'OECS Commission' },
  // Organisation tier
  { slug: 'chamber_admin', name: 'Test Chamber', org: 'Test Chamber of Commerce', institution: ['chamber', 'admin'] },
  { slug: 'diaspora', name: 'Test Diaspora Network', org: 'Test Diaspora Network' },
  { slug: 'educational_partner', name: 'Test College', org: 'Test Community College', institution: ['university', 'admin'] },
  { slug: 'government', name: 'Test Ministry', org: 'Test Ministry of Innovation' },
  { slug: 'igo', name: 'Test Regional Body', org: 'Test Regional Organisation' },
  { slug: 'investor', name: 'Test Investor', org: 'Test Ventures Fund' },
  { slug: 'ngo', name: 'Test NGO', org: 'Test Foundation' },
  { slug: 'private_sector', name: 'Test Business', org: 'Test Trading Ltd' },
  { slug: 'research_institution', name: 'Test Research Institute', org: 'Test Research Institute' },
  // Individual tier
  { slug: 'entrepreneur', name: 'Test Entrepreneur', org: 'Test Startup' },
  { slug: 'faculty', name: 'Test Faculty', org: 'Test Community College', institution: ['university', 'educator'] },
  { slug: 'ip_legal', name: 'Test IP Lawyer', org: 'Test Chambers & Co' },
  { slug: 'mentor', name: 'Test Mentor', org: null },
  { slug: 'researcher', name: 'Test Researcher', org: 'Test Research Institute' },
  { slug: 'student', name: 'Test Student', org: 'Test Community College', institution: ['university', 'student'] },
].filter((a) => !only || only.includes(a.slug))

const TEST_INSTITUTIONS = {
  university: { slug: 'ktip-test-college', name: 'Test Community College', kind: 'university' },
  chamber: { slug: 'ktip-test-chamber', name: 'Test Chamber of Commerce', kind: 'chamber' },
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const emailFor = (slug) => `test.${slug.replace(/_/g, '-')}@${domain}`

// Not listUsers: on this project it fails with "Database error finding users",
// because supabase/seed.sql inserts auth.users rows with NULL token columns
// (email_change and friends) that GoTrue cannot scan. generateLink looks up a
// single account by email and returns it; it sends no mail.
async function findUserId(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`look up existing user: ${error.message}`)
  return data.user.id
}

async function upsertAuthUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no verification mail; the account can log in at once
    user_metadata: { display_name: name },
  })
  if (!error) return { id: data.user.id, created: true }

  const alreadyExists = error.status === 422 || /already/i.test(error.message)
  if (!alreadyExists) throw new Error(`createUser: ${error.message}`)

  const id = await findUserId(email)
  const reset = await admin.auth.admin.updateUserById(id, {
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  if (reset.error) throw new Error(`reset password: ${reset.error.message}`)
  return { id, created: false }
}

// on_auth_user_created is AFTER INSERT and may not have committed yet.
async function waitForProfile(id) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
    if (data) return
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('profile row never appeared (on_auth_user_created did not fire)')
}

// The two onboarding debts, settled through the same RPCs the onboarding page
// uses, under the user's own session so auth.uid() resolves.
async function onboardAsUser(email) {
  const asUser = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInError } = await asUser.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`sign-in: ${signInError.message}`)

  const dob = await asUser.rpc('declare_date_of_birth', { p_dob: '1990-01-01', p_source: 'onboarding' })
  if (dob.error) throw new Error(`declare_date_of_birth: ${dob.error.message}`)
  if (dob.data?.ok !== true && dob.data?.reason !== 'already_declared') {
    throw new Error(`declare_date_of_birth: ${dob.data?.reason}`)
  }

  const consent = await asUser.rpc('record_consent', {
    p_keys: ['terms', 'privacy', 'acceptable-use', 'safeguarding'],
    p_locale: 'en',
    p_context: 'onboarding',
    p_user_agent: 'scripts/seed-test-accounts.mjs',
    p_expected_version: 1,
  })
  if (consent.error) throw new Error(`record_consent: ${consent.error.message}`)
  if (consent.data?.ok !== true) throw new Error(`record_consent: ${consent.data?.reason}`)

  await asUser.auth.signOut()
}

async function ensureInstitution(kind, verifiedBy) {
  const spec = TEST_INSTITUTIONS[kind]
  const { data: found, error } = await admin
    .from('institutions')
    .select('id, status')
    .eq('slug', spec.slug)
    .maybeSingle()
  if (error) throw new Error(`institutions: ${error.message}`)
  if (found) return found.id

  const { data, error: insertError } = await admin
    .from('institutions')
    .insert({
      slug: spec.slug,
      name: spec.name,
      kind: spec.kind,
      country_code: COUNTRY_CODE,
      // No email domains: a domain here would auto-route real signups to it.
      email_domains: [],
      status: 'verified',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      review_note: 'Test institution created by scripts/seed-test-accounts.mjs',
      created_by: verifiedBy,
    })
    .select('id')
    .single()
  if (insertError) throw new Error(`create institution ${spec.slug}: ${insertError.message}`)
  return data.id
}

async function linkInstitution(userId, [kind, memberRole], verifiedBy) {
  const institutionId = await ensureInstitution(kind, verifiedBy)
  const now = new Date().toISOString()
  const { error } = await admin.from('institution_members').upsert(
    {
      institution_id: institutionId,
      user_id: userId,
      role: memberRole,
      status: 'approved',
      approved_by: verifiedBy,
      approved_at: now,
    },
    { onConflict: 'institution_id,user_id' }
  )
  if (error) throw new Error(`institution_members: ${error.message}`)

  if (memberRole === 'student') {
    const { error: sgError } = await admin.from('student_safeguarding').upsert(
      { user_id: userId, institution_id: institutionId, verified_domain: domain },
      { onConflict: 'user_id' }
    )
    if (sgError) throw new Error(`student_safeguarding: ${sgError.message}`)
  }
}

// What the browser will see on first load: every gate ProtectedRoute reads
// must be clear, and the permission set must be non-empty.
async function verifyAsUser(email) {
  const asUser = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: session, error } = await asUser.auth.signInWithPassword({ email, password })
  if (error) return `sign-in failed: ${error.message}`
  await asUser.rpc('ensure_my_mfa_status')
  const { data: p } = await asUser
    .from('profiles')
    .select('roles, requires_age_declaration, requires_consent, requires_mfa_enrollment')
    .eq('id', session.user.id)
    .single()
  const { data: perms } = await asUser.rpc('get_my_permissions')
  await asUser.auth.signOut()

  const owed = [
    !p?.roles?.length && 'no role',
    p?.requires_age_declaration && 'age declaration',
    p?.requires_consent && 'consent',
    p?.requires_mfa_enrollment && 'MFA enrolment',
    !perms?.length && 'no permissions',
  ].filter(Boolean)
  return owed.length ? `still owes: ${owed.join(', ')}` : `ok (${perms.length} permissions)`
}

// ── Run ─────────────────────────────────────────────────────────────────────
console.log(`Seeding ${ACCOUNTS.length} test accounts on @${domain}\n`)

const results = []

// Institutions need a verifier; the first account through (admin, when
// included) signs for them. Any created profile satisfies the FK.
let verifier = null

for (const account of ACCOUNTS) {
  const email = emailFor(account.slug)
  const row = { role: account.slug, email, password, status: '' }
  try {
    const { id, created } = await upsertAuthUser(email, account.name)
    await waitForProfile(id)
    await onboardAsUser(email)

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        roles: [account.slug],
        active_role: null,
        display_name: account.name,
        organization: account.org,
        country: COUNTRY,
        bio: `Shared test account for the ${account.slug} role. Data here is not real.`,
        is_verified: true,
        is_suspended: false,
        mfa_grandfathered: true,
        requires_mfa_enrollment: false,
      })
      .eq('id', id)
    if (updateError) {
      // guard_admin_seat_capacity (143) raises when both Admin seats are taken.
      throw new Error(
        /seat/i.test(updateError.message)
          ? `seat cap reached (${updateError.message})`
          : `profile update: ${updateError.message}`
      )
    }

    verifier ??= id
    if (account.institution) await linkInstitution(id, account.institution, verifier)

    row.status = `${created ? 'created' : 'reset'}, ${await verifyAsUser(email)}`
  } catch (e) {
    row.status = `FAILED: ${e.message}`
  }
  results.push(row)
  console.log(`${row.role.padEnd(22)} ${email.padEnd(42)} ${row.status}`)
}

mkdirSync('docs', { recursive: true })
const csv = ['role,email,password,status']
  .concat(results.map((r) => [r.role, r.email, r.password, `"${r.status.replace(/"/g, "'")}"`].join(',')))
  .join('\n')
writeFileSync('docs/test-accounts.csv', csv + '\n')

const failed = results.filter((r) => r.status.startsWith('FAILED') || r.status.includes('owes'))
console.log('\n' + '─'.repeat(64))
console.log(`Password for every account: ${password}`)
console.log('Written to docs/test-accounts.csv (gitignored).')
console.log(failed.length ? `${failed.length} account(s) need attention, see above.` : 'All accounts ready.')
console.log('─'.repeat(64))
process.exit(failed.length ? 1 : 0)
