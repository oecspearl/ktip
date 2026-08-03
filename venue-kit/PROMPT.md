# Prompt: Build a Virtual Event Venue with Role-Aware Rooms

> Copy everything below the line into your AI coding assistant (Claude Code,
> Cursor, etc.), fill in the three placeholders in **Section 0**, and work
> through it phase by phase. It is written so each phase is independently
> shippable and testable. The "hard-won rules" are not style preferences —
> each one encodes a production bug this architecture has already paid for.

---

I want you to build a **virtual event venue** for my platform: a live,
multi-room space that attendees enter during an event, see who else is
present in real time, move between rooms, and talk — by text and by
audio/video — under **per-room rules about who may speak**. Think "virtual
conference floor": a keynote stage where only speakers have microphones, an
open networking lounge where everyone talks, moderated workshops where a host
grants the floor, quiet rooms with no call at all.

Build it in phases, in the order given. Do not skip ahead: every later phase
leans on the presence architecture in Phase 2, and getting that wrong is the
single most common way this kind of feature fails.

## 0. My stack (fill in before running)

- **App framework:** `<e.g. React + React Router / Next.js / Vue>`
- **Realtime + database:** `<e.g. Supabase (Postgres + Realtime) / Firebase / Socket.io + Postgres>`
- **A/V provider (Phase 5 only):** `<e.g. LiveKit / Daily / Agora / none for now>`

Where this prompt says "server-enforced", use my stack's mechanism: RLS
policies and `SECURITY DEFINER` functions on Supabase, security rules on
Firebase, route middleware on a custom server. The invariant matters, not the
mechanism: **the client never decides permissions; it only renders what the
server already decided.**

## 1. Data model

Create these entities (adapt names to my conventions):

**`venues`** — one per event. Flags: `is_open`, `opens_at`, `closes_at`.

**`rooms`** — belongs to a venue. Fields:
- `key` (stable slug for URLs — never address rooms by UUID in links)
- `name`, `description`, `kind` (see the room-kind table below)
- `is_open` (closed rooms are visible but not enterable)
- `capacity` (advisory — see rules)
- `audio_mode`: `open` | `moderated` | `listen_only`
- `camera_mode`: `spotlight` | `grid` | `huddle` (audio-only) | `off`
- `recording_enabled` boolean

**`venue_members`** — one row per (venue, user). Fields:
- `role`: `organizer` | `speaker` | `mentor` | `judge` | `participant` | `spectator`
- `availability`: `working` | `away` | `busy` | `help_wanted` | (derived: `offline`)
- `status_note`, `current_room_id`, `last_seen_at`, `meta` (jsonb, reserved)

This table is the **cold mirror** of presence — its job is defined in Phase 2.

**`room_messages`** — room chat. Belongs to room, has author, body, and
`lang` (sender's language, stamped from their setting — never auto-detected;
two words of chat are ambiguous, a setting is not).

**Joining is one idempotent server call** (`join_venue(venue_id)`): returns
the existing membership row if present, inserts on first entry, and the
**server assigns the role** from the event's own data (registration list,
speaker list). The client never sends a role. It raises a clear error
("register for this event first") rather than returning null — that error is
an answer for the UI, not a failure.

## 2. Presence — the heart of the system. Read this twice.

### Architecture

- **ONE realtime presence channel per venue** (`venue:{venueId}`), not one
  per room. Presence protocols hand every subscriber the complete state, so
  per-room occupancy is a client-side `groupBy(room_id)`. Nine rooms = one
  subscription, not nine.
- "Which room am I in" is a **field on my tracked presence payload**
  (`room_id`), not a separate subscription. Entering a room = one `track()`
  call updating the payload on the already-joined channel.
- The tracked payload: `{ user_id, display_name, avatar_url, role,
  availability, status_note, room_id, v: 1 }`. Version it from day one.

### The channel must outlive page navigation

Mount the presence subscription in a **layout-level provider** that wraps the
floorplan page AND every room page — never in the pages themselves. Derive
`room_id` from the URL inside the provider. If each page mounts its own
subscription, every room enter/exit tears the socket down and pays
authentication + join + presence sync again, and the UI sits on
"Reconnecting…" at exactly the moment the user expects to see who's in the
room. This is the #1 architectural mistake for this feature. Room-scoped
channels (chat, reactions) are the only per-page subscriptions.

### The cold mirror

Live presence dies with the socket, so mirror it to `venue_members` via a
throttled server call (`heartbeat(venue_id, room_id, availability, note)`):

- Write immediately when something **changes** (room, availability, note);
  otherwise at most **once per 45 seconds** as keep-alive.
