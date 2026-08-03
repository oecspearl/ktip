# Finish the setup — multilingual hackathon rooms

Everything in this guide is already built and deployed. What is left is
**accounts and environment variables**. Work down it in order and tick things off.

**If you do none of this, nothing breaks.** Translation falls back to showing text
in the language it was written in, venue rooms draw the placeholder tiles they
always have, and no error appears anywhere. Each section below turns one thing on,
independently of the others.

Where the values go:

| | Where |
|---|---|
| **Production** | Vercel → your project → Settings → Environment Variables |
| **Local dev** | a `.env` file in the project root (already gitignored) |

Local `/api/*` routes only exist under `vercel dev`, not `npm run dev` — same as
`/api/ai-chat` today. `vite.config.ts` copies `.env` values into `process.env` so
dev behaves like production.

---

## Step 1 — Apply the two migrations

**Required for everything else.** Neither is optional and both are idempotent, so
re-running is safe.

- [ ] Run `supabase/migrations/100_multilingual_content.sql`
- [ ] Run `supabase/migrations/101_venue_room_grant.sql`

Supabase dashboard → SQL Editor → paste → Run. Or `supabase db push`.

**What they add**

| Migration | Adds |
|---|---|
| 100 | `venue_room_messages.lang`, `profiles.content_language`, `profiles.auto_translate` |
| 101 | `venue_room_grant()` — the function that decides who may speak in a room |

### Verify 101 before moving on

Every video rule runs through this one function, so a wrong answer here is a wrong
answer everywhere. In the SQL editor:

```sql
select venue_room_grant('<paste a real venue_rooms.id uuid>');
```

- [ ] You get a JSON object back containing `can_publish`, `is_host`, `audio_mode`

An **error** is also a correct result — `not a member of this venue` or
`this room is closed` means the rules are firing. What you must not see is
`function venue_room_grant(uuid) does not exist`.

> Grab a room UUID with:
> `select id, name from venue_rooms limit 5;`

---

## Step 2 — Translation (OpenRouter)

Turns on French and Spanish for everything members write: room chat,
announcements, room panels, event and hackathon copy.

- [ ] Create a key at <https://openrouter.ai/keys>
- [ ] Add credit to the account (translation is pay-as-you-go)
- [ ] Check the model slug and price at <https://openrouter.ai/models>
- [ ] Set the three variables below

```bash
TRANSLATION_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_TRANSLATE_MODEL=openai/gpt-4o-mini
```

Optional, and only affects how spend is labelled on the OpenRouter dashboard:

```bash
OPENROUTER_SITE_URL=https://your-domain
OPENROUTER_APP_NAME=KTIP
```

**About the model.** `openai/gpt-4o-mini` is a starting suggestion, not a
verified-current recommendation — check the pricing page yourself. Any cheap,
fast model with structured-output support works. It is read from the environment
on every request, so **changing it needs no deploy**. Translation is not a
reasoning task; do not pay for a frontier model here.

**Cost, roughly.** A chat message translated into two languages is a fraction of
a cent, and each distinct string is paid for **once** — the result is cached in
Postgres and every later reader is free. A busy hackathon day is small change.

**To turn it off again** without deleting keys: `TRANSLATION_PROVIDER=none`.
Azure also still works (`TRANSLATION_PROVIDER=azure` plus `AZURE_TRANSLATOR_KEY`)
if you would rather use its free 2M-character tier.

### Verify

- [ ] Two accounts in one venue room, one set to French in Settings → Language
- [ ] Each types a message; each reads the other in their own language
- [ ] The **Translated from … · Show original** link reveals what was actually typed

---

## Step 3 — Video (LiveKit)

Turns the venue room placeholder tiles into a real call with screen sharing.

- [ ] Sign up at <https://cloud.livekit.io>
- [ ] Create a project — call it something like `ktip-venue`
- [ ] Copy the three values from the project page
- [ ] Set them

```bash
VITE_LIVEKIT_URL=wss://ktip-venue-xxxx.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxx
LIVEKIT_API_SECRET=<long random string>
```

> ### ⚠️ Never prefix the key or secret with `VITE_`
>
> Anything named `VITE_*` is compiled into the JavaScript **every visitor
> downloads**. With that secret, anyone who opens devtools could mint a token for
> any room in your venue. The **URL** is fine and must stay `VITE_` — the browser
> has to dial it.

### Watch the bandwidth, not the minutes

Free tier is 5,000 participant-minutes, 50 GB downstream, 100 concurrent
connections. **The 50 GB is what runs out first.**

| Session | Minutes used | Downstream (rough) |
|---|---|---|
| 20 people, cameras on, 1 hr | 1,200 of 5,000 | ~45–50 GB — the whole month |
| 20 people, audio only, 1 hr | 1,200 | ~7 GB |
| 8 people, cameras, 1 hr | 480 | ~8 GB |

Estimates, not quotes — downstream scales with subscribers × publishers.

Three levers, all already in the venue builder:

- **Camera mode `huddle`** — audio only. Roughly 7× cheaper. Use it for team
  rooms and mentor corners where nobody needs to see a face.
- **Camera mode `off`** — no connection is opened at all, so it costs nothing.
- **`max_publishers`** (default 12) — caps how many people may switch a camera on.

A full-day 20-person all-cameras hackathon will exceed the free tier. That is the
**Ship** plan at $50/month (150,000 minutes, 250 GB). Current numbers:
<https://livekit.com/pricing>.

