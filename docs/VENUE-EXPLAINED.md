# The Venue, Explained in Plain English

This file explains what the virtual venue is, how it was designed, every part it
is made of, and — if you ever need to — how to remove it from the app safely by
yourself. No jargon where it can be avoided.

---

## 1. The idea

The venue is a **virtual event space**. When an event (like a hackathon) has a
venue turned on, attendees don't just see an event page — they "walk into" a
building on their screen. The building has:

- **A floorplan (map)** — a top-down view of rooms you can explore, with little
  avatars showing where people are right now.
- **Rooms** — a main stage, team rooms, help desks, sponsor booths, quiet rooms.
  Each room can have chat, video calls, announcements, timers, and so on.
- **Presence** — you can see who is online, which room they're in, and whether
  they're busy, working, away, or looking for help.
- **Roles** — organizers, speakers, mentors, participants, and spectators each
  get different permissions (who can talk, who can manage rooms, etc.).

Think of it like a video game lobby crossed with a conference center.

There are actually **two things called "venue"** in this project, and it's
important not to confuse them:

1. **The virtual venue** (this document) — the interactive online space.
2. **The physical venue page section** — a plain text block on an event page
   that shows a real-world address, directions, and a map link. This is a
   completely separate, much older feature. **If you remove the virtual venue,
   do NOT touch the physical venue section.** (Section 6 lists exactly which
   "venue" files to leave alone.)

---

## 2. How it was designed (the big decisions)

These are the design choices baked into the code, in simple terms. If you ever
rebuild or modify the venue, these are the lessons already learned:

**One connection per venue, not per room.**
When you enter a venue, your browser opens exactly one live connection
(a Supabase "realtime channel"). Moving between rooms does NOT open a new
connection — it just updates a little "I'm in room X now" note on the
connection you already have. This is why navigation feels instant and why you
don't see "Reconnecting…" every time you change rooms. The connection lives in
a layout component that wraps ALL venue pages, so it survives page changes.

**Live data first, database as a backup copy.**
Who-is-where is tracked live over the connection. But the app also writes a
copy to the database every so often (at most every 45 seconds). That copy is
only used for two things: showing something immediately when a page first
loads, and showing occupancy to people who aren't connected. If a database row
is older than 2 minutes, that person is treated as offline. Live info always
wins over the database copy.

**The server decides everything important.**
Your role (organizer, participant, spectator…), whether you may enter a room,
and whether you may use a chat channel are all decided by database functions
on the server. The browser only displays what the server already decided. This
means a user can't cheat their way into a locked room by editing the page.

**Video permission is a signed ticket.**
For video calls (powered by a service called LiveKit), the browser asks our
server for a token. The server checks who you are and what the room allows,
then signs a token that says exactly what you may do (speak, watch, record).
LiveKit trusts the token, not the browser. "The signed token IS the
permission."

**Availability is sticky.**
If you set yourself to "busy" or "looking for help," the app never overrides
that automatically. Auto-away only kicks in if you were on the default
"working" status. If you have multiple tabs open, they merge into one person
(your strongest status wins, your latest room wins).

**Capacity is a suggestion, not a hard wall.**
Room capacity is checked against the database copy, which can be slightly
stale. The design accepts one extra person in a room rather than wrongly
bouncing someone based on an outdated count.

**Room behavior comes in presets.**
Each room has an "audio mode" (open = anyone talks, moderated = host grants
the floor, listen-only = only speakers) and a "camera mode" (spotlight, grid,
huddle = audio only, off = no call at all). Rooms of kind "stage," "team,"
"help desk" etc. get sensible presets.

---

## 3. What it's built with (the ingredients)

- **React** — all the screens and panels.
- **Supabase** — the database, the login system, and the live "who's online"
  connections (realtime channels).
- **LiveKit** — the video/audio calling service, plus recording and live
  captions. This is the only part that needs its own separate account and
  server (see docs/VIDEO-SETUP.md). Without LiveKit configured, the venue
  still works — rooms, chat, presence, map — just no video.
- **Vercel serverless functions** — two small server endpoints under `api/venue/`
  that hand out LiveKit tokens and start/stop recordings.
- **S3-style storage** (optional) — where call recordings get saved.

---

## 4. The parts, one by one

### The standalone kit (`venue-kit/` folder and `venue-kit.zip`)

This is a **portable, giveaway copy** of the venue's core — cleaned up so any
other React + Supabase project could drop it in. It is NOT what the app runs.
The app has its own full version (below). The kit contains:

- `README.md` — install and wiring instructions for another project.
- `PROMPT.md` — a prompt you can hand an AI assistant to rebuild the full
  feature set (video, chat, hand-raise) on top of the kit.
