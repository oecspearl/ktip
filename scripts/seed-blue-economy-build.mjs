#!/usr/bin/env node
/**
 * Seeds "Blue Economy Build", the hackathon shown in the approved room
 * prototype (docs/prototypes/hackathon-room-revamp.html), so every live room
 * can be put next to its prototype twin and compared line by line.
 *
 * Usage, from the repo root:
 *   node --env-file=.env scripts/seed-blue-economy-build.mjs [--you someone@oecs.int] [--organiser you@oecs.int] [--dry-run]
 *
 * The same 18 rooms on the same 5 floors, the same 16 people, teams, quests,
 * criteria, chat lines, coffee tables and entries as the prototype. Anything
 * the prototype shows that the database has nowhere to keep is listed at the
 * end of the run under "Not seeded".
 *
 * PEOPLE
 *   The prototype's cast does not exist as accounts, so each one is created as
 *   cast.<name>@<domain> with a random password nobody is told. They are
 *   there to be seen in rooms, not signed in as.
 *   --you        an existing account that takes Nadia Bobb's seat (the "You"
 *                of the prototype: Team Coralline, third in the help line,
 *                Table 1). Without it Nadia is a cast account too.
 *   --organiser  an existing account added as an organiser, so it can open the
 *                organiser-only rooms. The event's host is Kemar Lewis.
 *
 * TIME
 *   The prototype's clock reads "Submissions close in 02:34:10" at 18:00. The
 *   deadline is set that far from the moment the script runs, and every other
 *   time (schedule, chat, calendar) is placed around it. Run it again to wind
 *   the clock back.
 *
 * Idempotent. Fixed UUIDs and upserts; rows of this event that the script
 * owns are rewritten on every run. It never touches another event.
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */

import { randomBytes } from 'node:crypto'
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
const youEmail = arg('you')
const organiserEmail = arg('organiser')

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })

const EVENT_ID = 'e7000000-0000-4000-8000-000000000209'
const uid = (block, n) => `e7${block}00000-0000-4000-8000-${String(209000 + n).padStart(12, '0')}`
const roomId = (n) => uid(1, n)
const teamId = (n) => uid(2, n)
const solutionId = (n) => uid(3, n)
const questId = (n) => uid(4, n)
const criterionId = (n) => uid(5, n)
const tableId = (n) => uid(6, n)

// ---------------------------------------------------------------- clock
// 18:00 on the prototype's clock is the submission deadline.
const DEADLINE = Date.now() + (2 * 3600 + 34 * 60 + 10) * 1000
/** A prototype wall-clock time ("09:30") as a real instant. */
const at = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(DEADLINE + ((h - 18) * 60 + m) * 60_000).toISOString()
}
const iso = (ms) => new Date(ms).toISOString()

// ---------------------------------------------------------------- people
// key → name, venue role, language, where they are from, the room they stand
// in, skills, and the status line the prototype gives them.
const PEOPLE = {
  you: { n: 'Nadia Bobb', role: 'participant', lang: 'en', from: 'Saint Lucia', room: 7, skills: ['Python', 'Data science'], avail: 'help_wanted', note: '401 from the tides API' },
  kemar: { n: 'Kemar Lewis', role: 'organizer', lang: 'en', from: 'Saint Vincent and the Grenadines', room: 2, skills: ['Facilitation'], note: 'On duty' },
  marie: { n: 'Marie-Claire Joseph', role: 'mentor', lang: 'fr', from: 'Martinique', room: 10, skills: ['APIs', 'Data pipelines'], note: 'Free' },
  ana: { n: 'Ana Lucía Rivas', role: 'mentor', lang: 'es', from: 'Tidewater Labs', room: 5, skills: ['APIs'], note: 'Tidewater Labs. Book 15 minutes with me.' },
  jaden: { n: 'Jaden Charles', role: 'participant', lang: 'en', from: 'Saint Lucia', room: 7, skills: ['React', 'Python'], note: 'Lead, Team Coralline' },
  tanisha: { n: 'Tanisha Browne', role: 'participant', lang: 'en', from: 'Antigua and Barbuda', room: 7, skills: ['Design', 'React'], note: 'Map colours done. Pushing now.' },
  devon: { n: 'Devon Phillip', role: 'mentor', lang: 'en', from: 'Grenada', room: 4, skills: ['Deploys', 'Databases'], avail: 'busy', note: 'Helping Luc until 16:00' },
  sasha: { n: 'Sasha Edwards', role: 'judge', lang: 'en', from: 'Montserrat', room: 16, skills: [], note: 'Scoring. Blind mode is on for the first pass.' },
  luc: { n: 'Luc Baptiste', role: 'participant', lang: 'fr', from: 'Guadeloupe', room: 7, skills: ['Python', 'Fisheries'], avail: 'help_wanted', note: 'Build fails on Vercel' },
  renee: { n: 'Renée Alexander', role: 'organizer', lang: 'en', from: 'Dominica', room: 1, skills: ['Ops'], note: 'On duty' },
  omari: { n: 'Omari Thomas', role: 'judge', lang: 'en', from: 'Saint Kitts and Nevis', room: 11, skills: ['Hardware'], note: 'On the bench' },
  lucia: { n: 'Lucía Méndez', role: 'participant', lang: 'es', from: 'Puerto Rico', room: 8, skills: ['Product', 'Spanish-speaking co-ops'], lft: true, note: 'Looking for a designer for an app for co-ops' },
  keisha: { n: 'Keisha Felix', role: 'mentor', lang: 'en', from: 'Dominica', room: 13, skills: ['UX research', 'Interviews'], note: 'Free' },
  andre: { n: 'André Celestine', role: 'judge', lang: 'fr', from: 'Martinique', room: 16, skills: [], note: 'Scored three of twelve' },
  shem: { n: 'Shem Isaac', role: 'participant', lang: 'en', from: 'Grenada', room: 8, skills: ['React Native', 'Maps'], lft: true, avail: 'help_wanted', note: 'LoRa range test' },
  aaliyah: { n: 'Aaliyah Daniel', role: 'participant', lang: 'en', from: 'Saint Lucia', room: 6, skills: ['UX research', 'Figma'], lft: true, avail: 'help_wanted', note: 'Survey questions in Kwéyòl' },
}

const castEmail = (key) =>
  `cast.${PEOPLE[key].n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '-')}@${domain}`

async function existingUserId(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  return error ? null : data.user.id
}

async function castUserId(key) {
  const email = castEmail(key)
  const found = await existingUserId(email)
  if (found) return found
  const { data, error } = await admin.auth.admin.createUser({
    email,
    // Nobody is told this. A cast account is seen, never signed in to.
    password: randomBytes(24).toString('base64url') + 'aA1!',
    email_confirm: true,
    user_metadata: { display_name: PEOPLE[key].n },
  })
  if (error) throw new Error(`${email}: ${error.message}`)
  return data.user.id
}

// ---------------------------------------------------------------- building
const FLOORS = [
  { key: 'ground', name: 'Ground · Arrivals', door: { side: 's', at: 11 } },
  { key: 'homebases', name: 'Level 1 · Homebases', door: { side: 's', at: 11 } },
  { key: 'build', name: 'Level 2 · Build', door: { side: 's', at: 11 } },
  { key: 'demos', name: 'Level 3 · Demos', door: { side: 's', at: 11 } },
  { key: 'judging', name: 'Level 4 · Judging and HQ', door: { side: 's', at: 11 } },
]

