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
// Since 181 only a grant's created_by can decide its applications, so every
// demo grant belongs to Sandra Mitchell, the demo investor.
const GRANT_OWNER_ID = 'a0000000-0000-0000-0000-000000000011'

// Deadlines are absolute so re-running does not push them out;
// `npm run seed:dates` re-applies them. The first is already past, so the
// closed state shows.
const DEMO_GRANTS = [
  {
    title: `OECS Blue Economy Innovation Fund`,
    description:
      'Seed money for fisheries and marine ventures in OECS member states. Past awards paid for sargassum collection trials off Dominica and a fish-landing logbook app used in Gros Islet.',
    amount_min: 15000,
    amount_max: 75000,
    grant_type: 'innovation',
    deadline: '2027-02-05T23:59:00Z',
  },
  {
    title: `Caribbean AgriTech Accelerator Grant`,
    description:
      'Twelve months of funding and mentoring for farm technology pilots. Priority goes to banana, nutmeg and root crop growers who sell into local hotels or the regional market.',
    amount_min: 10000,
    amount_max: 50000,
    grant_type: 'startup',
    deadline: '2027-01-22T23:59:00Z',
  },
  {
    title: `Digital Skills & EdTech Research Award`,
    description:
      'Applied research on teaching with poor or patchy internet. Studies must run in at least two member states and report results by school term.',
    amount_min: 5000,
    amount_max: 30000,
    grant_type: 'research',
    // The closed one on purpose: its demo application is the rejected one.
    deadline: '2026-10-30T23:59:00Z',
  },
  {
    title: `Renewable Energy Feasibility Grant`,
    description:
      'Covers feasibility studies for community solar and geothermal projects, including site surveys, grid studies and a costed plan a lender can read.',
    amount_min: 20000,
    amount_max: 120000,
    grant_type: 'development',
    deadline: '2027-02-19T23:59:00Z',
  },
]

/** Each application: status now + the backdated chain that got it there. */
const APPLICATIONS = [
  {
    grant: 0,
    status: 'approved',
    summary:
      'Six solar sensor buoys on the reef at Soufrière, reporting water temperature to the Fisheries Department every 15 minutes. The grant pays for the hardware and a year of data costs.',
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
    summary:
      'A weekly order sheet linking 40 farmers in the Babonneau cooperative with hotel kitchens around Rodney Bay.',
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
    summary:
      'A term-long study of an offline learning app in three secondary schools, two in Kingstown and one on Bequia. We would compare module completion against classes using the online platform only.',
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
    summary:
      'Feasibility study for a 250 kW rooftop solar array shared by three health centres near Roseau, with battery storage for hurricane season.',
    createdDays: 12,
    updatedDays: 3,
    events: [{ status: 'draft', days: 12 }],
  },
]

const PROJECTS = [
  {
    title: `Reef Guard: Coral Health Monitoring`,
    summary: 'Low-cost sensor buoys that post reef temperature and turbidity to a public dashboard.',
    description:
      'Reef Guard pairs solar buoys with a gateway on shore, so fisheries officers see bleaching conditions building days before divers would. Six buoys are in the water in Soufrière Bay.',
    category: 'environment',
    phase: 'launch',
    is_innovation: true,
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
    title: `HarvestLink: Farmer to Hotel Marketplace`,
    summary: 'Small farms sell to hotel kitchens through one weekly order.',
    description:
      'Each Monday HarvestLink collects what cooperative farmers expect to pick that week and turns it into one order sheet for hotel buyers. Payment goes to the cooperative, which pays its members.',
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
    title: `SkillBridge: Offline-First Learning`,
    summary: 'Course modules that keep working when the internet drops on the smaller islands.',
    description:
      'Students download a week of lessons while they have a signal and keep working through outages. Quiz results sync to the college system the next time the phone connects.',
    category: 'education',
    phase: 'prototype',
    is_innovation: true,
    createdDays: 54,
    updatedDays: 9,
    events: [
      { phase: 'concept', days: 54 },
      { phase: 'prototype', days: 9 },
    ],
  },
  {
    title: `CareRoute: Island Telehealth Triage`,
    summary: 'Nurses at rural clinics send each case to the right doctor on another island.',
    description:
      'Many district clinics run without a resident doctor. CareRoute lets the duty nurse log a case, send it to an on-call doctor in Castries or Kingstown, and keep one record that both can read.',
    category: 'healthcare',
    phase: 'concept',
    createdDays: 23,
    updatedDays: 23,
    events: [{ phase: 'concept', days: 23 }],
  },
]

// Project titles from earlier runs (em dashes, before the copy pass). --clean
// matches exact titles, so these are listed too or the old rows would stay.
const LEGACY_TITLES = [
  'Reef Guard — Coral Health Monitoring',
  'HarvestLink — Farmer to Hotel Marketplace',
  'SkillBridge — Offline-First Learning',
  'CareRoute — Island Telehealth Triage',
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
    .in('title', [...PROJECTS.map((p) => p.title), ...LEGACY_TITLES])
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
      DEMO_GRANTS.map((g) => ({
        ...g,
        currency: 'USD',
        is_active: true,
        eligibility:
          'Open to registered businesses, cooperatives and individuals living in an OECS member state.',
        created_by: GRANT_OWNER_ID,
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
          summary: spec.summary,
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
