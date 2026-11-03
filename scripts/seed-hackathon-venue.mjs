#!/usr/bin/env node
/**
 * Seeds a five-floor test hackathon into the live project, built from the
 * shared test logins (scripts/seed-test-accounts.mjs), so the 2.5D venue,
 * furniture, team Homebases, calls and captions can be tried end to end.
 *
 * Usage, from the repo root:
 *   node --env-file=.env scripts/seed-hackathon-venue.mjs [--domain ktip.test] [--dry-run]
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 * Run seed-test-accounts.mjs first: every person here is one of those logins.
 *
 * Idempotent. Fixed UUIDs + upserts, so re-running rewrites the building and
 * the roster to what is below. Rooms of this event that are no longer listed
 * here are deleted.
 *
 * Works before migration 188 is applied: furniture/decor and teams are written
 * only when their columns and tables exist, and the script says what it
 * skipped. Apply 188 and run it again to get team colours, logos and teams.
 *
 *   Floor 0  Ground       registration, main hall, networking, help desk,
 *                         team finder, two sponsor booths, quiet room
 *   Floor 1  Homebase A   six team rooms (five claimed), Collab Commons
 *   Floor 2  Homebase B   workshop, hardware bench, library, three free team
 *                         rooms, mentor lounge
 *   Floor 3  Demos        showcase stage, submission desk, quest board,
 *                         spectator gallery
 *   Floor 4  Judging      judging room, deliberation (closed), organiser HQ,
 *                         green room
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY.')
  process.exit(1)
}
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const domain = (arg('domain') || 'ktip.test').toLowerCase()
const dryRun = process.argv.includes('--dry-run')

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })

const EVENT_ID = 'e7000000-0000-4000-8000-000000000188'
const roomId = (n) => `e7100000-0000-4000-8000-${String(n).padStart(12, '0')}`
const teamId = (n) => `e7200000-0000-4000-8000-${String(n).padStart(12, '0')}`

const rect = (x0, y0, x1, y1) => {
  const out = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y])
  return out
}

const hours = (h) => new Date(Date.now() + h * 3600_000).toISOString()

// ---------------------------------------------------------------- people
const emailFor = (slug) => `test.${slug.replace(/_/g, '-')}@${domain}`
async function findUserId(slug) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: emailFor(slug) })
  if (error) throw new Error(`${emailFor(slug)}: ${error.message}. Run scripts/seed-test-accounts.mjs first.`)
  return data.user.id
}

// slug → venue role, status, skills, team
const PEOPLE = [
  { slug: 'programme_supervisor', role: 'organizer', note: 'Host. Find me in Organiser HQ on the top floor.', skills: ['facilitation', 'ops'], room: 33 },
  { slug: 'investor', role: 'judge', note: 'Reading the briefs before the panel', skills: ['finance', 'due diligence'], room: 30 },
  { slug: 'igo', role: 'judge', note: 'Scoring demos this afternoon', skills: ['policy', 'regional programmes'], room: 30 },
  { slug: 'mentor', role: 'mentor', note: 'On duty at the Help Desk: data, APIs, deployment', skills: ['cloud', 'python'], room: 4 },
  { slug: 'faculty', role: 'mentor', note: 'Pitch clinic at 4pm in the Workshop', skills: ['pitching', 'research methods'], room: 20 },
  { slug: 'student', role: 'participant', note: 'Team Alpha: voice form nearly done', skills: ['react', 'ux'], team: 1, captain: true, room: 10 },
  { slug: 'entrepreneur', role: 'participant', note: 'Team Alpha: pitch deck v2', skills: ['business', 'pitching'], team: 1, room: 10 },
  { slug: 'researcher', role: 'participant', note: 'Team Alpha: cleaning landings data', skills: ['python', 'gis'], team: 1, room: 10 },
  { slug: 'private_sector', role: 'participant', note: 'Breadfruit Labs: cold-chain sensors', skills: ['iot', 'logistics'], team: 2, captain: true, room: 11 },
  { slug: 'ngo', role: 'participant', note: 'Breadfruit Labs: vendor interviews', skills: ['community', 'research'], team: 2, room: 11 },
  { slug: 'diaspora', role: 'participant', note: 'Sargassum Squad: satellite tiles', skills: ['ml', 'remote sensing'], team: 3, captain: true, room: 12 },
  { slug: 'research_institution', role: 'participant', note: 'Sargassum Squad: model validation', skills: ['oceanography'], team: 3, room: 12 },
  { slug: 'educational_partner', role: 'participant', note: 'Pitons Collective: need a frontend dev!', skills: ['tourism', 'ops'], team: 4, captain: true, room: 13 },
  { slug: 'government', role: 'participant', note: 'Lambi Works: booking flow', skills: ['go', 'apis'], team: 5, captain: true, room: 14 },
  { slug: 'chamber_admin', role: 'participant', note: 'Looking for a team: business and pitch side', skills: ['strategy', 'pitching'], lft: true, room: 3 },
  { slug: 'ip_legal', role: 'spectator', note: 'Watching the demos', skills: [], room: 41 },
]

// ---------------------------------------------------------------- building
const FLOORS = [
  { key: 'ground', name: 'Ground · Arrivals', door: { side: 's', at: 13 } },
  { key: 'homebase-a', name: 'Level 1 · Homebase wing A', door: { side: 's', at: 13 } },
  { key: 'homebase-b', name: 'Level 2 · Homebase wing B', door: { side: 's', at: 13 } },
  { key: 'demos', name: 'Level 3 · Demos', door: { side: 's', at: 13 } },
  { key: 'judging', name: 'Level 4 · Judging and HQ', door: { side: 's', at: 13 } },
]

// n, floor, key, name, kind, furniture, cells, colour, wall, extras
const R = (n, floor, key, name, kind, furniture, cells, color, wall_height, extra = {}) => ({
  id: roomId(n),
  event_id: EVENT_ID,
  key,
  name,
  kind,
  furniture,
  floor,
  cells,
  color,
  wall_height,
  sort_order: n * 10,
  description: extra.description ?? null,
  audio_mode: extra.audio_mode ?? 'open',
  capacity: extra.capacity ?? null,
  max_publishers: extra.max_publishers ?? 12,
  recording_enabled: false,
  is_open: extra.is_open ?? true,
  allowed_roles: extra.allowed_roles ?? [],
  sections: [],
  decor: extra.decor ?? {},
})

const ROOMS = [
  // ---- ground (stairs block at 0..1,0..1; door at 13..14 on row 17)
  R(1, 0, 'registration', 'Registration Desk', 'help_desk', 'counter', rect(11, 12, 16, 15), '#7E9EC7', 0.9, { description: 'Check in, read the rules, find your way around.' }),
  R(2, 0, 'main-hall', 'Main Hall', 'main_hall', 'theatre', rect(3, 2, 11, 9), '#2A5788', 1.75, { description: 'Keynotes, stand-ups and announcements. Captions on.', audio_mode: 'moderated' }),
  R(3, 0, 'networking', 'Networking Lounge', 'networking', 'cafe', rect(13, 2, 20, 8), '#7AB000', 1.25, { description: 'Open mics. Find a team, find a skill, say hello.' }),
  R(4, 0, 'help-desk', 'Help Desk', 'help_desk', 'counter', rect(2, 11, 7, 15), '#7E9EC7', 1.1, { description: 'Stuck? A mentor is here.' }),
  R(5, 0, 'team-finder', 'Team Finder', 'networking', 'booth', rect(22, 2, 26, 6), '#E6AC09', 1.2, { description: 'Teams with openings, and people looking for one.' }),
  R(6, 0, 'booth-cdb', 'CDB Booth', 'sponsor_booth', 'booth', rect(22, 8, 26, 10), '#B38500', 1.1, { description: 'Accelerator places for the winning team.' }),
  R(7, 0, 'quiet-room', 'Quiet Room', 'breakout', 'lounge', rect(19, 12, 26, 15), '#78716c', 0.9, { description: 'Heads-down focus. Listen only.', audio_mode: 'listen_only' }),

  // ---- level 1: Homebase wing A
  R(10, 1, 'hb-alpha', 'Team Alpha', 'team', 'homebase', rect(3, 2, 8, 6), '#2A5788', 1.2, {
    decor: { v: 1, color: '#2A5788', items: { rug: true, banner: true } },
  }),
  R(11, 1, 'hb-breadfruit', 'Breadfruit Labs', 'team', 'homebase', rect(10, 2, 15, 6), '#E6AC09', 1.2, {
    decor: { v: 1, color: '#E6AC09', items: { coffee: true, beanbags: true, sofa: false } },
  }),
  R(12, 1, 'hb-sargassum', 'Sargassum Squad', 'team', 'homebase', rect(17, 2, 22, 6), '#2F8FD6', 1.2, {
    decor: { v: 1, color: '#2F8FD6', items: { mural: true, kanban: false, shelf: true } },
  }),
  R(13, 1, 'hb-pitons', 'Pitons Collective', 'team', 'homebase', rect(3, 9, 8, 13), '#D45B8C', 1.2, {
    decor: { v: 1, color: '#D45B8C' },
  }),
  R(14, 1, 'hb-lambi', 'Lambi Works', 'team', 'homebase', rect(10, 9, 15, 13), '#7AB000', 1.2),
  R(15, 1, 'hb-free-1', 'Team room 6', 'team', 'homebase', rect(17, 9, 22, 13), '#AEE12B', 1.2, { description: 'Free. Form a team to claim it.' }),
  R(16, 1, 'collab-commons', 'Collab Commons', 'networking', 'cafe', rect(24, 2, 27, 13), '#041E42', 1.3, { description: 'Cross-team board and drop-in sessions.' }),

  // ---- level 2: Homebase wing B + build spaces
  R(20, 2, 'workshop', 'Workshop Room', 'workshop', 'classroom', rect(3, 2, 10, 7), '#E6AC09', 1.4, { description: 'Mentor sessions. Chalkboard included.', audio_mode: 'moderated' }),
  R(21, 2, 'hardware', 'Hardware Bench', 'breakout', 'bench', rect(12, 2, 18, 7), '#78716c', 1.1, { description: 'Sensors, boards and a soldering iron with a queue.' }),
  R(22, 2, 'library', 'Resource Library', 'breakout', 'library', rect(20, 2, 26, 7), '#B38500', 1.2, { description: 'Datasets, APIs and past winners.' }),
  R(23, 2, 'hb-free-2', 'Team room 7', 'team', 'homebase', rect(2, 10, 7, 14), '#AEE12B', 1.2, { description: 'Free. Form a team to claim it.' }),
  R(24, 2, 'hb-free-3', 'Team room 8', 'team', 'homebase', rect(9, 10, 14, 14), '#AEE12B', 1.2, { description: 'Free. Form a team to claim it.' }),
  R(25, 2, 'hb-free-4', 'Team room 9', 'team', 'homebase', rect(16, 10, 21, 14), '#AEE12B', 1.2, { description: 'Free. Form a team to claim it.' }),
  R(26, 2, 'mentor-lounge', 'Mentor Lounge', 'breakout', 'lounge', rect(23, 10, 27, 15), '#7E9EC7', 1, { description: 'Mentors only.', allowed_roles: ['mentor', 'organizer'] }),

  // ---- level 3: demos
  R(40, 3, 'showcase', 'Showcase Stage', 'stage', 'stage', rect(3, 2, 14, 9), '#041E42', 2, { description: 'Demos and pitches. Captions on.', audio_mode: 'listen_only', max_publishers: 6 }),
  R(41, 3, 'gallery', 'Spectator Gallery', 'main_hall', 'theatre', rect(16, 9, 26, 15), '#2A5788', 1.5, { description: 'Watch the demos, cheer, vote.' }),
  R(42, 3, 'submission-desk', 'Submission Desk', 'help_desk', 'counter', rect(16, 2, 21, 6), '#7AB000', 1.1, { description: 'Hand in your project before the deadline.' }),
  R(43, 3, 'quest-board', 'Quest Board', 'breakout', 'podium', rect(23, 2, 27, 7), '#E6AC09', 1.2, { description: 'Leaderboard and side quests.' }),

  // ---- level 4: judging and HQ
  R(30, 4, 'judging', 'Judging Room', 'judging', 'panel', rect(3, 2, 10, 8), '#041E42', 1.4, { description: 'Judges only.', allowed_roles: ['judge', 'organizer'] }),
  R(31, 4, 'deliberation', 'Deliberation Room', 'judging', 'panel', rect(12, 2, 17, 6), '#041E42', 1.2, { description: 'Opens on the last day.', is_open: false, allowed_roles: ['judge', 'organizer'] }),
  R(33, 4, 'organiser-hq', 'Organiser HQ', 'breakout', 'ops', rect(19, 2, 26, 8), '#2F8FD6', 1.2, { description: 'Organisers only.', allowed_roles: ['organizer'] }),
  R(34, 4, 'green-room', 'Green Room', 'breakout', 'lounge', rect(3, 11, 9, 15), '#7AB000', 1, { description: 'Pitchers wait here before going on stage.' }),
]

const TEAMS = [
  { n: 1, name: 'Team Alpha', tagline: 'Catch logs that fishers fill in by voice, in any language', room: 10 },
  { n: 2, name: 'Breadfruit Labs', tagline: 'Cold-chain alerts for small produce vendors', room: 11 },
  { n: 3, name: 'Sargassum Squad', tagline: 'Forecasting sargassum landings from satellite data', room: 12 },
  { n: 4, name: 'Pitons Collective', tagline: 'Reef tourism bookings that respect carrying capacity', room: 13 },
  { n: 5, name: 'Lambi Works', tagline: 'Conch season tracking for co-ops', room: 14 },
]

const CRITERIA = [
  ['objective', 'Get more catch data to fisheries divisions', null],
  ['objective', 'Work with weak or no connectivity', null],
  ['deliverable', 'Working prototype with a public repo', null],
  ['judging_criterion', 'Impact on coastal communities', 30],
  ['judging_criterion', 'Originality', 25],
  ['judging_criterion', 'Feasibility in 12 months', 25],
  ['judging_criterion', 'Demo and pitch', 20],
]

// ---------------------------------------------------------------- run
const isMissingColumn = (e) => e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(e.message))
const isMissingTable = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(e.message))

async function main() {
  console.log(`Seeding the five-floor test hackathon (${EVENT_ID})${dryRun ? ' [dry run]' : ''}`)

  const ids = {}
  for (const p of PEOPLE) ids[p.slug] = await findUserId(p.slug)
  console.log(`  found ${PEOPLE.length} test logins`)
  if (dryRun) {
    console.log(`  would write 1 event, ${ROOMS.length} rooms, ${TEAMS.length} teams, ${PEOPLE.length} venue members`)
    return
  }

  // ---- event
  const event = {
    id: EVENT_ID,
    title: 'KTIP Test Hackathon: Five-Floor Venue',
    summary: 'A test event for the 2.5D venue. Five floors, team Homebases, captions and calls.',
    description:
      'A test build week for trying the virtual venue end to end. Walk the five floors, sit in on the Main Hall with captions in English, French or Spanish, open a call in your team Homebase and share screens, and customise your Homebase with your team colour and logo. Every person here is a shared test login.',
    event_type: 'hackathon',
    status: 'published',
    is_virtual: true,
    start_date: hours(-24),
    end_date: hours(24 * 5),
    capacity: 200,
    organizer_id: ids.programme_supervisor,
    tags: ['test', 'hackathon', 'virtual', 'blue-economy'],
    has_challenge: true,
    submission_deadline: hours(24 * 3),
    has_venue: true,
    venue_opens_at: hours(-48),
    venue_closes_at: hours(24 * 6),
    spectators_enabled: true,
    spectator_scope: 'members',
    venue_map: { v: 1, cols: 28, rows: 18, floors: FLOORS, stairs: { x: 0, y: 0, w: 2, h: 2 } },
  }
  {
    const { error } = await admin.from('events').upsert(event, { onConflict: 'id' })
    if (error) throw new Error(`event: ${error.message}`)
  }
  console.log('  event written')

  // ---- rooms
  let has188 = true
  {
    let { error } = await admin.from('venue_rooms').upsert(ROOMS, { onConflict: 'id' })
    if (isMissingColumn(error)) {
      has188 = false
      console.log('  migration 188 not applied: writing rooms without furniture/decor (kind defaults still draw furniture)')
      const plain = ROOMS.map(({ furniture: _f, decor: _d, ...rest }) => rest)
      ;({ error } = await admin.from('venue_rooms').upsert(plain, { onConflict: 'id' }))
    }
    if (error) throw new Error(`rooms: ${error.message}`)
    const keep = ROOMS.map((r) => r.id)
    const { error: delErr } = await admin
      .from('venue_rooms')
      .delete()
      .eq('event_id', EVENT_ID)
      .not('id', 'in', `(${keep.join(',')})`)
    if (delErr) throw new Error(`prune rooms: ${delErr.message}`)
  }
  console.log(`  ${ROOMS.length} rooms on ${FLOORS.length} floors`)

  // ---- registrations + venue members
  {
    const rsvps = PEOPLE.filter((p) => p.role !== 'spectator').map((p) => ({
      event_id: EVENT_ID,
      user_id: ids[p.slug],
      status: 'confirmed',
    }))
    const { error } = await admin.from('event_rsvps').upsert(rsvps, { onConflict: 'event_id,user_id' })
    if (error) console.log(`  (registrations skipped: ${error.message})`)

    const members = PEOPLE.map((p, i) => ({
      event_id: EVENT_ID,
      user_id: ids[p.slug],
      role: p.role,
      availability: i % 7 === 3 ? 'away' : i % 5 === 4 ? 'busy' : 'working',
      status_note: p.note,
      current_room_id: roomId(p.room),
      skills: p.skills,
      looking_for_team: !!p.lft,
      last_seen_at: new Date().toISOString(),
    }))
    const { error: mErr } = await admin.from('event_venue_members').upsert(members, { onConflict: 'event_id,user_id' })
    if (mErr) throw new Error(`venue members: ${mErr.message}`)
  }
  console.log(`  ${PEOPLE.length} venue members (organiser, 2 judges, 2 mentors, 10 participants, 1 spectator)`)

  // ---- teams (188)
  if (has188) {
    const teams = TEAMS.map((t) => ({
      id: teamId(t.n),
      event_id: EVENT_ID,
      name: t.name,
      tagline: t.tagline,
      homebase_room_id: roomId(t.room),
      created_by: ids[PEOPLE.find((p) => p.team === t.n && p.captain).slug],
    }))
    const { error } = await admin.from('event_teams').upsert(teams, { onConflict: 'id' })
    if (isMissingTable(error)) {
      console.log('  teams skipped: event_teams does not exist yet (apply 188)')
    } else if (error) {
      throw new Error(`teams: ${error.message}`)
    } else {
      await admin.from('event_team_members').delete().eq('event_id', EVENT_ID)
      const tm = PEOPLE.filter((p) => p.team).map((p) => ({
        team_id: teamId(p.team),
        event_id: EVENT_ID,
        user_id: ids[p.slug],
        role: p.captain ? 'captain' : 'member',
      }))
      const { error: tmErr } = await admin.from('event_team_members').insert(tm)
      if (tmErr) throw new Error(`team members: ${tmErr.message}`)
      console.log(`  ${TEAMS.length} teams with Homebases, 4 team rooms left free to claim`)
    }
  }

  // ---- challenge brief
  {
    await admin.from('event_criteria').delete().eq('event_id', EVENT_ID)
    const rows = CRITERIA.map(([kind, title, weight], i) => ({
      event_id: EVENT_ID,
      kind,
      title,
      is_required: kind !== 'judging_criterion',
      weight,
      sort_order: (i + 1) * 10,
    }))
    const { error } = await admin.from('event_criteria').insert(rows)
    if (error) console.log(`  (challenge brief skipped: ${error.message})`)
  }

  const { data: ev } = await admin.from('events').select('slug').eq('id', EVENT_ID).single()
  console.log(`\nDone. Venue: /events/virtual-hackathon/${ev?.slug ?? '<slug>'}`)
  if (!has188) console.log('Apply migration 188 and run this again for team colours, logos and teams.')
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`)
  process.exit(1)
})
