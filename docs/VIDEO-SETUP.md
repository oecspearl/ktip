# Turning on video in the venue

Plain-English, end to end. Nothing here is switched on yet — this is the recipe.

Read it top to bottom once before doing anything; steps 4 and 5 are the only ones
where a mistake costs anything.

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

## 4. Add `venue_room_grant()` — migration 099

This is the function that answers, in the database, "what is this person allowed
to do in this room's call". It already has a name — 070 and 089 both refer to it
in comments — it just was never written.

> Number it **099** — 098 is the highest that exists. Check
> `supabase/check_migrations.sql` for the current list before picking a number;
> 091 is already used twice and that is one collision too many.

`supabase/migrations/099_venue_room_grant.sql`:

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

## 5. The token endpoint — a Supabase Edge Function

A LiveKit token is a short-lived signed note that says *who you are*, *which room*
and *what you may do*. It must be signed with the API secret, so it must be made
on a server. Supabase Edge Functions are already part of this stack.

Create `supabase/functions/venue-room-token/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { roomId } = await req.json()
    const authHeader = req.headers.get('Authorization') ?? ''

    // The caller's own JWT, so auth.uid() inside the function is them and not
    // the service role. This is what makes the grant trustworthy.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: user } = await supabase.auth.getUser()
    if (!user?.user) return json({ error: 'not signed in' }, 401)

    // Every rule lives in Postgres. This function never decides anything.
    const { data: grant, error } = await supabase.rpc('venue_room_grant', {
      p_room_id: roomId,
    })
    if (error) return json({ error: error.message }, 403)

    const token = new AccessToken(
      Deno.env.get('LIVEKIT_API_KEY')!,
      Deno.env.get('LIVEKIT_API_SECRET')!,
      {
        identity: user.user.id,
        name: user.user.user_metadata?.display_name ?? 'Member',
        // Short, because permissions change: closing a room or muting a
        // speaker should take effect on the next join, not in six hours.
        ttl: '30m',
      }
    )

    token.addGrant({
      room: grant.room,
      roomJoin: true,
      canSubscribe: grant.can_subscribe,
      canPublish: grant.can_publish,
      canPublishData: grant.can_publish_data,
    })

    return json({ token: await token.toJwt(), grant })
  } catch (err) {
    return json({ error: String(err) }, 400)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

Deploy it and give it the secrets:

```bash
supabase secrets set LIVEKIT_API_KEY=APIxxxxxxxxxxx
supabase secrets set LIVEKIT_API_SECRET=your-long-secret
supabase functions deploy venue-room-token
```

Test it before touching the frontend — a token endpoint that works is the whole
battle:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/venue-room-token \
  -H "Authorization: Bearer <a real user access token>" \
  -H "Content-Type: application/json" \
  -d '{"roomId":"<a room uuid>"}'
```

You want a long `token` string and a `grant` object back. Paste the token into
<https://jwt.io> and read it — it should name the room and the permissions you
expect. If `can_publish` is false when it should be true, the bug is in step 4,
not here.

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

Sketch of the connection, in a new `useLiveKitRoom` hook so `AvStage` stays a
presentation component:

```tsx
const { data } = useQuery({
  queryKey: ['livekit-token', room.id],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('venue-room-token', {
      body: { roomId: room.id },
    })
    if (error) throw error
    return data as { token: string; grant: { can_publish: boolean } }
  },
  // The token is 30 minutes; refresh at 25 so nobody is dropped mid-sentence.
  staleTime: 25 * 60 * 1000,
})

<LiveKitRoom
  serverUrl={import.meta.env.VITE_LIVEKIT_URL}
  token={data.token}
  connect={mode !== 'off'}
  video={data.grant.can_publish}
  audio={data.grant.can_publish}
>
  {/* the layout for `mode` */}
  <RoomAudioRenderer />
</LiveKitRoom>
```

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

## 8. Recording

`recording_enabled` is already stored per room and already drawn as a red dot in
`AvStage`'s header. To make it real you use LiveKit **Egress**: a server-side API
call that starts a recording of a room and writes the file to S3 or equivalent.

Three things to sort out before switching it on for a real event:

1. **Consent.** Everyone must see the notice *before* joining, not after. The red
   dot is not enough on its own — put the line in the join gate.
2. **Where the file goes.** Egress needs S3 (or GCS/Azure) credentials. These go
   in the same secrets store as the API key. Supabase Storage is not an Egress
   target, so a bucket will be needed either way.
3. **Who may watch it back.** That is a new table and new RLS, not a video
   problem. Do not start it until someone asks for it.

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

## The order to do it in

1. LiveKit Cloud account, copy the three values. *(10 min)*
2. Migration 099, and call it in the SQL editor until the answers look right. *(30 min)*
3. Edge function, and `curl` it until it returns a token. *(1 hour)*
4. `AvStage` for one mode only — `spotlight`, in one test room. *(2 hours)*
5. The other three modes, which are layout only. *(1 hour)*
6. Recording, if anyone actually needs it. *(later)*

Steps 2 and 3 are the ones worth being careful about. Everything after them is
swapping one box for another box the same size.
