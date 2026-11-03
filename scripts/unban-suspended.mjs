#!/usr/bin/env node
/**
 * Clears the GoTrue sign-in bans that suspension used to set.
 *
 * Usage — run from the repo root:
 *   node --env-file=.env scripts/unban-suspended.mjs                   # dry run, lists only
 *   node --env-file=.env scripts/unban-suspended.mjs --apply           # clears every ban found
 *   node --env-file=.env scripts/unban-suspended.mjs --apply --suspended-only
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 * Apply migration 184 and deploy the new api/admin/suspend-user.ts first, or
 * the next suspension bans again.
 *
 * Until 184, api/admin/suspend-user.ts banned the auth user on every
 * suspension, so a suspended member could not sign in to read why or to appeal.
 * Suspension is now enforced in SQL alone (has_permission() refuses a suspended
 * account) and the client holds the session on /account/suspended. This lifts
 * the old bans so those members can reach that page.
 *
 * Each banned account is listed with its profile's suspension state:
 *   suspended      still suspended; after the unban they land on /account/suspended
 *   not suspended  reinstated, but the ban outlived it (a failed unban), or
 *                  banned by hand in the Supabase dashboard. Check these before
 *                  applying, or pass --suspended-only to leave them alone.
 *
 * The profile row is never touched: unbanning does not reinstate anyone.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

const apply = process.argv.includes('--apply')
const suspendedOnly = process.argv.includes('--suspended-only')

if (!url || !secret) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY.')
  process.exit(1)
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

async function listBannedUsers() {
  const banned = []
  const now = Date.now()
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const users = data?.users ?? []
    for (const user of users) {
      const until = user.banned_until ? Date.parse(user.banned_until) : NaN
      if (!Number.isNaN(until) && until > now) banned.push(user)
    }
    if (users.length < 1000) break
  }
  return banned
}

async function suspensionById(ids) {
  const map = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data, error } = await admin
      .from('profiles')
      .select('id, display_name, is_suspended, suspended_until')
      .in('id', chunk)
    if (error) throw error
    for (const row of data ?? []) map.set(row.id, row)
  }
  return map
}

const banned = await listBannedUsers()
if (banned.length === 0) {
  console.log('No banned accounts. Nothing to do.')
  process.exit(0)
}

const profiles = await suspensionById(banned.map((user) => user.id))

let cleared = 0
let skipped = 0
let failed = 0

for (const user of banned) {
  const profile = profiles.get(user.id)
  const suspended = !!profile?.is_suspended
  const label = `${user.email ?? user.id} (${profile?.display_name ?? 'no profile'})`
  const state = suspended
    ? `suspended${profile.suspended_until ? ` until ${profile.suspended_until}` : ''}`
    : 'not suspended'

  if (suspendedOnly && !suspended) {
    console.log(`skip    ${label} — ${state}, banned until ${user.banned_until}`)
    skipped++
    continue
  }

  if (!apply) {
    console.log(`would   ${label} — ${state}, banned until ${user.banned_until}`)
    continue
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { ban_duration: 'none' })
  if (error) {
    console.log(`FAILED  ${label} — ${error.message}`)
    failed++
  } else {
    console.log(`cleared ${label} — ${state}`)
    cleared++
  }
}

console.log('')
if (apply) {
  console.log(`${cleared} cleared, ${skipped} skipped, ${failed} failed, of ${banned.length} banned.`)
} else {
  console.log(`Dry run: ${banned.length - skipped} would be cleared, ${skipped} skipped. Re-run with --apply to write.`)
}
process.exit(failed > 0 ? 1 : 0)
