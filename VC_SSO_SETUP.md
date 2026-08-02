# Virtual Campus SSO — remaining setup

Everything in the "endpoint build" brief is implemented in this repo. What is left is
configuration on the KTIP side and a handful of things only the Virtual Campus team can
do. This file is the checklist for both.

Code involved, for reference:

| Piece | File |
|---|---|
| Callback endpoint (`vc_token` handoff **and** code flow) | [api/auth/vc/callback.ts](api/auth/vc/callback.ts) |
| Token verification, claim mapping, `vc:credentials` / `vc:skills` parsing | [api/_lib/vc-oidc.ts](api/_lib/vc-oidc.ts) |
| KTIP-initiated sign-in ("Sign in with OECS Virtual Campus" on /login) | [api/auth/vc/start.ts](api/auth/vc/start.ts) |
| Session handover (one-time ticket → Supabase session) | [api/auth/vc/session.ts](api/auth/vc/session.ts), [src/pages/auth/VcLandingPage.tsx](src/pages/auth/VcLandingPage.tsx) |
| CV generation and merge policy | [api/_lib/cv-build.ts](api/_lib/cv-build.ts) |
| Course history fetch | [api/_lib/vc-catalog.ts](api/_lib/vc-catalog.ts) |
| URL rewrites (`/auth/vc/callback` → the function) | [vercel.json](vercel.json) |

---

## 1. KTIP side — what you do

### 1.1 Environment variables

Set in Vercel for **Production** and **Preview**. Never prefix any of these with `VITE_`;
that would ship them to the browser. Template: [.env.example](.env.example) lines 95–130.

| Variable | Value | Required for |
|---|---|---|
| `VC_ISSUER` | `https://oecscampus.org` (no trailing slash) | both flows |
| `VC_JWKS_URL` | `https://oecscampus.org/api/auth/oidc/jwks` | both flows |
| `VC_CLIENT_ID` | `ktip-production` — must equal the token's `aud` | both flows |
| `VC_CLIENT_SECRET` | issued by the campus | code flow only (the `/login` button) |
| `VC_AUTHORIZE_URL` / `VC_TOKEN_URL` / `VC_USERINFO_URL` | leave unset | derived from `VC_ISSUER` |
| `COMMONS_BASE_URLS` | `https://commons.oecscampus.org,https://oecscampus.org` | course section of the CV |
| `COMMONS_API_KEY` | issued by the campus | course section of the CV |
| `VITE_SUPABASE_URL` | your Supabase project URL | already set if the app runs |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | service role key | account creation, session minting |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) | anon key | session minting |

Notes:

- With `VC_ISSUER` / `VC_JWKS_URL` / `VC_CLIENT_ID` unset, both routes redirect to
  `/login?vc_error=not_configured` and nothing else in the app changes. That is the safe
  "off" state.
- `VC_CLIENT_SECRET` is **not** needed for the `?vc_token=` handoff — that token is
  verified against the public JWKS. It is only used to exchange an authorization code.
- `COMMONS_API_KEY` reads any learner's enrollments by email. It is a platform-wide
  credential; server-side only. Missing it costs the learner the Courses section, not the
  sign-in.

### 1.2 Database migrations

Apply these to the Supabase project, in order, if they are not already applied:

| Migration | Provides |
|---|---|
| [056_email_aliases.sql](supabase/migrations/056_email_aliases.sql) | `consume_auth_rate_limit()` — the callback calls it before any lookup |
| [068_vc_sso.sql](supabase/migrations/068_vc_sso.sql) | `vc_identities`, `vc_replay_guard`, `vc_handoff_tickets`, `vc_claim_jti()`, `vc_claim_handoff_ticket()`, `vc_resolve_user_by_email()`, `vc_provision_identity()`, `vc_my_identity()` |
| [069_resumes.sql](supabase/migrations/069_resumes.sql) | `resumes` table and the `sources` provenance column |
| [078_resume_design.sql](supabase/migrations/078_resume_design.sql) | `resumes.design` |
| [082_profile_contact_fields.sql](supabase/migrations/082_profile_contact_fields.sql) | `profiles.phone`, `profiles.website` (optional — the callback probes for these and degrades if absent) |