const sec = (...ids) => ids.map((s) => (typeof s === 'string' ? { id: s } : s))
const body = (id, text) => ({ id, config: { body: text } })
/** The call: what it is called in this room, and its shape when not the kind's own. */
const call = (title, mode) => ({ id: 'av_placeholder', config: { title, ...(mode ? { mode } : {}) } })
/** A dock tab under this room's own name ("Desk team", "Stage crew"). */
const tab = (id, label) => ({ id, config: { label } })

// n, floor, key, name, kind, furniture, [w, h], colour, wall height, extras.
// A room with no `sections` takes its kind's default panels.
const R = (n, floor, key, name, kind, furniture, [w, h], color, wall_height, extra = {}) => ({
  id: roomId(n),
  event_id: EVENT_ID,
  key,
  name,
  kind,
  furniture,
  floor,
  size: { w, h },
  cells: [],
  color,
  wall_height,
  sort_order: n * 10,
  description: extra.description ?? null,
  audio_mode: extra.audio_mode ?? 'open',
  capacity: extra.capacity ?? null,
  max_publishers: extra.max_publishers ?? 12,
  recording_enabled: false,
  is_open: true,
  allowed_roles: extra.allowed_roles ?? [],
  sections: extra.sections ?? [],
  decor: extra.decor ?? {},
  sponsor_name: extra.sponsor_name ?? null,
  sponsor_url: extra.sponsor_url ?? null,
})

const ROOMS = [
  // ---- Ground · Arrivals
  R(1, 0, 'registration-desk', 'Registration Desk', 'help_desk', 'counter', [6, 4], '#E6AC09', 0.9, {
    description: 'Check in, set your language and find your team before you head in.',
    sections: sec(
      'check_in',
      'run_of_show',
      body('rules', 'House rules. Be kind, credit what you borrow, and keep keys and passwords out of chat. Submissions close at 18:00 AST and late entries cannot be judged.'),
      'wayfinding',
      tab('chat', 'Desk chat'),
      tab('occupants', 'Desk team')
    ),
  }),
  R(2, 0, 'main-hall', 'Main Hall', 'main_hall', 'theatre', [9, 8], '#2A5788', 1.75, {
    description: 'Opening talks, announcements and the closing ceremony.',
    audio_mode: 'moderated',
    sections: sec('host_controls', call('Day two opening'), 'run_of_show', 'challenge_brief', 'countdown', 'wayfinding', 'chat', 'qa', 'occupants', 'announcements'),
  }),
  R(3, 0, 'networking-lounge', 'Networking Lounge', 'networking', 'cafe', [8, 6], '#E6AC09', 1.25, {
    description: 'Sit at a table, meet people, find teammates.',
    sections: sec('host_controls', call('Table 1'), 'coffee_tables', 'looking_for_team', 'skill_finder', 'team_finder', 'chat', 'occupants'),
  }),
  R(4, 0, 'help-desk', 'Help Desk', 'help_desk', 'counter', [6, 5], '#E6AC09', 1.1, {
    description: 'Ask for help and a mentor comes to you.',
    sections: sec('host_controls', call('Desk call'), 'help_queue', 'faq', 'chat', 'mentors_on_duty', 'occupants'),
  }),
  R(5, 0, 'sponsor-booth', 'Tidewater Labs', 'sponsor_booth', 'booth', [5, 4], '#2F8FD6', 1.1, {
    description: 'Ask about the tides API and the Tidewater prize. Tide and swell forecasts for every OECS harbour, through one API. Free for this hackathon. Tidewater prize: US$5,000 for the best tool for fishers.',
    sponsor_name: 'Tidewater Labs',
    sponsor_url: 'https://example.org/tidewater',
    sections: sec('sponsor_hero', 'host_controls', call('Ana Lucía answers questions'), { id: 'booking_slots', config: { title: 'Talk to Ana Lucía, 15 minutes' } }, 'chat', 'occupants', {
      id: 'sponsor_links',
      config: {
        links: [
          { label: 'Sandbox key (works until Sunday 23:59)', url: 'https://example.org/tidewater/sandbox-key' },
          { label: 'API reference (EN · ES)', url: 'https://example.org/tidewater/docs' },
          { label: 'Starter code (Node and Python)', url: 'https://example.org/tidewater/starter' },
        ],
      },
    }),
  }),
  R(6, 0, 'quiet-room', 'Quiet Room', 'breakout', 'lounge', [6, 4], '#78716c', 0.9, {
    description: 'No calls, no chat. Put your head down and build.',
    audio_mode: 'listen_only',
    sections: sec(
      'focus_timer',
      body('rules', 'How this room works. No calls and no chat: your microphone stays off while you are here. Only venue-wide news reaches you; room announcements wait until you leave. A soft chime sounds when your timer ends.'),
      tab('occupants', 'Heads down')
    ),
  }),

  // ---- Level 1 · Homebases
  R(7, 1, 'team-homebase', 'Team Coralline', 'team', 'homebase', [7, 6], '#2F8FD6', 1.2, {
    description: 'ReefWatch: coral bleaching alerts for fishers, by text message.',
    decor: { v: 1, color: '#2F8FD6', items: { whiteboard: true, plants: false, sofa: false } },
    sections: sec('host_controls', call('Team call', 'huddle'), 'team_workspace', 'submission_desk', 'countdown', 'chat', 'occupants'),
  }),
  R(8, 1, 'team-pod', 'Team Pod 3', 'breakout', 'lounge', [5, 4], '#2F8FD6', 1, {
    description: 'A small room for one team. This one belongs to Team Mangrove.',
    sections: sec(
      call('Pod call'),
      body('objectives', 'Goal for this session: co-op database connected.\n\nToday: sign-up works on phones. Next: connect the co-op database and test with someone from the Help Desk before five.\n\nQuestions for the mentor: do we need consent text in Spanish and English?'),
      'chat',
      'occupants'
    ),
  }),
  R(9, 1, 'collab-commons', 'Collab Commons', 'networking', 'cafe', [7, 6], '#2F8FD6', 1.3, {
    description: 'Teams trade what they have for what they need.',
    sections: sec(call('Commons call'), 'collab_commons', 'chat', 'occupants'),
  }),

  // ---- Level 2 · Build
  R(10, 2, 'workshop-room', 'Workshop Room', 'workshop', 'classroom', [8, 6], '#7AB000', 1.4, {
    description: 'Tides API in 30 minutes, with Marie-Claire Joseph.',
    audio_mode: 'moderated',
    sections: sec(
      'host_controls',
      call('Tides API in 30 minutes'),
      body('objectives', 'By the end you will: call the tides API from your server, cache it inside the free limit, and show the next high tide on a map.\n\nSteps: 1. Get your key from the Files tab. 2. Read the /v1/tides docs. 3. Call it every 10 minutes, and cache the result. 4. Handle a 401 without crashing. 5. Show the next high tide on a map.'),
      'resources',
      'chat',
      'occupants',
      'hand_queue'
    ),
  }),
  R(11, 2, 'hardware-bench', 'Hardware Bench', 'breakout', 'bench', [7, 5], '#7AB000', 1.1, {
    description: 'Borrow kit, book bench time, ask the bench crew.',
    sections: sec(
      call('Bench crew'),
      'kit',
      body('rules', 'Bench rules. Batteries stay on the mat: lithium cells charge on the fire-safe mat only. Two hours per booking; extend if nobody is waiting.'),
      'chat',
      tab('occupants', 'Bench crew')
    ),
  }),
  R(12, 2, 'resource-library', 'Resource Library', 'breakout', 'library', [7, 5], '#7AB000', 1.2, {
    description: 'Datasets, APIs and starter kits for this challenge.',
    sections: sec(
      'library',
      tab('chat', 'Ask a librarian'),
      'occupants'
    ),
  }),
  R(13, 2, 'mentor-lounge', 'Mentor Lounge', 'breakout', 'lounge', [6, 5], '#7AB000', 1, {
    description: 'Book a mentor for 15 minutes, in a language you share.',
    sections: sec(call('Lounge'), { id: 'booking_slots', config: { title: 'Book a mentor, 15 minutes' } }, 'mentors_on_duty', 'chat', 'occupants'),
  }),

  // ---- Level 3 · Demos
  R(14, 3, 'showcase-stage', 'Showcase Stage', 'stage', 'stage', [12, 8], '#2A5788', 2, {
    description: 'Every team demos for five minutes. Vote for People’s Choice.',
    audio_mode: 'listen_only',
    max_publishers: 6,
    sections: sec('host_controls', call('Team Coralline · 3 of 6'), 'peoples_choice', 'lineup', 'showcase_gallery', 'chat', 'qa', 'hand_queue', 'occupants'),
  }),
  R(15, 3, 'quest-board', 'Quest Board', 'breakout', 'podium', [6, 5], '#E6AC09', 1.2, {
    description: 'Small challenges for points. Points count toward the Spirit award.',
    sections: sec('quest_board', 'chat'),
  }),

  // ---- Level 4 · Judging and HQ
  R(16, 4, 'judging-room', 'Judging Room', 'judging', 'panel', [8, 7], '#041E42', 1.4, {
    description: 'Judges score each entry on their own, then compare.',
    allowed_roles: ['judge', 'organizer'],
    sections: sec('host_controls', call('Judges’ panel'), 'judging_console', 'results_board', 'challenge_brief', 'chat', tab('occupants', 'Judges')),
  }),
  R(17, 4, 'organiser-hq', 'Organiser HQ', 'breakout', 'ops', [8, 6], '#041E42', 1.2, {
    description: 'Headcount, help requests and free-tier usage, live.',
    allowed_roles: ['organizer'],
    sections: sec('host_controls', call('Ops call'), 'organiser_ops', 'announce_all', tab('chat', 'Ops chat'), 'occupants'),
  }),
  R(18, 4, 'green-room', 'Green Room', 'breakout', 'lounge', [7, 5], '#041E42', 1, {
    description: 'Speakers check their setup before going on stage.',
    allowed_roles: ['speaker', 'mentor', 'judge', 'organizer'],
    sections: sec('on_next', 'host_controls', call('Backstage', 'grid'), 'caption_test', 'chat', tab('occupants', 'Stage crew')),
  }),
]

