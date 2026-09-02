/**
 * Slide the seeded demo events back around today.
 *
 * The seed files write their dates as NOW() ± interval, which is right at the
 * moment they run and wrong ever after: the database keeps the timestamps the
 * seed computed, so a demo seeded a month ago has an events page of nothing but
 * past events, and no way to show an event actually in progress. Re-running
 * seed.sql does not fix it either — its ON CONFLICT never touched the dates
 * until this change, and even now re-running the whole seed to move two events
 * is a heavy way to do it.
 *
 * So this: the same arithmetic, applied to the rows that already exist, by id.
 * Nothing else about the events is touched.
 *
 * Usage:
 *   node scripts/refresh-event-dates.mjs           # move the dates
 *   node scripts/refresh-event-dates.mjs --dry-run # print what it would do
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. The service
 * role is required: events are writable only by their organizer or an admin,
 * and this runs as neither.
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

const dryRun = process.argv.includes('--dry-run')
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// --- schedule ----------------------------------------------------------
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = Date.now()
const at = (ms) => new Date(now + ms).toISOString()
const id = (n) => `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`

/**
 * Two events are deliberately in progress: a listing where everything is
 * either finished or weeks away never shows the live-event states — the venue,
 * the countdown, the "happening now" card — which is most of what there is to
 * look at.
 *
 * 0006, 0008, 0019 and 0020 are left alone. They are the past events, and the
 * page needs those too.
 *
 * `status` defaults to 'published'. Two events set it explicitly and must:
 * 0017 is the draft and 0018 the cancelled event, and publishing them would
 * quietly delete the only demo data those two states have.
 */
const SCHEDULE = [
  {
    id: id(1),
    label: 'OECS Innovation Hackathon 2026',
    patch: { start_date: at(-1 * DAY), end_date: at(1 * DAY), submission_deadline: at(20 * HOUR) },
  },
  {
    id: id(7),
    label: 'OECS Climathon: Virtual Build Weekend',
    patch: {
      start_date: at(-1 * DAY),
      end_date: at(2 * DAY),
      submission_deadline: at(36 * HOUR),
      venue_opens_at: at(-2 * DAY),
      venue_closes_at: at(3 * DAY),
    },
  },
  {
    id: id(3),
    label: 'Caribbean Climate Tech Meetup',
    patch: { start_date: at(7 * DAY), end_date: at(7 * DAY + 3 * HOUR) },
  },
  {
    id: id(2),
    label: 'Intro to IoT for Agriculture Workshop',
    patch: { start_date: at(14 * DAY), end_date: at(14 * DAY + 6 * HOUR) },
  },
  {
    id: id(5),
    label: 'Demo Day: Cohort 3 Startups',
    patch: { start_date: at(45 * DAY), end_date: at(45 * DAY + 4 * HOUR) },
  },
  {
    id: id(4),
    label: 'OECS Digital Economy Conference 2026',
    patch: { start_date: at(60 * DAY), end_date: at(62 * DAY) },
  },

  // --- seed_events.sql ---------------------------------------------------
  {
    id: id(9),
    label: 'Grant Writing Clinic for Climate Founders',
    patch: { start_date: at(3 * DAY), end_date: at(3 * DAY + 4 * HOUR) },
  },
  {
    id: id(10),
    label: 'Women in Tech OECS: Founders Circle',
    patch: { start_date: at(10 * DAY), end_date: at(10 * DAY + 2 * HOUR) },
  },
  {
    // A challenge has no end_date by blueprint — the submission deadline is
    // what the countdown reads.
    id: id(11),
    label: 'Coastal Data Challenge',
    patch: { start_date: at(5 * DAY), submission_deadline: at(26 * DAY) },
  },
  {
    id: id(12),
    label: 'Pitch Perfect: Investor Readiness Bootcamp',
    patch: { start_date: at(21 * DAY), end_date: at(21 * DAY + 8 * HOUR) },
  },
  {
    id: id(13),
    label: 'Montserrat Digital Skills Fair',
    patch: { start_date: at(28 * DAY), end_date: at(28 * DAY + 6 * HOUR) },
  },
  {
    id: id(14),
    label: 'Renewable Energy Innovation Challenge',
    patch: { start_date: at(35 * DAY), submission_deadline: at(75 * DAY) },
  },
  {
    id: id(15),
    label: 'OECS Youth Robotics Showcase',
    patch: { start_date: at(75 * DAY), end_date: at(75 * DAY + 5 * HOUR) },
  },
  {
    id: id(16),
    label: 'Blue Economy Founders Retreat',
    patch: { start_date: at(100 * DAY), end_date: at(102 * DAY) },
  },
  {
    id: id(17),
    label: 'OECS Fintech Regulatory Sandbox Briefing',
    status: 'draft',
    patch: { start_date: at(40 * DAY), end_date: at(40 * DAY + 6 * HOUR) },
  },
  {
    id: id(18),
    label: 'Island Maker Faire 2026',
    status: 'cancelled',
    patch: { start_date: at(18 * DAY), end_date: at(18 * DAY + 8 * HOUR) },
  },
]

