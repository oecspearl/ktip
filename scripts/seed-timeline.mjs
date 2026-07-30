/**
 * Seed demo progress-timeline data for one user (dashboard Gantt chart).
 *
 * Creates grant applications and projects at varying stages, then rewrites
 * their history rows (grant_application_events / project_phase_events) with
 * backdated timestamps so the chart renders real-looking bars instead of
 * everything collapsing onto today.
 *
 * Usage:
 *   node scripts/seed-timeline.mjs <user-id|display name>          # seed
 *   node scripts/seed-timeline.mjs <user-id|display name> --clean  # remove seeded rows
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 * The service role bypasses RLS, which is required: the *_events tables
 * deliberately have no INSERT policy (046_progress_history.sql).
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// --- env ---------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const who = process.argv[2]
const clean = process.argv.includes('--clean')
if (!who) {
  console.error('Usage: node scripts/seed-timeline.mjs <user-id|display name> [--clean]')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// Titles are shown verbatim in the UI, so they carry no visible marker:
// --clean matches the exact demo titles below instead of a prefix.

// --- helpers -----------------------------------------------------------
const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const ago = (days) => new Date(now - days * DAY).toISOString()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve against `profiles`, not auth.admin.listUsers — this project's
 * auth schema currently 500s on that endpoint, and profiles carries no
 * email column, so identify by id or display name.
 */
async function findUser(ref) {
  const q = UUID_RE.test(ref)
    ? db.from('profiles').select('id,display_name').eq('id', ref)
    : db.from('profiles').select('id,display_name').ilike('display_name', ref)
  const { data, error } = await q
  if (error) throw error
  if (!data?.length) throw new Error(`No profile matching "${ref}"`)
  if (data.length > 1)
    throw new Error(
      `"${ref}" matches ${data.length} profiles — pass an id: ${data.map((d) => d.id).join(', ')}`
    )
  return data[0]
}

/** Replace trigger-written history with our backdated chain. */
async function setEvents(table, fkColumn, id, rows) {
  const del = await db.from(table).delete().eq(fkColumn, id)
  if (del.error) throw del.error
  const ins = await db.from(table).insert(rows.map((r) => ({ ...r, [fkColumn]: id })))
  if (ins.error) throw ins.error
}

// --- demo content ------------------------------------------------------
const DEMO_GRANTS = [
  {
    title: `OECS Blue Economy Innovation Fund`,
    description: 'Seed capital for marine-tech and sustainable fisheries ventures across the OECS.',
    amount_min: 15000,
    amount_max: 75000,
    grant_type: 'innovation',
  },
  {
    title: `Caribbean AgriTech Accelerator Grant`,
    description: 'Funding for climate-resilient agriculture pilots in the Eastern Caribbean.',
    amount_min: 10000,
    amount_max: 50000,
    grant_type: 'startup',
  },
  {
    title: `Digital Skills & EdTech Research Award`,
    description: 'Applied research into digital learning delivery for small island states.',
    amount_min: 5000,
    amount_max: 30000,
    grant_type: 'research',
  },
  {
    title: `Renewable Energy Feasibility Grant`,
    description: 'Feasibility studies for community-scale solar and geothermal projects.',
    amount_min: 20000,
    amount_max: 120000,
    grant_type: 'development',
  },
]

/** Each application: status now + the backdated chain that got it there. */
const APPLICATIONS = [
  {
    grant: 0,
    status: 'approved',
    createdDays: 118,
    updatedDays: 34,
    events: [
      { status: 'draft', days: 118 },
      { status: 'pending', days: 104 },
      { status: 'under_review', days: 71 },
      { status: 'approved', days: 34 },
    ],
  },
  {
    grant: 1,
    status: 'under_review',
    createdDays: 76,
    updatedDays: 21,
    events: [
      { status: 'draft', days: 76 },
      { status: 'pending', days: 63 },
      { status: 'under_review', days: 21 },
    ],
  },
  {
    grant: 2,
    status: 'rejected',
    createdDays: 152,
    updatedDays: 96,
    events: [
      { status: 'pending', days: 152 },
      { status: 'under_review', days: 129 },
      { status: 'rejected', days: 96 },
    ],
  },
  {
    grant: 3,
    status: 'draft',
    createdDays: 12,
    updatedDays: 3,
    events: [{ status: 'draft', days: 12 }],
  },
]