const rect = (x0, y0, x1, y1) => {
  const out = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y])
  return out
}
// The floor plan, drawn by hand so every floor reads the same way: a 22 by 16
// grid, the door in the middle of the south wall, a corridor across the middle
// (rows 7 and 8) and up from the door (columns 11 and 12), big rooms along the
// north wall and smaller ones along the south. Stairs stand in the two north
// corners and alternate, so the way up and the way down are never side by side.
const GRID = { cols: 22, rows: 16 }
const STAIRS_WEST = { x: 1, y: 1, w: 2, h: 3 }
const STAIRS_EAST = { x: 19, y: 1, w: 2, h: 3 }
const FLIGHTS = [
  { from: 0, ...STAIRS_WEST },
  { from: 1, ...STAIRS_EAST },
  { from: 2, ...STAIRS_WEST },
  { from: 3, ...STAIRS_EAST },
]
// key → [x, y, width, height]
const PLAN = {
  // Ground: only the west stairs stand here, so the lounge takes the east corner.
  'main-hall': [4, 0, 9, 7],
  'networking-lounge': [14, 0, 7, 7],
  'registration-desk': [1, 9, 5, 5],
  'help-desk': [7, 9, 4, 5],
  'sponsor-booth': [13, 9, 4, 5],
  'quiet-room': [18, 9, 4, 5],
  // Level 1
  'team-homebase': [4, 0, 7, 7],
  'team-pod': [12, 0, 6, 7],
  'collab-commons': [13, 9, 8, 5],
  // Level 2
  'workshop-room': [4, 0, 8, 7],
  'hardware-bench': [13, 0, 5, 7],
  'resource-library': [1, 9, 10, 5],
  'mentor-lounge': [13, 9, 8, 5],
  // Level 3
  'showcase-stage': [4, 0, 13, 7],
  'quest-board': [13, 9, 8, 5],
  // Level 4
  'judging-room': [4, 0, 7, 7],
  'organiser-hq': [12, 0, 6, 7],
  'green-room': [1, 9, 10, 5],
}
for (const r of ROOMS) {
  const p = PLAN[r.key]
  if (!p) throw new Error(`No place on the plan for ${r.key}`)
  const [x, y, w, h] = p
  if (x + w > GRID.cols || y + h > GRID.rows) throw new Error(`${r.key} does not fit the grid`)
  r.cells = rect(x, y, x + w - 1, y + h - 1)
  delete r.size
}
// Nothing may overlap on a floor: not two rooms, and not a room and its stairs.
for (let floor = 0; floor < FLOORS.length; floor++) {
  const seen = new Map()
  const mark = (name, cells) => {
    for (const [x, y] of cells) {
      const k = `${x},${y}`
      if (seen.has(k)) throw new Error(`Floor ${floor}: ${name} overlaps ${seen.get(k)}`)
      seen.set(k, name)
    }
  }
  for (const f of FLIGHTS.filter((f) => f.from === floor || f.from === floor - 1)) {
    mark('the stairs', rect(f.x, f.y, f.x + f.w - 1, f.y + f.h - 1))
  }
  for (const r of ROOMS.filter((r) => r.floor === floor)) mark(r.name, r.cells)
}

// Speakers and room hosts, per room (venue_room_roles).
const ROOM_ROLES = [
  [2, 'kemar', 'speaker'],
  [5, 'ana', 'organizer'],
  [10, 'marie', 'speaker'],
  [14, 'jaden', 'speaker'],
  [14, 'tanisha', 'speaker'],
  [14, 'luc', 'speaker'],
  [18, 'you', 'speaker'],
  [18, 'ana', 'speaker'],
]

// ---------------------------------------------------------------- teams
const TEAMS = [
  { n: 1, name: 'Team Coralline', tagline: 'ReefWatch: coral bleaching alerts for fishers, by text message', room: 7, captain: 'jaden', members: ['tanisha', 'luc', 'you'] },
  { n: 2, name: 'Team Mangrove', tagline: 'Co-op Ledger: sign-up and payments for fishing co-ops', captain: 'lucia', members: ['shem'] },
  { n: 3, name: 'Team Sargasso', tagline: 'Catch Log' },
  { n: 4, name: 'Team Frigate', tagline: 'Harbour Wait' },
  { n: 5, name: 'Team Booby', tagline: 'Net Repair' },
]