- `sql/001_venue.sql` — one database file with tables, security rules, and
  server functions.
- `src/` — the provider, the presence hook, the pure decision logic (with
  tests), a few basic components, and neutral CSS.

Deleting the kit folder and zip affects nothing in the running app.

### The real app's venue (what actually runs)

**Screens (pages):**
- `src/pages/events/EventVenueLayout.tsx` — the wrapper that owns the live
  connection. Everything venue lives inside it.
- `src/pages/events/EventVenuePage.tsx` — the floorplan/map screen.
- `src/pages/events/EventVenueRoomPage.tsx` — inside a room.
- `src/pages/events/EventVenueSetupPage.tsx` — organizer setup wizard.
- `src/pages/events/VenueRedirectPage.tsx` — forwards old venue web addresses
  to the new ones.
- `src/pages/admin/events/AdminEventVenueTab.tsx` — the "Venue" tab in the
  admin event editor.
- `src/pages/hackathons/HackathonsPage.tsx` — the "Virtual Hackathon" listing
  page; it exists mainly as the front door to venues.

**Components:** everything in `src/components/venue/` (about 33 files) — the
map renderer, room zones, chat panel, occupant lists, availability picker,
the video call stage, caption strip, sponsor panels, and so on.

**Hooks (reusable logic):** `src/hooks/useVenue*.ts` (seven files), plus three
that don't have "venue" in the name but are used only by the venue:
`useRoomSignals.ts` (reactions/hand-raise), `useRoomRecording.ts`, and
`useLiveCaptions.ts`.

**Pure logic in `src/lib/`:** `venue-actions.ts`, `venue-map.ts`,
`venue-presence.ts`, `venue-room-layout.ts`, `venue-room-presets.ts`,
`venue-room-sections.ts`, `venue-decor.ts`, and `reaction-emoji.ts` — each with
tests. These hold the rules (who counts as online, how the map lays out, what
each room preset contains) as plain functions with no screen attached.

**Server endpoints:** `api/venue/room-token.ts` (video tokens),
`api/venue/room-recording.ts` (recordings), and their helper
`api/_lib/livekit-token.ts`.

**Database (Supabase migrations):**
- `070_event_venue.sql` — the foundation: three tables (`venue_rooms`,
  `event_venue_members`, `venue_room_messages`), columns added to the
  `events` table (`has_venue` and friends), roughly 18 server functions, and
  the security rules.
- `089_venue_map.sql` — the drawable floorplan (floors, cells, colors).
- `091_venue_room_sections.sql` — configurable room panels, check-in,
  broadcasts.
- `101_venue_room_grant.sql` — the room permission grant used by video tokens.

**Context:** `src/contexts/VenuePresenceContext.tsx` — hands presence data down
to child components.

**Docs:** `docs/VENUE-BUILD-PROMPT.md`, `docs/VIDEO-SETUP.md`, and the venue
parts of `docs/FINISH-SETUP.md`.

**Tutorials:** `src/data/tutorials/venue.ts` plus registrations in
`src/data/tutorials/index.ts`.

---

## 5. How to remove it (step by step)

Read section 6 (the gotchas) BEFORE starting. The safe order is: routes first,
then files, then shared-file cleanup, then dependencies, then (optionally) the
database. Run `npm run build` and the tests after each big step — the compiler
will point at anything you missed.

### Step 1 — Unplug the routes

In `src/App.tsx` (around lines 208–252), delete:
- the `/events/virtual-hackathon/:slug` route block (layout + index + room),
- the `/events/virtual-hackathon/:slug/setup` route,
- the two legacy `/events/:id/venue...` redirect routes,
- and decide about the `/hackathons` route: that page is basically a venue
  front door. Either delete it too, or keep it and strip its "Enter the
  venue" buttons.

Keep the `/events/:slug/setup` route — that one is general event setup, not
venue.

### Step 2 — Delete the venue-only files

All of these can go wholesale:

- `src/components/venue/` (entire folder)
- `src/pages/events/EventVenueLayout.tsx`, `EventVenuePage.tsx`,
  `EventVenueRoomPage.tsx`, `EventVenueSetupPage.tsx`, `VenueRedirectPage.tsx`
- `src/pages/admin/events/AdminEventVenueTab.tsx`
- `src/contexts/VenuePresenceContext.tsx`
- `src/hooks/useVenue.ts`, `useVenueCheckIn.ts`, `useVenueMap.ts`,
  `useVenuePresence.ts`, `useVenueRoomMessages.ts`, `useVenueRoomToken.ts`,
  `useVenueRooms.ts`, `useRoomSignals.ts`, `useRoomRecording.ts`,
  `useLiveCaptions.ts`