const PROJECTS = [
  {
    title: `Reef Guard — Coral Health Monitoring`,
    summary: 'Low-cost sensor buoys streaming reef temperature and turbidity to a public dashboard.',
    description:
      'Reef Guard pairs solar buoys with a shore-side gateway so fisheries officers can spot bleaching conditions days earlier. Piloting in Soufrière Bay.',
    category: 'environment',
    phase: 'launch',
    createdDays: 165,
    updatedDays: 18,
    events: [
      { phase: 'concept', days: 165 },
      { phase: 'prototype', days: 122 },
      { phase: 'funding', days: 67 },
      { phase: 'launch', days: 18 },
    ],
  },
  {
    title: `HarvestLink — Farmer to Hotel Marketplace`,
    summary: 'Matching smallholder produce with hotel kitchens on a weekly ordering cycle.',
    description:
      'HarvestLink aggregates weekly availability from farm cooperatives and turns it into a single order sheet for hotel procurement teams.',
    category: 'agriculture',
    phase: 'funding',
    createdDays: 98,
    updatedDays: 26,
    events: [
      { phase: 'concept', days: 98 },
      { phase: 'prototype', days: 55 },
      { phase: 'funding', days: 26 },
    ],
  },
  {
    title: `SkillBridge — Offline-First Learning`,
    summary: 'Course delivery that survives patchy connectivity on smaller islands.',
    description:
      'A sync-on-reconnect learning client so students keep progressing through modules during outages, then reconcile with the campus LMS.',
    category: 'education',
    phase: 'prototype',
    createdDays: 54,
    updatedDays: 9,
    events: [
      { phase: 'concept', days: 54 },
      { phase: 'prototype', days: 9 },
    ],
  },
  {
    title: `CareRoute — Island Telehealth Triage`,
    summary: 'Nurse-led triage routing for clinics without a resident physician.',
    description:
      'A triage queue that routes clinic visits to the right remote specialist and keeps a shared case record across islands.',
    category: 'healthcare',
    phase: 'concept',
    createdDays: 23,
    updatedDays: 23,
    events: [{ phase: 'concept', days: 23 }],
  },
]

// --- clean -------------------------------------------------------------
async function removeSeed(userId) {
  const { data: grants } = await db
    .from('grants')
    .select('id')
    .in('title', DEMO_GRANTS.map((g) => g.title))
  const grantIds = (grants ?? []).map((g) => g.id)

  if (grantIds.length) {
    // Applications cascade from grants, and events cascade from applications.
    const del = await db.from('grants').delete().in('id', grantIds)
    if (del.error) throw del.error
  }

  const delProjects = await db
    .from('projects')
    .delete()
    .eq('owner_id', userId)
    .in('title', PROJECTS.map((p) => p.title))
  if (delProjects.error) throw delProjects.error

  console.log(`Removed ${grantIds.length} demo grants (+ their applications) and demo projects.`)
}

// --- seed --------------------------------------------------------------
async function main() {
  const user = await findUser(who)
  console.log(`User: ${user.display_name} (${user.id})`)

  // Always clear a previous run so re-seeding is idempotent.
  await removeSeed(user.id)
  if (clean) return

  // 1. Grants to apply against.
  const grantIns = await db
    .from('grants')
    .insert(
      DEMO_GRANTS.map((g, i) => ({
        ...g,
        currency: 'USD',
        is_active: true,
        eligibility: 'Registered entities or individuals resident in an OECS member state.',
        deadline: ago(-30 - i * 20),
        created_at: ago(200),
      }))
    )
    .select('id,title')
  if (grantIns.error) throw grantIns.error
  console.log(`Created ${grantIns.data.length} demo grants.`)

  // 2. Applications + backdated status history.
  for (const spec of APPLICATIONS) {
    const grant = grantIns.data[spec.grant]
    const ins = await db
      .from('grant_applications')
      .insert({
        grant_id: grant.id,
        user_id: user.id,
        status: spec.status,
        application_data: {
          summary: `Demo application for ${grant.title}.`,
          amount_requested: 25000,
          seeded: true,
        },
        created_at: ago(spec.createdDays),
        updated_at: ago(spec.updatedDays),
      })
      .select('id')
      .single()
    if (ins.error) throw ins.error

    await setEvents('grant_application_events', 'application_id', ins.data.id, [
      ...spec.events.map((e) => ({ status: e.status, created_at: ago(e.days) })),
    ])
    console.log(`  application: ${grant.title} → ${spec.status}`)
  }

  // 3. Projects + backdated phase history.
  for (const spec of PROJECTS) {
    const { events, createdDays, updatedDays, ...fields } = spec
    const ins = await db
      .from('projects')
      .insert({
        ...fields,
        owner_id: user.id,
        is_public: true,
        hashtags: ['demo', fields.category],
        created_at: ago(createdDays),
        updated_at: ago(updatedDays),
      })
      .select('id')
      .single()
    if (ins.error) throw ins.error

    await setEvents('project_phase_events', 'project_id', ins.data.id, [
      ...events.map((e) => ({ phase: e.phase, created_at: ago(e.days) })),
    ])
    console.log(`  project: ${fields.title} → ${fields.phase}`)
  }

  console.log('\nDone. Reload /dashboard/progress.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