// Coralline's Homebase, tab by tab.
const TASKS = [
  ['French SMS template', 'todo', 'luc', 'Due today'],
  ['Record backup demo video', 'todo', 'jaden', 'Due 17:30'],
  ['Map legend and colours', 'doing', 'tanisha', 'Due 16:00'],
  ['Buoy CSV parser', 'doing', 'you', 'Due 16:30'],
  ['Twilio sandbox number', 'done', 'jaden', null],
  ['Heat map', 'done', 'tanisha', null],
]
const MILESTONES = [
  ['Idea', true],
  ['Prototype', true],
  ['Mentor review', false],
  ['Demo video', false],
  ['Submit', false],
]
const CALENDAR = [
  ['Mentor check-in with Keisha', '16:00', 30],
  ['Demo run-through', '17:00', 30],
  ['Submit (our own deadline)', '17:45', 15],
  ['Demos begin', '19:00', 60],
]

// ---------------------------------------------------------------- challenge
const CRITERIA = [
  [1, 'objective', 'Build a tool that helps small-scale fishers adapt to warming seas.', null],
  [2, 'deliverable', 'Project name and summary', null],
  [3, 'deliverable', 'Demo video', null],
  [4, 'deliverable', 'Repository link', null],
  [5, 'judging_criterion', 'Impact for fishers', 35],
  [6, 'judging_criterion', 'Works today', 25],
  [7, 'judging_criterion', 'Use of open data', 20],
  [8, 'judging_criterion', 'Demo', 20],
]
// Coralline's submission checklist: summary and repository done, video not.
const CHECKLIST_DONE = [2, 4]

const SCHEDULE = [
  ['09:00', 'Doors open', 1, 'other', 30],
  ['09:30', 'Day two opening', 2, 'keynote', 45],
  ['10:15', 'Workshop: Tides API in 30 minutes', 10, 'workshop', 30],
  ['12:00', 'Lunch and coffee tables', 3, 'networking', 60],
  ['18:00', 'Submissions close', 7, 'other', 5],
  ['19:00', 'Demos', 14, 'session', 60],
]

const FAQ = [
  ['My API key returns 401', 'Keys only work from the server. Put it in .env and call the API from your backend, not the browser.'],
  ['Can I use paid services?', 'Yes, but judges run your demo on the free tier, so make sure it still works there.'],
  ['Where is the fisheries dataset?', 'In the Resource Library on Level 2, under Datasets.'],
  ['How do I submit?', 'From your Homebase, Submission card. One person submits for the team.'],
]

const UPDATES = [
  ['renee', 'Submissions close at 18:00', 'Submissions close at 18:00 AST. Late entries cannot be judged.', 'reminder', '09:31'],
  ['kemar', 'New quest', 'New quest: help another team for 20 minutes. 30 points.', 'announcement', '10:00'],
]

// ---------------------------------------------------------------- quests
// Card status as Team Coralline sees it in the prototype sits in the comment.
const QUESTS = [
  [1, 'Help another team for 20 minutes', 30], // Open
  [2, 'Interview a fisher and post one quote', 50], // Claimed
  [3, 'Translate your README into French or Spanish', 20], // Open
  [4, 'Find a bug in another team’s demo', 25], // Open
  [5, 'Attend a workshop', 10], // Done
  [6, 'Post your team photo', 5], // Open
]
// The leaderboard is approved claims plus 10 per finished milestone, so these
// are the claims that land it on the prototype's 85 / 70 / 45. Coralline has
// two milestones done (20), and needs 65 more: quests 1, 4 and 5. That makes
// two more cards read Done for Coralline than the prototype shows.
const CLAIMS = [
  [1, 1, 'approved', 'tanisha'],
  [4, 1, 'approved', 'tanisha'],
  [5, 1, 'approved', 'jaden'],
  [2, 1, 'pending', 'luc'],
  [1, 2, 'approved', 'shem'],
  [4, 2, 'approved', 'shem'],
  [5, 2, 'approved', 'lucia'],
  [6, 2, 'approved', 'lucia'],
  [3, 3, 'approved', null],
  [4, 3, 'approved', null],
]

const COMMONS = [
  [2, 'shem', 'offers', 'SMS sender that works in Kwéyòl'],
  [1, 'tanisha', 'offers', 'Cleaned buoy data, hourly, Oct 2026'],
  [2, 'shem', 'needs', 'Someone to review our map design'],
  [1, 'tanisha', 'needs', 'A French speaker to test SMS wording'],
]

// Coffee tables. The prototype names each table's topic; the database has no
// topic, so the tables come out as Table 1 to 4.
const TABLES = [
  ['jaden', 'luc', 'lucia', 'you'], // Ocean data
  ['shem', 'aaliyah'], // Payments for co-ops
  ['omari', 'keisha', 'devon'], // Hardware and sensors
  ['tanisha'], // First hackathon
]

// ---------------------------------------------------------------- entries
// In running order on the Showcase Stage, so ReefWatch is entry 3.
const ENTRIES = [
  [1, 'Harbour Wait', 4, 'kemar', 300, 'How long the queue is at each harbour fuel dock, before you leave the mooring.'],
  [2, 'Catch Log', 3, 'kemar', 300, 'A catch log fishers fill in by voice.'],
  [3, 'ReefWatch', 1, 'jaden', 292, 'A map of sea temperature from the buoy network, and an SMS alert when a zone stays over the bleaching threshold for three days. Fishers get the alert in Kwéyòl, English or French.'],
  [4, 'Co-op Ledger', 2, 'lucia', 300, 'Sign-up and payments for fishing co-ops, on a phone.'],
  [5, 'Net Repair', 5, 'kemar', 300, 'Find someone nearby who mends nets, and book them.'],
]
// The prototype shows 41, 33, 28 and 19 votes. One vote per person and 16
// people, so the order is kept and the numbers are not.
const VOTES = [
  [3, ['kemar', 'marie', 'ana', 'aaliyah', 'keisha']],
  [4, ['renee', 'devon', 'sasha']],
  [2, ['omari', 'andre']],
  [1, ['lucia', 'shem']],
]
// Sasha's scorecard for entry 3, as the prototype's sliders read: 8, 7, 9, 7.
const SCORES = [
  ['sasha', 1, [7, 6, 6, 7]],
  ['sasha', 2, [6, 7, 7, 6]],
  ['sasha', 3, [8, 7, 9, 7]],
  ['andre', 1, [6, 6, 7, 7]],
  ['andre', 2, [7, 6, 6, 8]],
  ['andre', 3, [9, 7, 8, 8]],
]

