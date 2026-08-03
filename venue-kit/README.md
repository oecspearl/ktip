# venue-kit

A drop-in virtual event venue for **React + Supabase**: rooms, live presence,
per-room speaking rules, and the hard-won realtime architecture already
debugged for you.

```
venue-kit/
  README.md                  ← you are here
  PROMPT.md                  ← AI-assistant build prompt for the full feature set
  sql/001_venue.sql          ← schema + RLS + server functions (run once)
  src/
    index.ts                 ← public exports
    types.ts
    constants.ts
    presence-logic.ts        ← every presence decision, as pure tested functions
    presence-logic.test.ts
    useVenuePresence.ts      ← the realtime channel, lifecycle already hardened
    VenueProvider.tsx        ← mount ONCE per venue visit (layout level)
    components.tsx           ← OccupantList, ConnectionChip, AvailabilityPicker, RoomGrid
    venue-kit.css            ← neutral default styles (CSS vars, easy to theme)
```

## Install

1. Copy `src/` into your app (e.g. `src/venue-kit/`). Peer deps: `react`,
   `@supabase/supabase-js` (v2.95+). No router, i18n, or query-library
   dependency.
2. Run `sql/001_venue.sql` against your Supabase project. **Edit
   `venue_kit_role_for()` first** — it decides each user's role from *your*
   registration data and is the single place entry is granted or refused.
3. Import `venue-kit.css` once (or restyle; every element has a
   `vk-` class).

## Wiring (the one rule that matters)

Mount `VenueProvider` in a **layout that wraps the floorplan page AND every
room page**, and derive `roomId` from the URL. The provider owns one realtime
channel per venue visit; entering a room is a single presence update on the
already-joined socket. If you mount it per page instead, every navigation
tears the socket down and the user stares at "Reconnecting…" — this is the
most common way this feature gets built wrong.

```tsx
// React Router example — any router works, the kit never imports one.
function VenueLayout() {
  const { eventId } = useParams()
  const roomKey = useMatch('/venue/:eventId/room/:roomKey')?.params.roomKey ?? null
  const { user } = useYourAuth()

  return (
    <VenueProvider
      client={supabase}
      eventId={eventId!}
      user={user && { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl }}
      roomKey={roomKey}
    >
      <Outlet />
    </VenueProvider>
  )
}
```

Inside any child:

```tsx
const venue = useVenue()
// venue.membership       your row: role, availability (join happens automatically)
// venue.rooms            all rooms in this venue
// venue.presence.occupants   everyone, live-first with DB fallback
// venue.presence.occupancy   { [roomId]: count }
// venue.presence.connected   socket truth — feed it to <ConnectionChip>
// venue.presence.setAvailability('busy' | 'working' | 'help_wanted' | 'away')

<RoomGrid rooms={venue.rooms} occupancy={venue.presence.occupancy}
          onEnter={(room) => navigate(`/venue/${eventId}/room/${room.key}`)} />
<OccupantList occupants={occupantsInRoom(venue.presence.occupants, roomId)} />
```

## What the architecture already knows (do not re-learn these)

- **One presence channel per venue**, never per room. Per-room occupancy is a
  client-side groupBy. "Which room am I in" is a field on the tracked
  payload.
- **Cold mirror**: presence is mirrored to `venue_members` at most every 45 s
  (immediately on change). Live presence always wins; the DB row is only for
  first paint and for viewers off the channel; rows older than 2 min render
  offline.
- **Never fight the realtime library.** supabase-js retries
  `CHANNEL_ERROR`/`TIMED_OUT` itself; only `CLOSED` is terminal. The hook
  restarts only on CLOSED, and fully disposes the dead channel instance
  (awaited) before creating a successor — otherwise a half-dead instance's
  rejoin timer unsubscribes every replacement and presence blinks on/off
  forever. Already handled in `useVenuePresence.ts`; leave the lifecycle
  alone.
- **Manual `busy`/`help_wanted` is sticky** — auto-away only ever downgrades
  the default `working`. Multiple tabs merge to one person (strongest
  availability wins, latest room wins).
- **The server decides everything**: roles (`venue_kit_role_for`), room
  entry (`enter_venue_room`), channel access (RLS on `realtime.messages`).
  The client only renders what was already decided.
- **Capacity is advisory** (checked against the mirror) — bouncing someone on
  a stale count is worse than one extra person in a room.

## Per-room speaking rules

`venue_rooms.audio_mode` : `open` (everyone) · `moderated` (host grants the
floor) · `listen_only` (speakers/organizers only). `camera_mode` : `spotlight`
· `grid` · `huddle` (audio-only) · `off` (no call at all — don't open a media
socket for a quiet room).

The kit ships presence + rooms + the permission model. For A/V, chat panels,
hand-raise queues and recording, hand `PROMPT.md` to your AI assistant — it
specifies the token-based A/V permission design (`the signed token IS the
permission`), the room-kind presets, and phase-by-phase acceptance criteria.

## Testing

`presence-logic.test.ts` runs under vitest/jest with no socket and no DOM —
every merge/staleness/precedence decision is a pure function. If you change a
rule, change its test.