### Verify

- [ ] Two browser profiles, two different members, same venue room
- [ ] Both see each other's tile
- [ ] Set the room to **listen-only** in the venue builder and rejoin — the
      participant's camera button is gone, the host's is not
- [ ] Set camera mode to **No video**, open the network tab — **no** LiveKit
      connection is opened

---

## Step 4 — Recording (optional)

Skip this entirely if no session needs to be watchable afterwards.

Supabase Storage cannot receive LiveKit recordings, so you need an S3-compatible
bucket. **Cloudflare R2** is the cheapest sensible choice because it charges no
egress fees. AWS S3 and Backblaze B2 work identically.

- [ ] Create a bucket (e.g. `ktip-recordings`)
- [ ] Create an API token with read/write on that bucket
- [ ] Set the variables
- [ ] Confirm the bucket is **not public**

```bash
RECORDING_S3_BUCKET=ktip-recordings
RECORDING_S3_ACCESS_KEY=...
RECORDING_S3_SECRET=...
RECORDING_S3_REGION=auto
RECORDING_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

`RECORDING_S3_REGION=auto` suits R2. For AWS S3 use the real region
(`us-east-1`) and **leave `RECORDING_S3_ENDPOINT` blank** — setting it also turns
on path-style addressing, which AWS does not want and R2/B2/MinIO do.

LiveKit writes the file straight to your bucket; the video never passes through
this app. Files land at `venue/<room-uuid>/<timestamp>.mp4`.

> ### ⚠️ Two things to know before recording a real session
>
> **Do not make the bucket public.** Who may watch a recording back is a table and
> RLS policy that do not exist yet. Right now, access is whatever your bucket
> policy says and nothing else.
>
> **Check your obligations.** Participants see a consent notice and must accept
> before anything of theirs is published — but consent is not the only rule that
> may apply to recording minors or across jurisdictions. That is your call, not
> the software's.

### How it behaves

- Recording only appears in rooms where **recording enabled** is ticked in the
  venue builder, and only for **hosts**. Both are enforced server-side.
- A participant in such a room sees a notice **before** joining and can stay in
  the room, read chat and take part **without** joining the call.
- The header dot is grey and reads *"Can be recorded"* until a host actually
  presses Record, when it goes red and pulses.

### Verify

- [ ] Tick **recording enabled** on a test room in the venue builder
- [ ] Join as a participant — you get the consent notice **before** any camera
      light comes on
- [ ] Join as a host, press **Record this room**, speak, press **Stop recording**
- [ ] The `.mp4` appears in your bucket under `venue/<room-uuid>/`

---

## Step 5 — Captions (nothing to configure)

Live translated captions need **no account and no key**. They work as soon as
Step 3 is done, and they reuse the translation from Step 2.

Anyone in a call presses **Caption my speech**. Their browser transcribes their
own microphone; everyone else reads them in their own language.

- [ ] In a call, press **Caption my speech** and talk
- [ ] The other browser shows your words in its own language

**Browser support is the one real limit.** Chrome, Edge and Safari have speech
recognition. **Firefox does not** — the button is disabled there with a reason
rather than silently doing nothing.

Nothing is stored. Captions never enter the translation cache and disappear from
screen after about 45 seconds.

---

## Troubleshooting

| What you see | What it means | Where to look |
|---|---|---|
| **503** from any `/api/venue/*` | An environment variable is missing | Vercel env vars; redeploy after adding |
| `Recording storage is not configured` | LiveKit is set up, the bucket is not | Step 4 |
| **403** with a sentence like *"this room is closed"* | Working as designed — that is the room's real rule | The venue builder, not the code |
| `function venue_room_grant(uuid) does not exist` | Migration 101 was not applied | Step 1 |
| Video never connects, no error | `VITE_LIVEKIT_URL` missing or not `wss://` | Step 3 |
| Text stays in one language | No translation key, or both members share a language | Step 2; check Settings → Language |
| Captions button greyed out | Firefox, or an insecure origin | Use Chrome/Edge/Safari over HTTPS |
| Camera button does nothing | Room is `listen-only` or `max_publishers` is reached | The venue builder |

**A `403` is usually not a bug.** The message is passed through from the database
and is the actual rule that fired.

---

## What is deliberately not done yet

Worth knowing so nobody goes looking for it:

- **Watch-back for recordings.** Files are in your bucket; there is no in-app
  library, and no rules yet about who may view one.
- **Captions for people who have not switched captioning on.** Each speaker
  transcribes their own microphone, so a participant who never presses the button
  is not captioned.
- **Firefox captions.** No speech recognition in that browser. The recogniser is
  written as a swappable piece if this ever needs a paid service (~$0.18/hour)
  to cover it.
- **Translation of direct messages.** The private path exists and is wired, but
  DMs are not switched on to use it.

---

## One open question for whoever owns safeguarding

Room chat translations are cached in the shared `translations` table. That is
defensible — the table is service-key only, rooms are RLS-gated, and
`venue_room_messages` cannot express a 1:1 conversation by construction — and it
is what makes the second reader of a message free.

But migration 097 keeps an explicit list of what must never be written there
(direct messages, grievances, grant data, resumes), and member-written chat is a
judgement call rather than an obvious yes. Someone who owns migration 064's
student safeguarding model should confirm it before a real event with minors.

If the answer is no, it is a one-argument change per surface — pass
`store: false` — and the only cost is that each reader pays for the translation
again.
