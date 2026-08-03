# TODO — manual steps

Things that cannot be done from the codebase — Supabase dashboard access,
third-party accounts, or a human decision. Detailed instructions stay in their
own docs; this file is the index of what is still open.

---

## Open items pointed at from other docs

### Venue rooms — accounts and env vars ([FINISH-SETUP.md](FINISH-SETUP.md))

All code shipped; inert until configured. Independent switches, safe to do in
any order:

- [ ] Apply migrations `100_multilingual_content.sql` and `101_venue_room_grant.sql` (required for the rest)
- [ ] OpenRouter API key → translation on
- [ ] LiveKit account + `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `VITE_LIVEKIT_URL` → video on ([VIDEO-SETUP.md](VIDEO-SETUP.md) — **nobody has an account yet**)
- [ ] Recording bucket (optional)

### Safeguarding decision — room-chat translation cache ([FINISH-SETUP.md](FINISH-SETUP.md), last section)

Room chat translations are cached in the shared `translations` table. Migration
097 lists what must never be written there; member-written chat is a judgement
call. **Whoever owns the migration 064 safeguarding model must confirm this
before a real event with minors.** If no: pass `store: false` per surface.

### Virtual Campus SSO ([VC-SSO-SETUP.md](VC-SSO-SETUP.md))

- [ ] Set the `VC_*` / `COMMONS_*` env vars in Vercel (unset = safe off state)
- [ ] Obtain `VC_CLIENT_SECRET` and `COMMONS_API_KEY` from the campus team, plus client registration — §2 lists the exact asks, including the `email_verified` claim that will bite if skipped

### Sentry (optional — [MONITORING.md](MONITORING.md))

- [ ] Create Sentry project, set DSNs + env vars, configure the two alerts. Use an **internal integration** token, not the `sntrys_` wizard token (read calls all 403)

### Privacy & Terms — before launch ([PRIVACY-AND-TERMS.md](PRIVACY-AND-TERMS.md), implementation checklist)

Draft only. Blocking publication: counsel review per member state, every
`[BRACKET]` placeholder, data-protection contact, `/privacy` + `/terms` routes
linked from footer and sign-up, consent checkbox recording acceptance,
guardian-consent path for minors.

### Automation gaps ([TESTING.md](TESTING.md) §20)

- [ ] No CI — GitHub Actions running `tsc -b`, `vitest run`, `vite build` on every PR
- [ ] No E2E — Playwright over the critical paths in §21

---

## Secondary email addresses (migration 056)

The feature is fully implemented in code but is **inert until steps 1–2 are
done**. Step 3 is a security check that has never been run.

### 1. Apply migration 056

Run [`supabase/migrations/056_email_aliases.sql`](../supabase/migrations/056_email_aliases.sql)
in the Supabase SQL editor.

Creates `user_email_aliases`, `auth_rate_limits`, and three service-role-only
functions (`consume_auth_rate_limit`, `resolve_email_alias`,
`verify_email_alias`). Idempotent — safe to re-run.

**If `REFERENCES auth.users(id)` is rejected** (the runner may lack rights on
the `auth` schema), swap that one line to:

```sql
user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
```

`profiles.id` already cascades from `auth.users`, and `api/delete-account.ts`
deletes the profile row before the auth user, so the cascade still fires. The
fallback is noted in the migration header too.

Confirm afterwards that both tables show **RLS enabled**, that
`user_email_aliases` has exactly two policies (SELECT + DELETE, both owner-only),
and that `auth_rate_limits` has **zero** policies.

### 2. Allow the reset-password redirect

Dashboard → Authentication → URL Configuration → **Redirect URLs**: add

```
https://<your-domain>/reset-password
```

`api/auth/reset-alias.ts` calls `admin.auth.admin.generateLink({ type: 'recovery',
options: { redirectTo: `${origin}/reset-password` } })`. If that URL is not
allow-listed, GoTrue **silently** falls back to the project Site URL — no error,
the mail still sends, and the recovery link just lands on the wrong page.

Add the `vercel dev` origin too if you want to test locally.

### 3. Run the privilege check — NEVER YET RUN

`resolve_email_alias` is an email-enumeration oracle that also discloses the
primary address. It must be reachable only by the service role. Verify in the
SQL editor:

```sql
SET ROLE anon;
SELECT * FROM user_email_aliases;               -- expect 0 rows
SELECT resolve_email_alias('a@b.com');          -- expect: permission denied
SELECT consume_auth_rate_limit('t', 60, 1);     -- expect: permission denied
SELECT verify_email_alias('x');                 -- expect: permission denied
RESET ROLE;
```

Repeat verbatim with `SET ROLE authenticated;`. **All four must fail under both
roles.** If any of them returns data, stop and fix the GRANTs before letting the
feature reach production.

---

## Also worth doing

### Two things verified only by reading, not by running

- **`auth.user.identities` population.** The OAuth-only caveat in the Secondary
  Email card keys off `identities.some(i => i.provider === 'email')`. If that
  array is empty for password users on this project, the note shows when it
  should not. Cosmetic — check against a real user in Dashboard →
  Authentication → Users.
- **The 700 ms timing floor** in `api/auth/login-alias.ts` was chosen against
  estimated latency, not measured. It exists so an attacker cannot tell "no such
  alias" from "wrong password" by response time. Measure p99 on the real
  deployment; if any path exceeds the floor, the padding stops equalising and
  the defence quietly weakens.

### Standing risk (no action, just don't undo it)

`api/auth/login-alias.ts` is an unauthenticated password-verification oracle.
Its requests reach GoTrue from Vercel's egress IPs, so GoTrue's own per-IP
limiter sees a single shared client and provides no protection. **The
`auth_rate_limits` DB limiter in that file is the only limiter on that route.**
Do not remove it.

---

## Pre-existing, unrelated to the above

`src/lib/validation.test.ts > signupSchema > accepts valid signup data` fails on
`main`. The test uses `password123` but `PASSWORD_REQUIREMENTS` was tightened to
8+ chars with a digit, a symbol and mixed case. Fix is one line in the test —
left alone so far because it is outside the scope of recent work.