Verify with:

```sql
select proname from pg_proc
where proname in (
  'consume_auth_rate_limit','vc_claim_jti','vc_claim_handoff_ticket',
  'vc_resolve_user_by_email','vc_provision_identity','vc_my_identity'
);

select table_name from information_schema.tables
where table_name in ('vc_identities','vc_replay_guard','vc_handoff_tickets','resumes');
```

No new migration is needed for the credentials/skills work — `resumes.data` is JSONB and
`profiles.skills` has existed since 014.

### 1.3 Deploy

The rewrite `/auth/vc/callback` → `/api/auth/vc/callback` lives in
[vercel.json](vercel.json) and sits **above** the SPA catch-all. If it moves below it,
`index.html` swallows the callback and every sign-in silently fails. Deploy from this
repo so the rewrite is live before the campus points learners at the URL.

### 1.4 Smoke test

1. Ask the campus for a test learner and a freshly minted `vc_token`.
2. Open `https://oecsinnovation.org/auth/vc/callback?vc_token=<jwt>` in a clean browser
   profile. Expect: redirect to `/auth/vc/land?t=…`, then the dashboard, signed in.
3. Check `/cv` — Certificates and Skills sections should be populated from the token,
   Courses from the Commons API.
4. Reload the same callback URL. Expect `/login?vc_error=token_replayed` — the token is
   single-use.
5. Repeat with an existing KTIP account on the same email. Expect the account to be
   linked, not duplicated, and existing CV edits to survive.

Failures land on `/login?vc_error=<code>`. Codes:

| Code | Meaning |
|---|---|
| `not_configured` | one of `VC_ISSUER` / `VC_JWKS_URL` / `VC_CLIENT_ID` / Supabase keys is missing |
| `provider_error` | the campus redirected back with its own `?error=` |
| `rate_limited` | 20 attempts / 15 min or 200 / day from one IP |
| `missing_token` / `missing_state` / `unknown_state` | no `vc_token` and no usable `code`+`state` |
| `invalid_signature` | bad signature, wrong `iss`/`aud`, expired, or `alg` not ES256 |
| `email_unverified` | the token did not carry `email_verified: true` — see §2.3 |
| `no_email` / `no_subject` / `malformed` | required claim missing or the token is over 8 KB |
| `token_replayed` | this `jti` (or token) was already redeemed |
| `subject_bound_elsewhere` | this campus `sub` is already linked to a different KTIP user |
| `account_suspended` | the KTIP account is suspended |
| `provisioning_failed` / `link_failed` / `session_failed` / `ticket_failed` | server-side; check the function logs |
| `code_exchange_failed` | the token endpoint rejected the code (code flow only) |

Server logs record the code only — never the token, claims, or email.

---

## 2. Virtual Campus side — what to ask the other team for

### 2.1 Client registration