// ---------------------------------------------------------------- chat
// room, who, time, text, language it was written in. A line written in French
// or Spanish is stored in that language, so the room translates it on read.
const CHAT = [
  [1, 'renee', '08:40', 'Morning! Badges print on arrival. If yours shows the wrong team, tell us here.'],
  [1, 'luc', '08:44', 'Mon badge affiche encore mon ancienne équipe.', 'fr'],
  [1, 'renee', '08:45', 'Fixed, Luc. Refresh and it will show Team Coralline.'],
  [1, 'aaliyah', '08:51', 'Where do I set the language for captions?'],

  [2, 'renee', '09:31', 'Questions go in the Q&A tab. Upvote the ones you want answered.'],
  [2, 'marie', '09:33', 'Les sous-titres en français marchent bien.', 'fr'],
  [2, 'jaden', '09:34', 'Is the dataset link in the Resource Library yet?'],
  [2, 'lucia', '09:35', '¿Podemos entregar como equipo de dos?', 'es'],
  [2, 'renee', '09:36', 'Submissions close at 18:00 AST. Late entries cannot be judged.'],

  [3, 'kemar', '11:58', 'Lunch tables open at 12:00. Pick a topic or let roulette seat you.'],
  [3, 'shem', '12:02', 'Anyone at Table 4 know LoRa?'],
  [3, 'lucia', '12:03', 'Busco a alguien de diseño para una app de cooperativas.', 'es'],

  [4, 'keisha', '13:10', 'If your build fails, paste the first error line in your request. It saves five minutes.'],
  [4, 'luc', '13:12', 'Merci Devon, ça marche maintenant !', 'fr'],
  [4, 'shem', '13:14', 'Is there a mentor who knows LoRa?'],

  [5, 'ana', '14:02', 'La clave del sandbox está en la pestaña Enlaces. Funciona hasta el domingo por la noche.', 'es'],
  [5, 'tanisha', '14:05', 'Does the prize count for team entries?'],
  [5, 'ana', '14:06', 'Sí, para todo el equipo.', 'es'],

  [7, 'tanisha', '15:20', 'Map colours done. Pushing now.'],
  [7, 'luc', '15:22', 'Je m’occupe du modèle de SMS en français.', 'fr'],
  [7, 'jaden', '15:25', 'Demo run-through at 17:00 in here, everyone please.'],
  [7, 'jaden', '15:26', 'Demo run-through at 17:00. Submission by 17:45 at the latest.'],

  [8, 'shem', '15:41', 'Sign-up form is deployed.'],
  [8, 'lucia', '15:44', '¡Genial! Lo pruebo con la cooperativa.', 'es'],

  [9, 'shem', '14:12', 'Mangrove can share our SMS sender if someone helps with maps.'],
  [9, 'tanisha', '14:14', 'Coralline can help with maps. DM me.'],

  [10, 'marie', '10:18', 'La clé est dans Fichiers. Ne la collez pas dans le chat !', 'fr'],
  [10, 'jaden', '10:21', 'Got a 401, fixed it by moving the call to the server.'],
  [10, 'lucia', '10:22', '¿Cada cuánto podemos llamarla en el plan gratuito?', 'es'],

  [11, 'omari', '13:30', 'Two LoRa modules back in stock.'],
  [11, 'shem', '13:32', 'Reserving one for Mangrove.'],

  [12, 'keisha', '11:02', 'New: hourly buoy data for October, cleaned.'],
  [12, 'aaliyah', '11:10', 'Is there anything on fish prices by island?'],

  [13, 'marie', '12:30', 'J’ai des créneaux cet après-midi, en français ou en anglais.', 'fr'],
  [13, 'devon', '12:31', 'Free after 16:00 for infra and deploys.'],

  [14, 'aaliyah', '19:22', 'The heat map is so clear!'],
  [14, 'luc', '19:23', 'Fier de cette équipe !', 'fr'],
  [14, 'kemar', '19:24', 'Two minutes left for Coralline, then Mangrove.'],

  [15, 'kemar', '10:00', 'New quest: help another team for 20 minutes. 30 points.'],
  [15, 'tanisha', '10:40', 'Claimed the bug hunt!'],

  [16, 'sasha', '18:31', 'Scoring opens now. Blind mode is on for the first pass.'],
  [16, 'andre', '18:33', 'J’ai noté trois projets sur douze.', 'fr'],

  [17, 'renee', '16:50', 'Help Desk queue is long. Sending Marie-Claire down.'],
  [17, 'kemar', '16:52', 'Main Hall reminder goes out at 17:00.'],

  [18, 'kemar', '18:50', 'Nadia, you are on after Mangrove. Test your screen share now.'],
]

// The Showcase Stage running order (213): time, title, detail, team, speaker, status.
// Nadia's own short talk comes after Team Mangrove, so the Green Room tells her
// "You are on next, after Team Mangrove", as the design has it.
const LINEUP = [
  ['19:00', 'Harbour Wait', null, 4, null, 'done'],
  ['19:06', 'Catch Log', null, 3, null, 'done'],
  ['19:12', 'ReefWatch', null, 1, null, 'live'],
  ['19:18', 'Co-op Ledger', null, 2, null, 'upcoming'],
  ['19:24', 'What fishers told us', 'A short talk by Nadia Bobb', null, 'you', 'upcoming'],
  ['19:30', 'Net Repair', null, 5, null, 'upcoming'],
]

// Hardware Bench stock (212): name, how many, how many already reserved.
const KIT = [
  ['ESP32 boards', 20, 14],
  ['LoRa modules', 8, 6],
  ['Temperature probes', 24, 13],
  ['Solar charge kits', 5, 5],
]

// Event library (212): title, detail, kind, format, languages.
const LIBRARY = [
  ['Buoy sea temperature, Oct 2026', 'Hourly · 14 buoys · cleaned', 'dataset', 'CSV', ['en']],
  ['Tidewater tides API', 'Sandbox key in the Sponsor booth', 'api', 'API', ['en', 'es']],
  ['Landings by island, 2020–2025', 'OECS fisheries statistics', 'dataset', 'CSV', ['en', 'fr']],
  ['SMS alert starter (Twilio)', 'Node, 40 lines', 'starter', 'ZIP', ['en']],
  ['Interviewing fishers: a field guide', '12 pages', 'guide', 'PDF', ['en', 'fr', 'es']],
]

// Bookable 15-minute slots (212): room, host, times, which are taken (by whom).
const SLOTS = [
  [5, 'ana', ['14:30', '14:45', '15:00', '15:15', '15:30'], { '14:45': 'tanisha', '15:30': 'shem' }],
  [13, 'keisha', ['16:00', '16:15', '16:30'], { '16:15': 'lucia' }],
  [13, 'marie', ['16:00', '16:15', '16:30'], {}],
  [13, 'devon', ['16:30', '16:45'], { '16:30': 'jaden' }],
]

// The Help Desk line, in order (211): who, what they asked, tags, who is helping.
const HELP = [
  ['luc', 'Build fails on Vercel', [], 'devon'],
  ['shem', 'LoRa range test', [], null],
  ['you', 'The tides API returns 401 even with the key in .env.', ['API', 'JavaScript'], null],
  ['aaliyah', 'Survey questions in Kwéyòl', [], null],
]

// Q&A, as the design has it: question, who asked, upvotes, answered (210).
const QUESTIONS = [
  [2, 'Can teams of two enter?', 'lucia', 6, true],
  [2, 'Will the buoy data stay online after the event?', 'luc', 4, false],
  [2, 'Do judges see our code or only the demo?', 'jaden', 3, false],
  [14, 'Does it work without mobile data?', 'aaliyah', 5, false],
  [14, 'Who pays for the SMS?', 'omari', 3, false],
]

