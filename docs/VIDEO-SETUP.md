# Turning on video in the venue

Plain-English, end to end.

> **Status: the code is written. What is left is an account.**
>
> Steps 4, 5 and 6 below have been built — as migration `101_venue_room_grant.sql`,
> `api/venue/room-token.ts`, and `VenueCall.tsx` inside `AvStage.tsx`. What remains
> is steps 1–3: sign up, and put three values in the environment. Until you do,
> `/api/venue/room-token` answers 503 and the venue keeps drawing the placeholder
> tiles it always has. Nothing is broken in the meantime.
>
> Two things in this document were wrong by the time it was executed, and are
> corrected below:
> - **The migration is 101, not 099.** 099 and 100 were taken in between. The
>   comments in `070_event_venue.sql` and `src/types/index.ts` still say "in 071",
>   which was the original plan; ignore them.
> - **The token endpoint is a Vercel Edge route, not a Supabase Edge Function.**
>   There is no `supabase/functions/` directory in this repo. All 27 serverless
>   routes live under `api/`, are reached same-origin through the rewrites in
>   `vercel.json`, and carry no CORS headers by design. Section 5 has been
>   rewritten to match what was built.

---

## 1. What already exists, and what is missing

You already have far more than most people do at this point.

**Already built:**

| Thing | Where | What it means for video |
|---|---|---|
| Rooms | `venue_rooms` (migration 070) | Every room already has an id, a name and a door |
| Who may enter | `enter_venue_room()` (089) | Closed rooms, `allowed_roles`, capacity — all enforced in the database |
| `audio_mode` | `venue_rooms.audio_mode` | `open` / `moderated` / `listen_only` — who is allowed to talk |
| `max_publishers` | `venue_rooms.max_publishers` (default 12) | How many cameras may be on at once |
| `recording_enabled` | `venue_rooms.recording_enabled` | Whether this room is recorded |
| Camera layout | `venue_rooms.sections[].config.mode` | `spotlight` / `grid` / `huddle` / `off`, picked by the host in the venue builder |
| "Present" | broadcast on `room:{id}` | The host toggle that makes the call the big panel for everyone |
| The frames | `src/components/venue/room/AvStage.tsx` | Correctly sized, correctly counted placeholder tiles |

**Missing — this document:**

1. A video provider (nobody has an account yet).
2. A **token endpoint** — the thing that says "yes, this person may join this room's
   call, and yes they may switch their camera on".
3. Swapping the placeholder tiles in `AvStage.tsx` for real video.

That is genuinely all. The hard part — who is allowed where — was done in 070/089.

---

## 2. Choose a provider

Video calls need a media server. Browsers cannot do a 12-person call peer-to-peer
without falling over, so something in the middle has to receive everyone's camera
and forward it.

**Use LiveKit Cloud.** The whole codebase already assumes it (`AvStage.tsx`, the
notes in `venue-room-sections.ts`, `FEATURES.md`). It has a free tier, and setup
is about ten minutes.

The alternative — self-hosting `livekit-server` in Docker — is the same client
code, but you become responsible for TURN servers, TLS certificates and capacity.
Do not start there. If you later need to, nothing in the app changes except one
URL.

> Daily.co and Twilio Video are the same shape of product if you ever want to
> compare; the concepts below (a server-signed token per person per room) are
> identical for all three.

---

## 3. Get your credentials

1. Sign up at <https://cloud.livekit.io>.
2. Create a project. Call it something like `ktip-venue`.
3. The project page gives you three values:

| Value | Looks like | Secret? |
|---|---|---|
| **URL** | `wss://ktip-venue-abc123.livekit.cloud` | No — safe in the browser |
| **API key** | `APIxxxxxxxxxxx` | Yes |
| **API secret** | a long random string | **Yes. Never ships to the browser.** |

**The one rule that matters:** anything named `VITE_*` in this project is compiled
into the JavaScript every visitor downloads. So:

```bash
# .env — correct
VITE_LIVEKIT_URL=wss://ktip-venue-abc123.livekit.cloud

# NEVER do this. The secret would be readable by anyone who opens devtools,
# and with it they could mint a token for any room in your venue.
# VITE_LIVEKIT_API_SECRET=...
```