- `src/lib/venue-actions.ts`, `venue-map.ts`, `venue-presence.ts`,
  `venue-room-layout.ts`, `venue-room-presets.ts`, `venue-room-sections.ts`,
  `venue-decor.ts`, `reaction-emoji.ts` — and their matching `.test.ts` files
- `src/lib/__tests__/livekit-token.test.ts`
- `src/data/tutorials/venue.ts`
- `api/venue/` (both files) and `api/_lib/livekit-token.ts`
- `docs/VENUE-BUILD-PROMPT.md` and `docs/VIDEO-SETUP.md`
- `venue-kit/` and `venue-kit.zip`

Note: `venue-kit/`, `venue-kit.zip`, `src/lib/venue-decor.ts`, and
`docs/VENUE-BUILD-PROMPT.md` are not in git yet — delete them from disk
directly; `git rm` won't know about them.

### Step 3 — Clean the shared files (edit, don't delete)

The compiler will catch most of these after step 2, but here is the list:

- `src/lib/constants.ts` — delete the block from the
  `// Virtual venue (migration 070)` comment (~line 788) down through the
  `VENUE = {...}` constant (~line 895). **Keep** `venue: 'Venue'` at line ~345
  — that's the physical venue section label.
- `src/types/index.ts` — delete the virtual-venue type block (~lines 480–638)
  and the `has_venue` / `venue_*` fields on the `Event` type (~lines 321–339).
  **Keep** `'venue'` inside `EventSectionType` (~line 90).
- `src/types/database.ts` — remove the five `venue`/`has_venue` columns from
  the events Row/Insert/Update shapes. **Keep** the `section_type` unions.
- `src/lib/event-slug.ts` — delete `venuePath()`, `venueRoomPath()`,
  `venueSetupPath()`; keep `eventSetupPath()`. Update its test file.
- `src/lib/delete-guard.ts` — remove the `hasVenue` field and its cascade
  message; update its test.
- `src/lib/category-icons.ts` — delete `VENUE_ROOM_ICONS` and
  `venueRoomIcon()` (~lines 78–96).
- `src/lib/event-blueprints.ts` — remove `has_venue` from the create options,
  `'venue'` from the setup-section union, and the hackathon blueprint's venue
  bits (or the whole hackathon blueprint). Update its test.
- `src/lib/emoji-catalog.test.ts` — remove the venue reaction imports and the
  "venue reaction set" test block.
- `src/lib/help/events.ts` — delete the "Hackathons & Venues" help articles
  (~lines 60–106); sweep the small copy mentions in `help/support.ts`,
  `collaboration.ts`, `basics.ts`, `community.ts`, `guides.ts`.
- `src/lib/site-map.ts` — delete the `events.venue` and `events.venue.setup`
  entries and the venue keywords on the hackathons entry.
- `src/components/layout/Navbar.tsx` — remove the "Virtual Hackathon" nav item
  (~line 120) and the venue path check (~line 415).
- `src/components/layout/MainLayout.tsx` — remove the `immersiveVenue`
  check (~lines 35–38, 77).
- `src/pages/events/EventDetailPage.tsx` — remove the `venuePath` import, the
  `hasVenue` flag, and the "Venue door" card (~lines 512–529).
- `src/pages/events/EventSetupPage.tsx` — remove the `venueSetupPath` import
  and the `has_venue` block (~lines 135–142), the `'venue'` filter, and the
  venue label.
- `src/pages/events/CreateEventPage.tsx` and `EditEventPage.tsx` — remove the
  `has_venue` toggle (`data-tutorial="event-form-venue"`) and the
  venue-setup redirect logic.
- `src/pages/admin/events/AdminEventDetailPage.tsx` — remove the Venue tab
  import, the `'venue'` tab id, and its render block.
- `src/hooks/useEvents.ts` — remove `has_venue` from the mutation payload type.
- `src/data/tutorials/index.ts` — remove the venue imports, the two tutorial
  ids, and the two registrations (~lines 76, 111–112, 210–221). Also sweep
  copy mentions in `event-detail.ts` (~29–32), `event-form.ts` (~25),
  `dashboard-tabs.ts`, `admin-sections.ts`, `listings.ts`, `events.ts`.
- `src/index.css` — delete the venue portal / palm sway animation blocks
  (~lines 980–1020), their reduced-motion entries (~1329–1333), the venue
  reactions section (~362 onward), and the "Venue room bento" section
  (~1397 onward).
- Translations — after everything compiles, re-run the i18n extraction
  (`scripts/i18n`) so the venue strings drop out of the `.po` catalogs; remove
  the two venue zone entries in `scripts/i18n/config.mjs` (~lines 98–99).
  Don't hand-edit the `.po`/`.mjs` files.