// --- apply -------------------------------------------------------------
//
// The single-day events get an end a few hours after their start rather than
// the same instant the seed gives them. useEvents treats `end_date >= now` as
// upcoming, so an event whose end equals its start flips to "past" at the very
// moment it begins — the one hour it most needs to be visible.

let moved = 0
for (const event of SCHEDULE) {
  const status = event.status ?? 'published'

  if (dryRun) {
    console.log(`would move ${event.label} [${status}]: ${JSON.stringify(event.patch)}`)
    continue
  }

  // Read the old start before overwriting it. An event's agenda is stored as
  // absolute timestamps, so moving the event without moving its schedule
  // leaves the two adrift — which is exactly how the hackathon ended up with
  // an agenda a month after itself.
  const { data: before, error: readError } = await db
    .from('events')
    .select('start_date')
    .eq('id', event.id)
    .maybeSingle()

  if (readError) {
    console.error(`failed reading ${event.label}: ${readError.message}`)
    process.exit(1)
  }

  if (!before) {
    console.log(`skipped ${event.label} — not in this database`)
    continue
  }

  const { data, error } = await db
    .from('events')
    .update({ ...event.patch, status })
    .eq('id', event.id)
    .select('id, title, start_date, end_date')

  if (error) {
    console.error(`failed on ${event.label}: ${error.message}`)
    process.exit(1)
  }

  moved++
  console.log(`moved ${data[0].title}: ${data[0].start_date} → ${data[0].end_date}`)

  const delta = Date.parse(data[0].start_date) - Date.parse(before.start_date)
  if (delta !== 0) await shiftSchedule(event, delta)
}

if (!dryRun) console.log(`\n${moved} event${moved === 1 ? '' : 's'} refreshed.`)

/**
 * Slide an event's agenda by the same amount the event itself moved, so each
 * item keeps its offset from the start. Nothing to do for the events that have
 * no agenda, which is most of them.
 */
async function shiftSchedule(event, delta) {
  const { data: rows, error } = await db
    .from('event_schedule')
    .select('id, start_time, end_time')
    .eq('event_id', event.id)

  if (error) {
    console.error(`failed reading agenda for ${event.label}: ${error.message}`)
    process.exit(1)
  }

  if (!rows?.length) return

  for (const row of rows) {
    const patch = { start_time: new Date(Date.parse(row.start_time) + delta).toISOString() }
    if (row.end_time) patch.end_time = new Date(Date.parse(row.end_time) + delta).toISOString()

    const { error: writeError } = await db.from('event_schedule').update(patch).eq('id', row.id)
    if (writeError) {
      console.error(`failed moving agenda for ${event.label}: ${writeError.message}`)
      process.exit(1)
    }
  }

  console.log(`  agenda: ${rows.length} item${rows.length === 1 ? '' : 's'} moved with it`)
}