- Merge rule, and it only goes one way: **live presence always wins.** The DB
  row is consulted only for members with *no* live entry — first paint before
  the channel syncs, and viewers not on the channel (a dashboard, an email
  digest).
- A mirror row older than **2 minutes renders as `offline`**, contributing no
  room and no status. A two-hour-old "working" is a lie.
- Put all merge/staleness/precedence logic in **pure functions of
  (presence state, roster rows, now)** in one module with unit tests. No
  socket needed to test any decision.

### Availability semantics

- Auto-away: tab hidden AND idle > 5 min → report `away` — but a **manually
  chosen** `busy` or `help_wanted` is sticky and never auto-downgraded.
  Someone who set "do not disturb" chose the stronger signal on purpose.
- Multiple tabs are one person. Merge by user id; strongest availability wins
  (`busy` > `help_wanted` > `working` > `away`); most recent tab's room wins.
- Sort occupant lists `help_wanted` first. Surfacing who is stuck is half the
  reason a venue exists.

### Hard-won realtime rules (each is a shipped bug)

1. **Do not build a manual retry loop on top of the client library's
   reconnection.** Read your realtime library's source first and write down:
   (a) which failure states it retries itself, (b) which are terminal, (c)
   whether creating a channel for an existing topic returns the existing
   instance. Handle ONLY the terminal states — and before re-creating a
   channel, fully dispose the old instance and await that disposal. Two
   reconnect loops on one topic kill each other's joins forever; the symptom
   is presence blinking on and off every 1–2 seconds.
2. **Show connection state honestly, with a grace window.** One chip: green
   dot + "N here" when live; after ~2 s of disconnection, "Reconnecting —
   counts may be stale". Never render a confident zero from a dead socket,
   and never alarm on a sub-second blip.
3. If avatars **move** on a floorplan map: positions ride fire-and-forget
   broadcast (~8/s, throttled), NOT presence tracking (rate-limited state
   replication). Re-track the coarse position only on crossing a grid cell
   (~1/s). Keep positions in refs/animation frames — never per-packet
   `setState`, or N walkers re-render the world 8×N times a second.
4. If your channels are private/authorized: push the user's JWT to the
   realtime socket **before** subscribing, and authorize topics server-side
   (e.g. RLS on the realtime messages table). An anonymous key plus a guessed
   venue UUID must not be enough to watch a venue.

## 3. Roles and the permission matrix

Server-enforced (the UI merely mirrors it — a student must never see a button
that would fail):

| Capability | organizer | speaker | mentor | judge | participant | spectator |
|---|---|---|---|---|---|---|
| Enter open rooms | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (listen-only) |
| Enter closed rooms | ✓ | — | — | — | — | — |
| Publish A/V in `open` rooms | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Publish A/V in `moderated` rooms | ✓ | ✓ | granted by host | granted by host | granted by host | — |
| Publish A/V in `listen_only` rooms | ✓ | ✓ | — | — | — | — |
| Send chat | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Post announcements | ✓ | ✓ (own room) | — | — | — | — |
| Start/stop recording | ✓ | — | — | — | — | — |
| Edit rooms / change member roles | ✓ | — | — | — | — | — |

Rules:
- Room **capacity is advisory**, checked against the cold mirror at the
  enter call. Bouncing someone on a stale count is worse than letting one
  extra person in. Enforce hard caps only where the A/V provider bills for it
  (`max_publishers`).
- A role change by anyone but an organizer is silently reverted server-side
  (trigger/rule), even if the client sends one.
- "Hand raise" queue in moderated rooms: ordered by **server arrival time**,
  never the sender's clock — a device an hour fast would jump the queue
  forever.

## 4. Room kinds (behavior presets, not just icons)

Each kind = a preset of `audio_mode` + `camera_mode` + panel layout. Store
resolved config on the room row so an organizer can override per-room.

| Kind | Audio | Camera | The point |
|---|---|---|---|
| `stage` / keynote | `listen_only` | `spotlight` | Speakers present; audience listens, reacts, raises hands |
| `workshop` | `moderated` | `grid` | Host grants the mic; capped publisher count |
| `networking` | `open` | `grid` or `huddle` | Everyone talks |
| `help_desk` | `open` | `huddle` | Mentors staff it; `help_wanted` members routed here |
| `team` room | `open` | `huddle` | Private to a team — server-enforced membership |
| `judging` | `moderated` | `grid` | Equal tiles on purpose; judges + presenting team |
| `breakout` / quiet | — | `off` | **No call socket is opened at all** (connections bill by the minute whether or not anyone speaks) |
| `sponsor_booth` | `open` | `spotlight` | Booth content above the fold, staff below |