- Docs — sweep venue mentions in `docs/FEATURES.md`, `docs/FINISH-SETUP.md`
  (most of that file is venue setup), `docs/TESTING.md`, `docs/TODO.md`,
  `docs/RBAC.md`, and `README.md` (~lines 254–255).

### Step 4 — Dependencies and settings

- `npm uninstall @livekit/components-react @livekit/components-styles livekit-client livekit-server-sdk`
  (nothing else in the app uses LiveKit — the separate video-conference
  feature does not).
- `vite.config.ts` (~lines 282–295) — remove the LiveKit and recording env
  vars from the passthrough list.
- `.env` and `.env.example` — remove `VITE_LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`, and the six `RECORDING_S3_*` vars. Also delete them
  from your Vercel project settings if they're set there.

### Step 5 — The database (optional, and careful)

You can stop after step 4: the app will run fine with unused venue tables
sitting in the database. If you want a truly clean database, write ONE new
migration (numbered after the latest one) that drops, in this order:

1. The two realtime publications for `venue_room_messages` and `venue_rooms`.
2. The triggers on the venue tables.
3. The venue functions: `join_venue`, `venue_heartbeat`, `enter_venue_room`,
   `venue_room_occupancy`, `seed_default_venue_rooms`, `save_venue_map`,
   `venue_rect_cells`, `venue_room_broadcast`, `venue_check_in`,
   `venue_room_grant`, `guard_venue_member_role`, `touch_venue_rooms`,
   `venue_room_message_event_id`, `can_use_venue_channel`,
   `can_use_room_channel`.
4. The three tables: `venue_room_messages`, `event_venue_members`,
   `venue_rooms` (in that order — messages reference rooms).
5. The venue columns on `events`: `has_venue`, `venue_floorplan_url`,
   `venue_map`, `venue_opens_at`, `venue_closes_at` (and, if unused elsewhere,
   `spectators_enabled` / `spectator_scope`).

**Do NOT drop** `can_use_channel()`, `can_use_ydoc_channel()`,
`is_venue_member()`, `is_venue_host()`, or the two policies on
`realtime.messages` without rewriting them first — see gotcha #2 below.
Instead, replace `can_use_channel()` with a version that no longer routes
venue channels but still routes the ydoc/collab channels.

Also note: `supabase/seed_extended.sql` seeds venue rooms and members — remove
those sections or the seed script will fail once the tables are gone.

Dropping the tables **permanently deletes** all room chat history and venue
member records. Back up first if that matters.

### Step 6 — Verify

- `npm run build` — must compile clean.
- `npm test` — venue tests are gone with their files; nothing else should
  break except tests you were told to update above.
- Click through: create an event, event detail page, event setup, admin event
  editor, the nav bar. No "Enter the venue" buttons, no broken tabs.

---

## 6. Gotchas — read before touching anything

1. **Two "venues."** The physical venue page section (address/directions on an
   event page) shares the word but not the feature. Leave alone:
   `constants.ts` line ~345, the `'venue'` value in `EventSectionType`,
   `EventPageSectionRenderer.tsx`, all of `AdminEventPageBuilderTab.tsx`, and
   migration `009_event_page_sections.sql`.

2. **Shared realtime plumbing lives inside the venue migration.** Migration
   070 created `can_use_channel()` and `can_use_ydoc_channel()` plus the two
   security policies on `realtime.messages`. These guard ALL private live
   channels in the app — including the collaborative documents feature, which
   has nothing to do with the venue. If you drop them, collab docs break.
   Rewrite `can_use_channel()` without the venue branches instead of deleting
   it.

3. **Later migrations redefine venue functions.** Migrations 090, 096, and 100
   touch venue objects again (096 redefines `join_venue`, 100 adds a language
   column to room messages). Any removal migration must be numbered AFTER all
   of them. Never edit old migration files — always remove things with a new
   one.

4. **Some venue files aren't tracked by git yet** (`venue-kit/`,
   `venue-kit.zip`, `src/lib/venue-decor.ts`, `docs/VENUE-BUILD-PROMPT.md`).
   Delete them from disk directly.

5. **Three hooks don't say "venue" in their name** but belong to it:
   `useRoomSignals.ts`, `useRoomRecording.ts`, `useLiveCaptions.ts`. They go
   too. (Same for `src/lib/reaction-emoji.ts`.)

6. **The `/hackathons` page is a judgment call.** It's a real listing page,
   but its whole pitch is "enter the live venue." Either remove it with the
   venue or rewrite its copy and strip the venue buttons.

7. **Registration approval is loosely coupled.** The `attendance_type`
   viewer/spectator distinction (migration 096) mostly matters for venue
   roles. It can stay — it's harmless — but know the connection exists.