The key and secret live only on the server (step 5).

---

## 4. `venue_room_grant()` — migration 101 ✅ built

> Written as `supabase/migrations/101_venue_room_grant.sql` — **read that file, not
> the block below**, which is the original draft kept for context. Apply it the way
> you apply the others (Supabase SQL editor, or `supabase db push`).
>
> One thing changed on the way in. The draft's comment claimed the occupancy query
> counts "how many people are already on camera". It does not, and cannot —
> Postgres has no idea who has a camera on, because that state lives in the media
> server. It counts *people in the room*. That makes `max_publishers` an
> over-estimate and a soft cap, which is the safe direction to be wrong in since
> the cap exists to protect the bandwidth bill, but the shipped file says so
> plainly instead.

This is the function that answers, in the database, "what is this person allowed
to do in this room's call". It already had a name — 070 and 089 both refer to it
in comments — it just was never written.

`supabase/migrations/101_venue_room_grant.sql`:

```sql
-- ============================================================
-- 099: what a member may do in a room's call
-- ============================================================
--
-- The video provider's token is minted outside the database, so this is where
-- the decision is made — same rules enter_venue_room() enforces at the door,
-- returned instead of raised. A rule only the client reads is not a rule, and a
-- publish permission the client chooses is not a permission.
--
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION venue_room_grant(p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_role TEXT;
  v_host BOOLEAN;
  v_publishing INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;

  SELECT role INTO v_role FROM event_venue_members
  WHERE event_id = v_room.event_id AND user_id = v_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  v_host := is_venue_host(v_user, v_room.event_id);

  IF NOT v_room.is_open AND NOT v_host THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  -- Empty means unrestricted. Hosts are never locked out of their own venue.
  IF array_length(v_room.allowed_roles, 1) IS NOT NULL
     AND NOT (v_role = ANY(v_room.allowed_roles))
     AND NOT v_host THEN
    RAISE EXCEPTION 'this room is not open to %', v_role;
  END IF;

  -- How many people are already on camera. max_publishers is a seat count, not
  -- a tile count: the 13th person still joins, they just cannot switch a camera
  -- on until somebody else stops.
  SELECT COUNT(*) INTO v_publishing FROM event_venue_members
  WHERE current_room_id = p_room_id
    AND user_id <> v_user
    AND last_seen_at > now() - INTERVAL '2 minutes';

  RETURN jsonb_build_object(
    'room', v_room.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    -- listen_only means nobody but a host publishes. moderated is the same at
    -- the door — a host raises someone by re-issuing their token, which is why
    -- this is a function and not a column.
    'can_publish', CASE
      WHEN v_host THEN TRUE
      WHEN v_room.audio_mode = 'listen_only' THEN FALSE
      WHEN v_room.audio_mode = 'moderated' THEN FALSE
      WHEN v_publishing >= v_room.max_publishers THEN FALSE
      ELSE TRUE
    END,
    'can_publish_data', TRUE,
    'is_host', v_host,
    'recording', v_room.recording_enabled,
    'audio_mode', v_room.audio_mode,
    'max_publishers', v_room.max_publishers
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION venue_room_grant(UUID) IS
  'What the caller may do in this room''s call. Consumed by the venue-room-token edge function when signing a LiveKit access token.';

REVOKE ALL ON FUNCTION venue_room_grant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION venue_room_grant(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

Apply it the way you apply the others (Supabase SQL editor, or
`supabase db push`).

---

## 5. The token endpoint — a Vercel Edge route ✅ built

A LiveKit token is a short-lived signed note that says *who you are*, *which room*
and *what you may do*. It must be signed with the API secret, so it has to be made
on a server.

**This document originally said to write a Supabase Edge Function. That was wrong
for this repo** — there is no `supabase/functions/` directory, and all 27 serverless
routes are Vercel Edge handlers under `api/`, reached same-origin through the
rewrites in `vercel.json`. That is why none of them set CORS headers: nothing
cross-origin ever calls them. Following the original recipe would have introduced a
second serverless runtime and a cross-origin surface for no benefit.

What was built instead:

| File | What it does |
|---|---|
| `api/venue/room-token.ts` | The route. Verifies the caller, calls `venue_room_grant()` **as that caller**, signs whatever comes back. |
| `api/_lib/livekit-token.ts` | The signing, on its own so it is unit-testable. |
| `src/lib/__tests__/livekit-token.test.ts` | Asserts the claim shape, the signature, and that a forged secret fails. |

Two deliberate departures from the shape `api/admin/*` uses:

- **No `requirePermission`.** There is no platform permission meaning "may join
  this call" — venue membership *is* the authorisation, and `venue_room_grant()`
  checks it while running as the caller.
- **No service-role client.** The caller’s own JWT answers the question, so minting
  an RLS-bypassing key would be blast radius for nothing.

**No `livekit-server-sdk` dependency.** A LiveKit token is an ordinary HS256 JWT
with one custom `video` claim, so it is signed with Web Crypto in about forty
lines. The SDK targets Node; every route here runs on the edge runtime, and the
incompatibility would have surfaced at deploy time. Swapping the SDK back in later
is a drop-in — the claim shape is the documented wire format.

Set the secrets in **Vercel** (not `supabase secrets`):

```bash
# Vercel dashboard -> Settings -> Environment Variables, or:
vercel env add LIVEKIT_API_KEY
vercel env add LIVEKIT_API_SECRET
vercel env add VITE_LIVEKIT_URL
```

For local development, `vercel dev` is what makes `/api/*` reachable — the same
requirement `/api/ai-chat` already has. `.env` values are promoted into
`process.env` by `vite.config.ts` so dev matches production.

Test it before touching the venue — a token endpoint that works is the whole battle:

```bash
curl -X POST http://localhost:3000/api/venue/room-token \
  -H "Authorization: Bearer <a real user access token>" \
  -H "Content-Type: application/json" \
  -d '{"roomId":"<a room uuid>"}'
```

You want a long `token` string and a `grant` object back. Paste the token into
<https://jwt.io> and read it — it should name the room and the permissions you
expect. If `can_publish` is false when it should be true, the bug is in step 4,
not here.

A **503** means the environment variables are missing. A **403** means the RPC
refused, and its message is the room’s real rule — "this room is closed", "not a
member of this venue".

---

## 6. Wire the frontend

```bash
npm i livekit-client @livekit/components-react @livekit/components-styles
```

Then `AvStage.tsx` changes shape but not size. Today each camera tile is a
dashed placeholder; each becomes a real participant tile. The four modes map
straight onto LiveKit's own layouts:

| Mode | Today | With LiveKit |
|---|---|---|
| `spotlight` | one big frame + 4 thumbnails | `<FocusLayout>` — the presenter's track big, the rest as `<ParticipantTile>` |
| `grid` | up to 9 equal `aspect-video` tiles | `<GridLayout>` over `useTracks([Track.Source.Camera])` |
| `huddle` | round avatar bubbles | audio-only: `<RoomAudioRenderer>` plus the bubbles you already have, lit up when someone speaks |
| `off` | renders nothing | still renders nothing — no connection is made at all |

Built as two files, so `AvStage` stays a presentation component:

| File | What it does |
|---|---|
| `src/hooks/useVenueRoomToken.ts` | Fetches and refreshes the token. Also exports `isVenueVideoConfigured()`, the single answer to "is video switched on for this deployment". |
| `src/components/venue/room/VenueCall.tsx` | The `<LiveKitRoom>` and the four layouts. |

Note the token is fetched with a plain `fetch` plus the caller’s Supabase access
token — **not** `supabase.functions.invoke`, which the original sketch used and
which only works against a Supabase Edge Function. See step 5.

How the two states fit together: `AvStage` renders `<VenueCall>` once it has a
token, and keeps its original placeholder tiles for every other case — no LiveKit
project configured, a grant still in flight, or a member the RPC refused. Nothing
moves between the two, which is what the placeholder was shaped for.

The footer line stopped saying "voice and screen sharing arrive with the next
release" and now says what is actually true: connecting, on, listen-only, not
configured, or the RPC’s own refusal message. A camera button that silently does
nothing is the failure that replaces.

Two things to keep as they are:

- **The room name in LiveKit is the `venue_rooms.id` UUID.** Not the slug, not
  the display name — ids do not change when a host renames a room mid-event.
- **`mode === 'off'` must not connect.** A connection is billed by the minute
  whether or not anyone speaks.

---

## 7. What "Present" becomes

The Present toggle already works — it broadcasts on the room's Supabase channel
and moves the call into the big panel on everyone's screen. Nothing about it
changes when video lands, and it keeps working if LiveKit is down.

Once video is live, add one thing: when the host presents in a `moderated` room,
their client asks the token endpoint for a fresh token. The grant comes back with
`can_publish: true` because `is_host` is true, and they start publishing. Raising
a participant's hand into a speaking slot is the same move — re-issue their
token — which is why `venue_room_grant()` is a function rather than a column.

---

## 8. Recording ✅ built

Built as `api/venue/room-recording.ts`, driving LiveKit Egress.

**This route is Node, not edge — the only one in `api/`.** Signing a join token
is forty lines of Web Crypto, but starting an egress is a protobuf-over-twirp
call whose wire format is not worth hand-rolling. `livekit-server-sdk` owns that
and targets Node, so the route moved rather than the format being guessed at.
The SDK is server-only and does not reach the browser bundle.

**Two things must both be true** before anything records: the caller is a host
of this venue, and the room itself has `recording_enabled`. Both come from
`venue_room_grant()`, checked server-side — hiding the button is a suggestion,
this is the rule. A host cannot record a room the organiser did not mark.

**No status column.** LiveKit already knows which egresses are running, so
`listEgress` is the source of truth. A `recording_in_progress` column would
drift the first time a browser closed mid-recording, and recovering from that
drift is worse than the round trip it saves.

### Consent

The original draft of this section said "everyone must see the notice *before*
joining, not after — the red dot is not enough on its own". That is now
enforced rather than advised: `RecordingConsent.tsx` gates the LiveKit
**connection**. In a room with `recording_enabled`, no socket opens and no
track is published until the member has read the notice and accepted. They can
stay in the room, read chat and take part without ever being recorded.

The acknowledgement is stored per room per device in localStorage, deliberately
not on the profile — it is a decision about this room on this machine, not a
standing consent to be recorded anywhere in the venue. Someone on a shared lab
laptop is asked again.

The header dot also stopped conflating two different claims. A room that MAY be
recorded now reads "Can be recorded" in grey; only an actually-running egress
goes red and pulses. Only hosts can see the live state, because only hosts may
ask LiveKit — everyone else gets the weaker, honest statement they consented to.

### Storage

Egress writes the file **directly to your bucket**; the bytes never pass through
this app. Supabase Storage is not an Egress target, so a bucket elsewhere is
required. Any S3-compatible store works — Cloudflare R2 is the cheapest sane
default because it charges no egress fees, and AWS S3 or Backblaze B2 are
equally fine.

Set `RECORDING_S3_BUCKET`, `RECORDING_S3_ACCESS_KEY`, `RECORDING_S3_SECRET`,
and for anything that is not AWS also `RECORDING_S3_ENDPOINT` (which turns on
path-style addressing). Without them the route answers 503 with "Recording
storage is not configured" and everything else about video still works.

Files land at `venue/<room-uuid>/<timestamp>.mp4`. The room **id**, not its name,
so a host renaming a room mid-event does not scatter one recording across two
folders.

### Still open

**Who may watch it back.** That is a new table and new RLS, not a video problem.
Right now the files are in your bucket and access is whatever your bucket policy
says. Do not point a public bucket at this.

---

## 8b. Live translated captions ✅ built

Anyone in the call can switch on "Caption my speech". Everyone else reads them
in their own language — English, French or Spanish — using the same translation
pipeline as room chat.

Three files: `src/lib/captions/speech.ts` (the recogniser),
`src/hooks/useLiveCaptions.ts` (transport and translation),
`src/components/venue/room/CaptionStrip.tsx` (the strip under the call).

**Each speaker transcribes their own microphone**, in their own browser, with
the Web Speech API. Not the room mix: local audio is clean and near-field, the
speaker is known without diarisation, and the cost falls on the person talking
rather than on every person listening. It is also free and needs no key, so
captions work on a deployment that has configured nothing beyond LiveKit.

**The speaker also pays for the translation, once**, into the other two
languages, then broadcasts all of them together. Translating on each listener
would mean a room of twenty paying twenty times for the same sentence.

**Two messages per utterance.** The original goes out the instant it is final,
so everyone sees something in about a second; the translations follow when they
land and swap in place. Waiting for the translation would make every caption
late for everyone, including the people who did not need it translated.

**Transport is the LiveKit data channel**, not Supabase broadcast — the call is
already connected and already authorised by the same signed token, so it is one
fewer moving part, and captions cannot outlive the call they belong to. Sent
unreliable: a late caption is worse than a missing one, and the audio must not
stutter for it.

**Nothing is stored.** Captions go through the translation pipeline with
`store: false`, so they never enter the shared Postgres cache — spoken words in
a room are exactly what migration 097 says must not outlive the request. The
on-screen buffer is a ring that forgets after 45 seconds.

**Browser support is the real limitation.** Chrome, Edge and Safari have
SpeechRecognition; Firefox does not. The button is disabled there with a reason
rather than silently failing. If that becomes a problem, the recogniser is a
seam — a Soniox or Deepgram WebSocket source implements the same three methods
and nothing above it changes.

---

## 9. Cost, limits and testing

**Cost.** LiveKit Cloud bills by participant-minutes and bandwidth; the free tier
is generous enough for testing and small sessions. Check the current numbers at
<https://livekit.io/pricing> rather than trusting any figure written down here —
they change. The three things that actually drive the bill:

- **Publishers, not viewers.** Cameras cost far more than eyes. This is exactly
  why `huddle` and `off` exist as modes, and why `max_publishers` defaults to 12.
- **Rooms left open.** A tab nobody is looking at still bills. LiveKit closes an
  empty room by itself; make sure the app disconnects on navigate-away.
- **Video resolution.** Cap publish resolution to 720p (or 540p for `grid`
  rooms) unless somebody has a reason to go higher.

**Testing.** Two browser profiles, or one normal window and one incognito, signed
in as two different members of the same event. Both walk into the same room. Then
work down this list:

1. Both see each other's tile.
2. Host toggles **Present** → the call becomes the big panel in the *other*
   browser too.
3. Set the room to `listen_only` in the venue builder, rejoin — the participant's
   camera button is gone, the host's is not.
4. Close the room — the participant is refused at the door and no token is
   issued.
5. Set the camera mode to **No video** — check the network tab: no LiveKit
   connection is opened at all.

**When a token is rejected**, work backwards in this order — it is almost always
the first or second:

1. Is `venue_room_grant` raising? Call it directly in the SQL editor as that
   user. Every message it raises is one of the room's real rules.
2. Are the secrets set on the deployed function? `supabase secrets list`.
3. Is the clock right? A signed token from a machine whose clock is minutes off
   is rejected as expired.
4. Is `VITE_LIVEKIT_URL` the `wss://` URL and not the `https://` dashboard URL?

---

## What is left to do

Steps 2–6 are built. What remains is the account and the wiring:

1. **LiveKit Cloud account**, copy the three values. *(10 min)*
2. **Apply migration 101** — `supabase db push`, or paste it into the SQL editor.
   Call `venue_room_grant('<a room uuid>')` there as a real member and check the
   answers before going near the frontend. *(10 min)*
3. **Set the three environment variables** in Vercel — `VITE_LIVEKIT_URL`,
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. *(5 min)*
4. **`curl` the token endpoint** until it returns a token, then paste it into
   jwt.io and read the grant. *(10 min)*
5. **Walk into a room** with two browser profiles and work down the testing list
   in section 9. *(20 min)*
6. Recording, if anyone actually needs it. *(later)*

Step 2 is the one worth being careful about — every rule in the venue is decided
there, and a wrong answer from that function is a wrong answer everywhere else.

**Nothing above is required for the app to keep working.** With no LiveKit
project, `/api/venue/room-token` answers 503, `isVenueVideoConfigured()` is false,
and the venue draws the same placeholder tiles it always has.