// What the prototype shows and the database cannot hold today.
const NOT_SEEDED = [
  'Q&A vote counts of 18 / 12 / 9 and 11 / 7: 16 people, so the order is kept as 6 / 4 / 3 and 5 / 3 (needs migration 210)',
  'Help Desk wait estimate: the design says "About 6 minutes" for third in line; the room works it out as 3 minutes per person ahead (needs migration 211)',
  'The US$5,000 prize panel: no field (the prize is in the room description)',
  'Kit reservations are one per person per item, so the taken counts are made up of the cast (needs migration 212)',
  'Showcase: 6 slots, not 12; the call title is set by hand per room (needs migration 213 for the lineup)',
  'Focus timer goal and minutes left: the timer lives only in the browser',
  'Coffee table topics: no column (tables are Table 1 to 4)',
  'Pinned chat message: the room pins the newest host message itself; the pinned text is seeded as a host message',
  'Homebase whiteboard notes, pitch doc and the three files: need a tldraw snapshot, a Yjs document and Storage uploads',
  'Homebase Links tab: coralline/reefwatch is not a real GitHub repository, so no commits show',
  'Organiser HQ meters, peak headcount, longest wait, alerts feed: usage rows come from real calls',
  'People’s Choice counts of 41 / 33 / 28 / 19: one vote per person and 16 people; order kept as 5 / 3 / 2 / 2',
  'Quest cards for Team Coralline: quests 1, 4 and 5 read Done (prototype: only 5) so the leaderboard can read 85 / 70 / 45',
  'Head counts (214 in the venue, 162 at the stage): 16 people exist',
]

// ---------------------------------------------------------------- run
const say = (label, error, ok) => console.log(error ? `  (${label} skipped: ${error.message})` : `  ${ok}`)