What a room contains (chat, A/V stage, hand-raise queue, announcements,
occupant list, custom panels) is **data on the room row** resolved against
the kind's defaults — adding a panel type must be a registry entry, not a
page branch.

## 5. Audio/video — the token IS the permission

- One server endpoint: `POST /api/room-token { roomId }`. It calls a single
  server-side function that knows every rule (member? room open? role may
  publish? under publisher cap? recording consent needed?) and returns a
  **signed A/V token whose grant encodes the answer** (`can_publish`,
  `can_subscribe`, `max_publishers`, `is_host`). The media server enforces
  the token. The client passes it through and can lie all it wants — a lied
  `canPublish` is refused at the media server. Never put this decision in
  client code.
- Return the grant alongside the token so the UI can explain itself: "You
  are listening — a host can give you the floor" reads very differently from
  a mic button that silently fails.
- Token lifetime ~30 min, **refresh at ~25** — a token that expires while
  its replacement is in flight drops the call mid-sentence.
- **Lazy-load the A/V SDK.** It is the largest thing this feature can pull
  in (~650 KB+). Render placeholder tiles (same frames, seeded from the
  people actually in the room) immediately; import the SDK only when a
  member actually holds a token. The placeholder-first design also means
  nothing shifts on screen the day video turns on — and the app still works
  with no A/V provider configured at all.
- **Recording:** host-only, server-checked twice (UI and endpoint). Consent
  gates the **connection**, not just a notice — in a recordable room nothing
  is published until the member accepts. And distinguish honestly between
  "this room CAN be recorded" (what everyone sees) and "this room IS being
  recorded right now" (only surfaced where it's actually known).

## 6. Chat and announcements

- Chat = one channel per room, subscribed **only while inside** the room.
  Paginated history (50/page) from the DB; live tail over the channel;
  dedupe by message id (dev double-mounts and reconnects will deliver
  duplicates).
- Announcements: pinned, organizer/speaker-only, rendered above chat.
- If multilingual matters: stamp each message with the sender's language
  **setting**; translate on the reader's side with a shared server-side
  cache keyed by content hash (first reader pays, everyone after is free);
  always keep the original one click away. Machine translation of casual
  speech is wrong often enough that hiding the source is not defensible.

## 7. UX contract

- Floorplan is the front door: every room, its occupancy count (live groupBy,
  cold-mirror fallback for first paint), who needs help, and your own status
  picker. Occupancy badges count people you could talk to **now** — exclude
  `offline`.
- Room URLs are readable (`/venue/<event-slug>/room/<room-key>`) and
  deep-linkable; direct entry runs the same server-side enter check.
- Leaving a room (back to floorplan, tab close) must clear `room_id` promptly
  — a ghost in a room is worse than an empty room. Staleness (2 min) is the
  backstop, not the mechanism.
- Loading states: skeleton for the shell, roster fallback for people. Never
  block the room's static content (name, description, chat history) on the
  realtime join.

## 8. Build order and acceptance criteria

**Phase 1 — Model + venue shell.** Tables, `join_venue`, floorplan page
listing rooms with static info. ✅ Two accounts can join; roles assigned
server-side; closed room refuses entry with a readable reason.

**Phase 2 — Presence.** Layout-level provider, one channel, cold mirror,
merge module with unit tests. ✅ Two browsers see each other < 2 s after
entry; navigating floorplan↔room does NOT drop the connection (assert no
re-join in the network tab); killing one browser flips it to offline within
the staleness window; a manually-set `busy` survives 10 min of tab-hiding.

**Phase 3 — Rooms + chat.** Enter/leave, per-room chat, occupant list
sorted help-first. ✅ Message sent in room A is not visible from room B;
spectators cannot send; entering a full room still works (advisory cap).

**Phase 4 — Permission matrix + moderation.** Matrix above, hand-raise
queue, host grant/revoke of the floor. ✅ Server rejects every action the UI
hides, verified by direct API calls, not by the absence of buttons.

**Phase 5 — A/V.** Token endpoint, per-kind call layouts, lazy SDK,
recording + consent. ✅ In a `stage` room a participant's token has
`can_publish: false` and the media server refuses a forced publish; a
`camera_mode: off` room opens no media connection (network tab); room page
first paint happens before the SDK chunk downloads.

**Phase 6 — Polish.** Availability picker, auto-away with sticky manual
states, connection chip with grace window, reconnect siege-testing (kill the
network for 30 s repeatedly: presence must recover without page reload and
WITHOUT oscillating).

For every phase: pure decision logic in tested modules; realtime plumbing
thin and mockable; every server rule tested by calling the API directly with
the wrong role at least once.