- `client_id`: **`ktip-production`** (must match `VC_CLIENT_ID` and the token's `aud`)
- Registered redirect URI: **`https://oecsinnovation.org/auth/vc/callback`**
- If you want a staging environment, register a second client and redirect URI for it —
  the audience check means one client cannot serve both.
- `client_secret`: needed only if KTIP-initiated sign-in (the `/login` button) is in
  scope. Ask whether the client is confidential or public.

### 2.2 Token requirements KTIP enforces

| Requirement | Enforced in |
|---|---|
| Signature `ES256` only — no `alg` negotiation, no RSA fallback | [vc-oidc.ts:104](api/_lib/vc-oidc.ts#L104) |
| `iss` exactly `https://oecscampus.org` | same |
| `aud` exactly `ktip-production` | same |
| Redeemed within 10 minutes of `iat` (60 s clock tolerance) — the brief's 5-minute lifetime is well inside this | same |
| Token under 8 KB | [vc-oidc.ts:97](api/_lib/vc-oidc.ts#L97) |
| `sub` present | [vc-oidc.ts:112](api/_lib/vc-oidc.ts#L112) |

Requests: keep serving the JWKS at a stable URL with a `kid` on every key (currently
`vc-oidc-1`) so rotation is transparent. KTIP caches the key set for 10 minutes and
refetches on an unknown `kid`, with a 30-second cooldown.

### 2.3 `email_verified` — the one that will bite

**KTIP rejects any token without `email_verified: true`.** This is not in the brief's
claim list, so confirm the campus sends it.

The reason is not pedantry: the callback links a token to an existing KTIP account **by
email address**. Without that flag, anyone who can register an address on the Virtual
Campus inherits the KTIP account already using it. There is no way to relax this — a
token without it fails with `email_unverified`.

### 2.4 Claims KTIP reads

Standard claims — each is matched against a list of spellings
([vc-oidc.ts:160](api/_lib/vc-oidc.ts#L160)), so `full_name`, `given_name`+`family_name`,
`avatar_url` etc. all work:

`sub`, `email`, `email_verified`, `name`, `picture`, `phone_number`, `country` (or
`address.country`), `locale`, `institution`, `program`, `grade_level`, `role`/`roles`,
`birthdate` (year only is kept), `website`.

Namespaced claims, read by exact name:

```jsonc
"vc:credentials": [
  {
    "title": "Climate Data Foundations",   // required — entries without it are dropped
    "verification_code": "VC-8842-KQ",     // optional
    "issued_at": "2026-03-04",             // must start YYYY-MM-DD or it is ignored
    "verified": true,                      // must be literal true; anything else reads as false
    "verify_url": "https://oecscampus.org/verify/VC-8842-KQ"  // must be absolute http(s)
  }
],
"vc:skills": [
  {
    "name": "Data Analysis",               // required
    "category": "Digital",                 // optional — becomes the CV skill group
    "level": "Intermediate",               // optional
    "verified": true,
    "source": "course:abc123"              // optional
  }
]
```

Caps: 50 credentials, 100 skills, 200 characters per field. Bare strings are accepted in
`vc:skills` (`["Excel", "Public Speaking"]`). Duplicates are removed case-insensitively.

### 2.5 Questions to put to the campus team

1. **Are `vc:credentials` / `vc:skills` gated behind a scope?** The code flow currently
   requests `openid profile email` ([start.ts:122](api/auth/vc/start.ts#L122)). If the
   campus requires something like `vc:credentials vc:skills`, that is a one-line change —
   but we need to know the scope names. The `?vc_token=` handoff is unaffected; the
   campus decides what to put in it.
2. **Does the handoff token include a `jti`?** KTIP falls back to hashing the whole token
   for replay protection, which works, but a `jti` is cheaper and survives any re-encoding.
3. **`institution_id` is currently dropped.** The brief sends it; KTIP stores it in
   `vc_identities.raw_claims` but has no mapping from campus institution UUIDs to KTIP
   institution rows, so nothing joins on it. If institution-level features are wanted
   (rosters, per-institution dashboards), we need either a mapping table or the campus to
   send a stable slug/name we can match on.
4. **Commons API key** for enrollments — who issues it, and does one key cover both
   `commons.oecscampus.org` and `oecscampus.org`?
5. **Staging**: is there a non-production campus environment we can point a preview
   deployment at? If not, all testing happens against production tokens.
6. **Key rotation**: how much notice before the signing key changes, and will the old key
   stay in the JWKS during overlap?

---

## 3. Behaviour worth knowing before you test

- **Nothing the learner has written is overwritten.** The CV merge is per-section with a
  provenance stamp: `manual` > `vc` > `ktip`. A hand-edited section survives every sync;
  a section the campus owns is refreshed. A member who deletes a certificate does not get
  it back on the next sign-in.
- **`profiles.skills` is only seeded when empty**, for the same reason.
- **Campus certificates land in a `credentials` section, not `awards`.** `awards` belongs
  to KTIP badges. Keeping them apart is what stops the two generators erasing each other.
- **A CV never blocks a sign-in.** A campus outage, a missing `COMMONS_API_KEY`, or a
  malformed enrollment payload costs the learner a course list, not access.
- **Existing rows repair themselves.** A `resumes` row written before the `credentials`
  section existed reads back with `credentials: []` rather than crashing the page.