async function main() {
  console.log(`Seeding Blue Economy Build (${EVENT_ID})${dryRun ? ' [dry run]' : ''}`)

  if (dryRun) {
    console.log(`  would write 1 event, ${ROOMS.length} rooms on ${FLOORS.length} floors, ${Object.keys(PEOPLE).length} people, ${TEAMS.length} teams,`)
    console.log(`  ${QUESTS.length} quests, ${ENTRIES.length} entries, ${CHAT.length} chat lines, ${TABLES.length} coffee tables`)
    console.log(`  cast accounts: ${Object.keys(PEOPLE).filter((k) => !(k === 'you' && youEmail)).map(castEmail).join(', ')}`)
    console.log(`\nNot seeded:\n${NOT_SEEDED.map((s) => `  - ${s}`).join('\n')}`)
    return
  }

  // ---- people
  const ids = {}
  for (const key of Object.keys(PEOPLE)) {
    if (key === 'you' && youEmail) {
      ids.you = await existingUserId(youEmail)
      if (!ids.you) throw new Error(`--you ${youEmail}: no such account`)
      continue
    }
    ids[key] = await castUserId(key)
    const p = PEOPLE[key]
    const { error } = await admin
      .from('profiles')
      .update({
        display_name: p.n,
        country: p.from,
        is_verified: true,
        verified_via: 'admin',
        verified_at: new Date().toISOString(),
        preferred_language: p.lang,
        content_language: p.lang,
      })
      .eq('id', ids[key])
    if (error) console.log(`  (profile ${p.n}: ${error.message})`)
  }
  console.log(`  ${Object.keys(ids).length} people${youEmail ? `, with ${youEmail} in Nadia Bobb's seat` : ''}`)
  let organiserId = null
  if (organiserEmail) {
    organiserId = await existingUserId(organiserEmail)
    if (!organiserId) throw new Error(`--organiser ${organiserEmail}: no such account`)
  }

  // ---- event
  {
    const { error } = await admin.from('events').upsert(
      {
        id: EVENT_ID,
        title: 'Blue Economy Build',
        summary: 'Build a tool that helps small-scale fishers adapt to warming seas.',
        description:
          'Blue Economy Build · 2026. A two-day build for small-scale fishers and the people who work with them. Twelve teams, one question: what would help a fisher adapt to warming seas this season? Open buoy data, a free tides API from Tidewater Labs and mentors at the Help Desk until midnight. This event mirrors the approved room design, so each room can be compared with it.',
        event_type: 'hackathon',
        status: 'published',
        is_virtual: true,
        start_date: at('09:00'),
        end_date: iso(DEADLINE + 6 * 3600_000),
        capacity: 250,
        organizer_id: ids.kemar,
        tags: ['hackathon', 'virtual', 'blue-economy', 'design-reference'],
        has_challenge: true,
        submission_deadline: iso(DEADLINE),
        has_venue: true,
        venue_opens_at: iso(DEADLINE - 48 * 3600_000),
        venue_closes_at: iso(DEADLINE + 21 * 24 * 3600_000),
        spectators_enabled: true,
        spectator_scope: 'members',
        venue_map: { v: 1, cols: GRID.cols, rows: GRID.rows, floors: FLOORS, flights: FLIGHTS },
      },
      { onConflict: 'id' }
    )
    if (error) throw new Error(`event: ${error.message}`)
  }
  console.log('  event written')

  // ---- rooms
  {
    const { error } = await admin.from('venue_rooms').upsert(ROOMS, { onConflict: 'id' })
    if (error) throw new Error(`rooms: ${error.message}`)
    const { error: delErr } = await admin
      .from('venue_rooms')
      .delete()
      .eq('event_id', EVENT_ID)
      .not('id', 'in', `(${ROOMS.map((r) => r.id).join(',')})`)
    if (delErr) throw new Error(`prune rooms: ${delErr.message}`)
  }
  console.log(`  ${ROOMS.length} rooms on ${FLOORS.length} floors`)

  // ---- registrations, venue members, room roles
  {
    const keys = Object.keys(PEOPLE)
    const { error } = await admin.from('event_rsvps').upsert(
      keys.map((k) => ({ event_id: EVENT_ID, user_id: ids[k], status: 'confirmed' })),
      { onConflict: 'event_id,user_id' }
    )
    say('registrations', error, `${keys.length} registrations`)

    const members = keys.map((k) => ({
      event_id: EVENT_ID,
      user_id: ids[k],
      role: PEOPLE[k].role,
      availability: PEOPLE[k].avail ?? 'working',
      status_note: PEOPLE[k].note,
      current_room_id: roomId(PEOPLE[k].room),
      skills: PEOPLE[k].skills,
      looking_for_team: !!PEOPLE[k].lft,
      is_discoverable: true,
      // The cast never comes online, and a row unseen for two minutes reads as
      // offline. Dated to the venue closing, so they stay in their rooms.
      last_seen_at: iso(DEADLINE + 21 * 24 * 3600_000),
    }))
    if (organiserId && !Object.values(ids).includes(organiserId)) {
      members.push({
        event_id: EVENT_ID,
        user_id: organiserId,
        role: 'organizer',
        availability: 'working',
        status_note: 'Comparing the rooms with the design',
        current_room_id: roomId(17),
        skills: [],
        looking_for_team: false,
        is_discoverable: true,
        last_seen_at: new Date().toISOString(),
      })
    }
    const { error: mErr } = await admin.from('event_venue_members').upsert(members, { onConflict: 'event_id,user_id' })
    if (mErr) throw new Error(`venue members: ${mErr.message}`)
    console.log(`  ${members.length} venue members`)

    await admin.from('venue_room_roles').delete().eq('event_id', EVENT_ID)
    const { error: rErr } = await admin.from('venue_room_roles').insert(
      ROOM_ROLES.map(([room, who, role]) => ({ event_id: EVENT_ID, room_id: roomId(room), user_id: ids[who], role }))
    )
    say('room roles', rErr, `${ROOM_ROLES.length} speaker and host roles`)
  }

  // ---- teams and the Coralline Homebase
  {
    const { error } = await admin.from('event_teams').upsert(
      TEAMS.map((t) => ({
        id: teamId(t.n),
        event_id: EVENT_ID,
        name: t.name,
        tagline: t.tagline,
        homebase_room_id: t.room ? roomId(t.room) : null,
        created_by: t.captain ? ids[t.captain] : ids.kemar,
      })),
      { onConflict: 'id' }
    )
    if (error) throw new Error(`teams: ${error.message}`)
    await admin.from('event_team_members').delete().eq('event_id', EVENT_ID)
    const tm = TEAMS.flatMap((t) => [
      ...(t.captain ? [{ team_id: teamId(t.n), event_id: EVENT_ID, user_id: ids[t.captain], role: 'captain' }] : []),
      ...(t.members ?? []).map((k) => ({ team_id: teamId(t.n), event_id: EVENT_ID, user_id: ids[k], role: 'member' })),
    ])
    const { error: tmErr } = await admin.from('event_team_members').insert(tm)
    if (tmErr) throw new Error(`team members: ${tmErr.message}`)
    console.log(`  ${TEAMS.length} teams, ${tm.length} team members`)

    const T = teamId(1)
    await admin.from('team_tasks').delete().eq('team_id', T)
    const { error: taskErr } = await admin.from('team_tasks').insert(
      TASKS.map(([title, status, who, notes], i) => ({ team_id: T, title, status, assignee_id: ids[who], notes, position: i + 1, created_by: ids.jaden }))
    )
    say('tasks', taskErr, `${TASKS.length} board tasks`)

    await admin.from('team_milestones').delete().eq('team_id', T)
    const { error: msErr } = await admin.from('team_milestones').insert(
      MILESTONES.map(([title, done], i) => ({ team_id: T, title, position: i + 1, done_at: done ? at('12:00') : null, created_by: ids.jaden }))
    )
    say('milestones', msErr, `${MILESTONES.length} milestones`)

    await admin.from('team_calendar_items').delete().eq('team_id', T)
    const { error: calErr } = await admin.from('team_calendar_items').insert(
      CALENDAR.map(([title, start, mins]) => ({
        team_id: T,
        title,
        starts_at: at(start),
        ends_at: iso(new Date(at(start)).getTime() + mins * 60_000),
        created_by: ids.jaden,
      }))
    )
    say('calendar', calErr, `${CALENDAR.length} calendar items`)

    const { error: linkErr } = await admin
      .from('team_links')
      .upsert({ team_id: T, github_repo: 'coralline/reefwatch', updated_by: ids.jaden }, { onConflict: 'team_id' })
    say('team links', linkErr, 'repository link')
  }

  // ---- challenge brief, schedule, FAQ, announcements
  {
    await admin.from('event_criteria').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('event_criteria').insert(
      CRITERIA.map(([n, kind, title, weight]) => ({
        id: criterionId(n),
        event_id: EVENT_ID,
        kind,
        title,
        is_required: kind !== 'judging_criterion',
        weight,
        sort_order: n * 10,
      }))
    )
    say('challenge brief', error, 'challenge brief: 35 / 25 / 20 / 20')

    const { error: clErr } = await admin.from('team_checklist').upsert(
      CHECKLIST_DONE.map((n) => ({ team_id: teamId(1), criterion_id: criterionId(n), done: true, updated_by: ids.jaden })),
      { onConflict: 'team_id,criterion_id' }
    )
    say('submission checklist', clErr, 'submission checklist: 2 of 3 done')

    await admin.from('event_schedule').delete().eq('event_id', EVENT_ID)
    const { error: schErr } = await admin.from('event_schedule').insert(
      SCHEDULE.map(([start, title, room, type, mins], i) => ({
        event_id: EVENT_ID,
        title,
        start_time: at(start),
        end_time: iso(new Date(at(start)).getTime() + mins * 60_000),
        location: ROOMS.find((r) => r.id === roomId(room)).name,
        room_id: roomId(room),
        schedule_type: type,
        sort_order: (i + 1) * 10,
      }))
    )
    say('schedule', schErr, `${SCHEDULE.length} schedule items`)

    await admin.from('event_page_sections').delete().eq('event_id', EVENT_ID)
    const { error: faqErr } = await admin.from('event_page_sections').insert({
      event_id: EVENT_ID,
      section_type: 'faq',
      title: 'Answers people needed today',
      content: { items: FAQ.map(([question, answer]) => ({ question, answer })) },
      sort_order: 10,
      is_visible: true,
    })
    say('FAQ', faqErr, `${FAQ.length} FAQ answers`)

    await admin.from('event_updates').delete().eq('event_id', EVENT_ID)
    const { error: upErr } = await admin.from('event_updates').insert(
      UPDATES.map(([who, title, content, update_type, time]) => ({
        event_id: EVENT_ID,
        author_id: ids[who],
        title,
        content,
        update_type,
        is_published: true,
        created_at: at(time),
      }))
    )
    say('announcements', upErr, `${UPDATES.length} announcements`)
  }

  // ---- quests, claims, commons
  {
    await admin.from('event_quests').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('event_quests').insert(
      QUESTS.map(([n, title, points]) => ({ id: questId(n), event_id: EVENT_ID, title, points, sort_order: n * 10, created_by: ids.kemar }))
    )
    say('quests', error, `${QUESTS.length} quests`)
    if (!error) {
      const { error: cErr } = await admin.from('event_quest_claims').insert(
        CLAIMS.map(([quest, team, status, who]) => ({
          quest_id: questId(quest),
          team_id: teamId(team),
          event_id: EVENT_ID,
          claimed_by: who ? ids[who] : null,
          status,
          decided_by: status === 'approved' ? ids.kemar : null,
          decided_at: status === 'approved' ? at('11:00') : null,
        }))
      )
      say('quest claims', cErr, `${CLAIMS.length} quest claims`)
    }

    await admin.from('event_commons_notes').delete().eq('event_id', EVENT_ID)
    const { error: nErr } = await admin.from('event_commons_notes').insert(
      COMMONS.map(([team, who, column_key, text], i) => ({
        event_id: EVENT_ID,
        team_id: teamId(team),
        author_id: ids[who],
        column_key,
        body: text,
        created_at: iso(new Date(at('14:00')).getTime() + i * 60_000),
      }))
    )
    say('commons notes', nErr, `${COMMONS.length} Collab Commons notes`)
  }

  // ---- coffee tables
  {
    await admin.from('venue_coffee_tables').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('venue_coffee_tables').insert(
      TABLES.map((_, i) => ({
        id: tableId(i + 1),
        event_id: EVENT_ID,
        room_id: roomId(3),
        created_at: iso(new Date(at('12:00')).getTime() + i * 1000),
        // Real tables last ten minutes. These stay for the life of the venue.
        ends_at: iso(DEADLINE + 21 * 24 * 3600_000),
      }))
    )
    if (error) say('coffee tables', error)
    else {
      const { error: sErr } = await admin.from('venue_coffee_seats').insert(
        TABLES.flatMap((seats, i) => seats.map((k) => ({ table_id: tableId(i + 1), event_id: EVENT_ID, user_id: ids[k] })))
      )
      say('coffee seats', sErr, `${TABLES.length} coffee tables, ${TABLES.flat().length} seats`)
    }
  }

  // ---- entries, votes, scores
  {
    await admin.from('event_solutions').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('event_solutions').insert(
      ENTRIES.map(([n, title, team, who, seconds, description]) => ({
        id: solutionId(n),
        event_id: EVENT_ID,
        author_id: ids[who],
        team_id: teamId(team),
        title,
        description,
        repo_url: `https://example.org/entries/${title.toLowerCase().replace(/[^a-z]+/g, '-')}/repo`,
        demo_video_url: `https://example.org/entries/${title.toLowerCase().replace(/[^a-z]+/g, '-')}/demo`,
        demo_video_seconds: seconds,
        pitch_deck_url: `https://example.org/entries/${title.toLowerCase().replace(/[^a-z]+/g, '-')}/pitch.pdf`,
        submitted_at: iso(Date.now() - (6 - n) * 60_000),
        created_at: iso(Date.now() - (60 - n) * 60_000),
      }))
    )
    say('entries', error, `${ENTRIES.length} entries (ReefWatch is entry 3)`)
    if (!error) {
      const { error: vErr } = await admin.from('peoples_choice_votes').upsert(
        VOTES.flatMap(([entry, voters]) => voters.map((k) => ({ event_id: EVENT_ID, voter_id: ids[k], solution_id: solutionId(entry) }))),
        { onConflict: 'event_id,voter_id' }
      )
      say('People’s Choice votes', vErr, `${VOTES.reduce((a, [, v]) => a + v.length, 0)} People’s Choice votes`)

      const { error: dErr } = await admin.from('judge_declarations').upsert(
        ['sasha', 'omari', 'andre'].map((k) => ({ event_id: EVENT_ID, judge_id: ids[k] })),
        { onConflict: 'event_id,judge_id' }
      )
      say('judge declarations', dErr, '3 judges declared no conflicts')
      const { error: scErr } = await admin.from('judge_scores').insert(
        SCORES.flatMap(([judge, entry, marks]) =>
          marks.map((score, i) => ({ event_id: EVENT_ID, solution_id: solutionId(entry), criterion_id: criterionId(5 + i), judge_id: ids[judge], score }))
        )
      )
      say('judge scores', scErr, `${SCORES.length} scorecards`)
    }
  }

  // ---- chat
  {
    await admin.from('venue_room_messages').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('venue_room_messages').insert(
      CHAT.map(([room, who, time, text, lang]) => ({
        room_id: roomId(room),
        event_id: EVENT_ID,
        author_id: ids[who],
        body: text,
        kind: 'chat',
        lang: lang ?? 'en',
        created_at: at(time),
      }))
    )
    say('chat', error, `${CHAT.length} chat lines across ${new Set(CHAT.map((c) => c[0])).size} rooms`)
  }

  // ---- Stage running order (213), when the table exists
  {
    await admin.from('venue_stage_lineup').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('venue_stage_lineup').insert(
      LINEUP.map(([time, title, detail, team, speaker, status], i) => ({
        event_id: EVENT_ID,
        room_id: roomId(14),
        position: i + 1,
        title,
        detail,
        team_id: team ? teamId(team) : null,
        speaker_id: speaker ? ids[speaker] : null,
        starts_at: at(time),
        minutes: 5,
        status,
      }))
    )
    say('lineup', error, `${LINEUP.length} slots on the stage`)
  }

  // ---- Kit, library and booking slots (212), when the tables exist
  {
    await admin.from('venue_kit_items').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('venue_kit_items').insert(
      KIT.map(([name, total], i) => ({ id: uid(9, i + 1), event_id: EVENT_ID, room_id: roomId(11), name, total, sort_order: (i + 1) * 10 }))
    )
    if (error) say('kit', error)
    else {
      // Taken counts come from the cast, one each, never from you.
      const cast = Object.keys(PEOPLE).filter((k) => k !== 'you')
      const rows = KIT.flatMap(([, , taken], i) =>
        cast.slice(0, taken).map((k) => ({ item_id: uid(9, i + 1), event_id: EVENT_ID, user_id: ids[k] }))
      )
      const { error: rErr } = await admin.from('venue_kit_reservations').insert(rows)
      say('kit reservations', rErr, `${KIT.length} kit items, ${rows.length} reserved`)
    }

    await admin.from('venue_library_items').delete().eq('event_id', EVENT_ID)
    const { error: libErr } = await admin.from('venue_library_items').insert(
      LIBRARY.map(([title, detail, kind, format, languages], i) => ({
        event_id: EVENT_ID,
        title,
        detail,
        kind,
        format,
        languages,
        url: `https://example.org/library/${i + 1}`,
        sort_order: (i + 1) * 10,
      }))
    )
    say('library', libErr, `${LIBRARY.length} library items`)

    await admin.from('venue_booking_slots').delete().eq('event_id', EVENT_ID)
    const slotRows = SLOTS.flatMap(([room, host, times, taken]) =>
      times.map((time) => ({
        event_id: EVENT_ID,
        room_id: roomId(room),
        host_id: ids[host],
        starts_at: at(time),
        minutes: 15,
        booked_by: taken[time] ? ids[taken[time]] : null,
        booked_at: taken[time] ? at('12:00') : null,
      }))
    )
    const { error: slotErr } = await admin.from('venue_booking_slots').insert(slotRows)
    say('booking slots', slotErr, `${slotRows.length} bookable slots`)
  }

  // ---- Help Desk line (211), when the table exists
  {
    await admin.from('venue_help_requests').delete().eq('event_id', EVENT_ID)
    const { error } = await admin.from('venue_help_requests').insert(
      HELP.map(([who, text, tags, mentor], i) => ({
        id: uid(8, i + 1),
        event_id: EVENT_ID,
        room_id: roomId(4),
        user_id: ids[who],
        body: text,
        tags,
        lang: PEOPLE[who].lang,
        status: mentor ? 'helping' : 'waiting',
        mentor_id: mentor ? ids[mentor] : null,
        picked_at: mentor ? at('13:08') : null,
        created_at: iso(new Date(at('13:00')).getTime() + i * 120_000),
      }))
    )
    say('help line', error, `${HELP.length} people in the help line`)
  }

  // ---- Q&A (210), when the tables exist
  {
    await admin.from('venue_room_questions').delete().eq('event_id', EVENT_ID)
    const everyone = Object.keys(PEOPLE)
    const rows = QUESTIONS.map(([room, text, who, , answered], i) => ({
      id: uid(7, i + 1),
      room_id: roomId(room),
      event_id: EVENT_ID,
      author_id: ids[who],
      body: text,
      lang: PEOPLE[who].lang,
      answered_at: answered ? at('09:40') : null,
      answered_by: answered ? ids.renee : null,
      created_at: iso(new Date(at(room === 2 ? '09:32' : '19:14')).getTime() + i * 60_000),
    }))
    const { error } = await admin.from('venue_room_questions').insert(rows)
    if (error) say('Q&A', error)
    else {
      const votes = QUESTIONS.flatMap(([, , who, n], i) =>
        everyone.filter((k) => k !== who).slice(0, n).map((k) => ({ question_id: uid(7, i + 1), user_id: ids[k] }))
      )
      const { error: vErr } = await admin.from('venue_room_question_votes').insert(votes)
      say('Q&A votes', vErr, `${QUESTIONS.length} questions, ${votes.length} upvotes`)
    }
  }

  const { data: ev } = await admin.from('events').select('slug').eq('id', EVENT_ID).single()
  console.log(`\nDone. Venue: /events/virtual-hackathon/${ev?.slug ?? '<slug>'}`)
  console.log(`\nNot seeded:\n${NOT_SEEDED.map((s) => `  - ${s}`).join('\n')}`)
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`)
  process.exit(1)
})
