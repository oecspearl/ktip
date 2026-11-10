/**
 * Put the seeded demo calendar back where the demo needs it.
 *
 * Three kinds of date live in the demo data:
 *
 *   live     The hackathons that power the venue demo. They are only worth
 *            anything while they are in progress, so they stay pinned around
 *            today: started a day or two ago, ending in two or three weeks.
 *
 *   season   Everything upcoming: workshops, meetups, challenges, the
 *            conference, grant deadlines. These are absolute dates, mostly
 *            closing between mid January and the end of February 2027, so the
 *            demo stays current for months without anyone touching it. Two
 *            December events and two December grant deadlines keep the
 *            "happening soon" and "closing soon" states visible.
 *
 *   past     Completed events. Left alone; the seeds put them in the past and
 *            they stay there.
 *
 * When the season is nearly over (its last date is under two weeks away), the
 * whole season moves forward by whole quarters of 13 weeks, which keeps every
 * event on the same weekday and the same spacing. Nothing moves before then, so
 * running this twice in January changes nothing.
 *
 * Usage:
 *   npm run seed:dates             # apply
 *   npm run seed:dates -- --dry-run
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Events and
 * grants are writable only by their owners or an admin, and this runs as
 * neither.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// --- env ---------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// --- time helpers ------------------------------------------------------
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const QUARTER = 91 * DAY // 13 weeks: same weekday, same spacing
const now = Date.now()
const rel = (ms) => new Date(now + ms).toISOString()
const eventId = (n) => `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const grantId = (n) => `f0000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// --- live events (relative to now) -------------------------------------
const LIVE = [
  {
    id: eventId(1),
    label: 'OECS Innovation Hackathon',
    patch: { start_date: rel(-1 * DAY), end_date: rel(5 * DAY), submission_deadline: rel(4 * DAY) },
  },
  {
    id: eventId(7),
    label: 'OECS Climathon: Virtual Build Fortnight',
    patch: {
      start_date: rel(-1 * DAY),
      end_date: rel(12 * DAY),
      submission_deadline: rel(10 * DAY),
      venue_opens_at: rel(-2 * DAY),
      venue_closes_at: rel(13 * DAY),
    },
  },
  {
    id: eventId(21),
    label: 'OECS Blue Economy Hackathon: Virtual Build Fortnight',
    patch: {
      start_date: rel(-2 * DAY),
      end_date: rel(14 * DAY),
      submission_deadline: rel(12 * DAY),
      venue_opens_at: rel(-3 * DAY),
      venue_closes_at: rel(15 * DAY),
    },
  },
  {
    id: 'e7000000-0000-4000-8000-000000000188',
    label: 'KTIP Test Hackathon: Five-Floor Venue',
    patch: {
      start_date: rel(-1 * DAY),
      end_date: rel(21 * DAY),
      submission_deadline: rel(18 * DAY),
      venue_opens_at: rel(-2 * DAY),
      venue_closes_at: rel(22 * DAY),
    },
  },
]

// --- season (absolute; must match the SQL seeds) -----------------------
// `status` is forced on every season event. 0017 is the draft and 0018 the
// cancelled event, and publishing them would delete the only demo data those
// two states have. Challenges carry end_date = submission_deadline: a null end
// reads as start + 24h in eventPhase, which would end a three-week challenge
// on its second day.
const SEASON_EVENTS = [
  { n: 3, label: 'Caribbean Climate Tech Meetup', start: '2026-12-03T22:00:00Z', end: '2026-12-04T01:00:00Z' },
  { n: 2, label: 'Intro to IoT for Agriculture Workshop', start: '2026-12-10T13:00:00Z', end: '2026-12-10T19:00:00Z' },
  { n: 11, label: 'Coastal Data Challenge', start: '2027-01-11T13:00:00Z', end: '2027-02-01T03:59:00Z', deadline: true },
  { n: 9, label: 'Grant Writing Clinic for Climate Founders', start: '2027-01-14T14:00:00Z', end: '2027-01-14T18:00:00Z' },
  { n: 14, label: 'Renewable Energy Innovation Challenge', start: '2027-01-18T13:00:00Z', end: '2027-02-26T23:00:00Z', deadline: true },
  { n: 10, label: 'Women in Tech OECS: Founders Circle', start: '2027-01-21T22:00:00Z', end: '2027-01-22T00:30:00Z' },
  { n: 12, label: 'Pitch Perfect: Investor Readiness Bootcamp', start: '2027-01-28T13:00:00Z', end: '2027-01-28T21:00:00Z' },
  { n: 18, label: 'Island Maker Faire', start: '2027-01-30T13:00:00Z', end: '2027-01-30T21:00:00Z', status: 'cancelled' },
  { n: 13, label: 'Montserrat Digital Skills Fair', start: '2027-02-04T14:00:00Z', end: '2027-02-04T20:00:00Z' },
  { n: 5, label: 'Demo Day: Cohort 3 Startups', start: '2027-02-11T14:00:00Z', end: '2027-02-11T18:00:00Z' },
  { n: 17, label: 'OECS Fintech Regulatory Sandbox Briefing', start: '2027-02-15T14:00:00Z', end: '2027-02-15T20:00:00Z', status: 'draft' },
  { n: 15, label: 'OECS Youth Robotics Showcase', start: '2027-02-18T13:00:00Z', end: '2027-02-18T18:00:00Z' },
  { n: 4, label: 'OECS Digital Economy Conference 2027', start: '2027-02-23T13:00:00Z', end: '2027-02-25T21:00:00Z' },
  { n: 16, label: 'Blue Economy Founders Retreat', start: '2027-02-26T13:00:00Z', end: '2027-02-28T20:00:00Z' },
]

const SEASON_GRANTS = [
  { id: grantId(1), label: 'OECS Innovation Seed Fund', deadline: '2026-12-11T23:59:00Z' },
  { id: grantId(6), label: 'Caribbean Angel Network Pitch Competition', deadline: '2026-12-18T23:59:00Z' },
  { id: grantId(2), label: 'Caribbean Development Bank TechGrant', deadline: '2027-01-15T23:59:00Z' },
  { id: grantId(3), label: 'Blue Economy Research Fellowship', deadline: '2027-01-29T23:59:00Z' },
  { id: grantId(4), label: 'EdTech Caribbean Accelerator Grant', deadline: '2027-02-12T23:59:00Z' },
  { id: grantId(5), label: 'GCF Small Grants for Climate Adaptation', deadline: '2027-02-26T23:59:00Z' },
  // scripts/seed-timeline.mjs grants have no fixed id; matched by title.
  { title: 'OECS Blue Economy Innovation Fund', label: 'timeline grant 1', deadline: '2027-02-05T23:59:00Z' },
  { title: 'Caribbean AgriTech Accelerator Grant', label: 'timeline grant 2', deadline: '2027-01-22T23:59:00Z' },
  { title: 'Digital Skills & EdTech Research Award', label: 'timeline grant 3 (closed)', deadline: '2026-10-30T23:59:00Z' },
  { title: 'Renewable Energy Feasibility Grant', label: 'timeline grant 4', deadline: '2027-02-19T23:59:00Z' },
]

const seasonLastEnd = Math.max(
  ...SEASON_EVENTS.map((e) => Date.parse(e.end)),
  ...SEASON_GRANTS.map((g) => Date.parse(g.deadline)),
)
const quarters = Math.max(0, Math.ceil((now + 14 * DAY - seasonLastEnd) / QUARTER))
const roll = (iso) => new Date(Date.parse(iso) + quarters * QUARTER).toISOString()

if (quarters > 0) console.log(`season is ending; moving it forward ${quarters} x 13 weeks\n`)

// --- apply -------------------------------------------------------------
let changed = 0

for (const event of LIVE) await moveEvent(event.id, event.label, event.patch, 'published')

for (const e of SEASON_EVENTS) {
  const patch = { start_date: roll(e.start), end_date: roll(e.end) }
  if (e.deadline) patch.submission_deadline = roll(e.end)
  await moveEvent(eventId(e.n), e.label, patch, e.status ?? 'published')
}

for (const g of SEASON_GRANTS) {
  const deadline = roll(g.deadline)
  if (dryRun) {
    console.log(`would set ${g.label}: deadline ${deadline}`)
    continue
  }
  let query = db.from('grants').update({ deadline })
  query = g.id ? query.eq('id', g.id) : query.eq('title', g.title)
  const { data, error } = await query.select('id')
  if (error) fail(`grant ${g.label}`, error)
  if (!data?.length) {
    console.log(`skipped ${g.label}: not in this database`)
    continue
  }
  changed += data.length
  console.log(`grant ${g.label}: deadline ${deadline}`)
}

if (!dryRun) console.log(`\n${changed} row${changed === 1 ? '' : 's'} refreshed.`)

// --- helpers -----------------------------------------------------------
async function moveEvent(id, label, patch, status) {
  if (dryRun) {
    console.log(`would move ${label} [${status}]: ${patch.start_date} to ${patch.end_date}`)
    return
  }

  // Read the old start first. An agenda is stored as absolute timestamps, so
  // moving an event without its schedule leaves the two adrift.
  const { data: before, error: readError } = await db
    .from('events')
    .select('start_date')
    .eq('id', id)
    .maybeSingle()
  if (readError) fail(`reading ${label}`, readError)
  if (!before) {
    console.log(`skipped ${label}: not in this database`)
    return
  }

  const { data, error } = await db
    .from('events')
    .update({ ...patch, status })
    .eq('id', id)
    .select('title, start_date, end_date')
  if (error) fail(label, error)

  changed++
  console.log(`moved ${data[0].title}: ${data[0].start_date} to ${data[0].end_date}`)

  const delta = Date.parse(data[0].start_date) - Date.parse(before.start_date)
  if (delta !== 0) await shiftSchedule(id, label, delta)
}

/** Slide an agenda by the amount its event moved, keeping each item's offset. */
async function shiftSchedule(id, label, delta) {
  const { data: rows, error } = await db
    .from('event_schedule')
    .select('id, start_time, end_time')
    .eq('event_id', id)
  if (error) fail(`reading agenda for ${label}`, error)
  if (!rows?.length) return

  for (const row of rows) {
    const patch = { start_time: new Date(Date.parse(row.start_time) + delta).toISOString() }
    if (row.end_time) patch.end_time = new Date(Date.parse(row.end_time) + delta).toISOString()
    const { error: writeError } = await db.from('event_schedule').update(patch).eq('id', row.id)
    if (writeError) fail(`moving agenda for ${label}`, writeError)
  }
  console.log(`  agenda: ${rows.length} item${rows.length === 1 ? '' : 's'} moved with it`)
}

function fail(what, error) {
  console.error(`failed on ${what}: ${error.message}`)
  process.exit(1)
}
