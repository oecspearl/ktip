# KTIP Partner API — Verified Employers

A read-only feed of employers that OECS has verified and that have consented to
external sharing. Partner platforms **pull** from it on their own schedule; KTIP
never pushes.

Base URL: `https://<your-deployment>/api/partner/v1`

---

## Quick start

```bash
curl -H "Authorization: Bearer ktip_…" \
  "https://<deployment>/api/partner/v1/employers?limit=100"
```

```json
{
  "data": [ { … } ],
  "next_cursor": "MjAyNi0wNi0wMlQwOTozMDowMFp8NmYxYw",
  "has_more": true
}
```

Follow `next_cursor` until `has_more` is `false`, record the highest
`updated_at` you saw, then poll incrementally (see **Incremental sync**).

---

## Authentication

Every request carries a static API key:

```
Authorization: Bearer ktip_<12-char prefix>_<secret>
```

Keys are issued in KTIP under **Admin → Partner API**. The plaintext key is
displayed exactly once at issuance; only its SHA-256 is stored, so it cannot be
recovered afterwards — store it in your secrets manager immediately. If a key is
lost or exposed, revoke it and issue a new one.

Keys do not expire. Revocation takes effect on the next request.

One key per partner platform — a shared key cannot be revoked for one consumer
without cutting off the others.

**This is a server-to-server credential.** No CORS headers are sent; the key must
never be embedded in a browser, mobile app, or anything else a user can read.
Browser-side calls fail by design.

### Failure modes

Unknown key, wrong secret, revoked key, and missing scope all return the same
`401 {"error": "unauthorized"}`. This is deliberate — distinguishing them would
tell a prober which of their guesses corresponds to a real client. If you
believe your key is valid, contact OECS rather than retrying in a loop.

---

## GET /employers

```
GET /api/partner/v1/employers?updated_since=2026-07-01T00:00:00Z&limit=100
Authorization: Bearer ktip_…
```

### Query parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | 50 | Clamped to 1–200. |
| `updated_since` | ISO 8601 | — | Returns rows changed at or after this instant. Required when `include_removed=true`. |
| `cursor` | opaque | — | From the previous response's `next_cursor`. |
| `include_removed` | `true`/`false` | `false` | Include tombstones for employers that have left the feed. See **Incremental sync**. |

### Response

```json
{
  "data": [
    {
      "id": "6f1c…",
      "slug": "castries-tech-ltd",
      "legal_name": "Castries Tech Limited",
      "trading_name": "CasTech",
      "industry": "ICT & Digital Services",
      "website_url": "https://castries.tech",
      "logo_url": "https://…/logo.png",
      "description": "Software house.",
      "address": {
        "country": { "code": "LC", "name": "Saint Lucia" },
        "administrative_area": "Castries",
        "locality": "Castries",
        "line1": "12 Bridge Street",
        "line2": null,
        "postal_code": "LC04 101"
      },
      "contact_email": "hr@castries.tech",
      "contact_email_verified": true,
      "verification": {
        "status": "verified",
        "method": "document_review",
        "verified_at": "2026-06-02T09:30:00Z",
        "registration_number": "LC-2019-004412",
        "evidence_document_count": 2
      },
      "created_at": "2026-05-01T00:00:00Z",
      "updated_at": "2026-06-02T09:30:00Z"
    }
  ],
  "next_cursor": "MjAyNi0wNi0wMlQwOTozMDowMFp8NmYxYw",
  "has_more": true
}
```

### Field notes

- **`id`** is the stable key — store it and join on it. `slug` is human-readable
  and also stable, but `id` is what you should match on.
- Any field can be `null` except `id`, `slug`, `legal_name`,
  `address.country.code`, `created_at` and `updated_at` — render defensively.
- **`address`** is a hierarchy: `country` is an ISO 3166-1 alpha-2 code from a
  controlled list, and everything below it narrows from there. Every field below
  `country` may be `null`.
- **`contact_email`** is `null` unless `contact_email_verified` is `true`. An
  unconfirmed address is a string somebody typed; KTIP does not forward it. Do
  not display or mail an address you did not receive.
- **`verification.method`** is one of `document_review`, `registry_lookup`,
  `manual_attestation` — how OECS checked this employer.
- **`evidence_document_count`** is how many supporting documents OECS holds. The
  documents themselves live in a private bucket and are never exposed, in any
  form, including signed URLs.
- **`verification.status`** in `data` is always `verified`. The field exists so
  the shape stays stable if additional statuses become shareable.

### Never sent

Internal reviewer notes, document paths or URLs, the identity of the OECS staff
member who verified the record, the employer's phone number, the internal
sharing flag, and any member/profile data. This is enforced by an explicit
allowlist in [src/lib/partner-payload.ts](../src/lib/partner-payload.ts) — a new
column added to the database is excluded by default.

---

## Pagination

Cursor-based over `(updated_at, id)`. Follow `next_cursor` until `has_more` is
`false`:

```
GET /employers?limit=100
GET /employers?limit=100&cursor=<next_cursor>
```

`updated_at` alone is not unique, so cursors are not plain timestamps. Treat the
cursor as opaque and pass it back verbatim.

---

## Incremental sync and deletions

For a first sync, page through with no `updated_since`. Record the highest
`updated_at` you saw.

For every sync after that, poll with **both** parameters:

```
GET /employers?updated_since=<last sync>&include_removed=true
```

Without `include_removed=true` you will never learn that an employer was
revoked. A revoked row simply stops matching the filter, so it is never
mentioned again and your copy would keep it under a verification KTIP has
withdrawn.

Tombstones look like this and carry no employer data:

```json
{ "id": "6f1c…", "slug": "castries-tech-ltd", "removed": true, "updated_at": "2026-07-01T00:00:00Z" }
```

On receiving one, delete or hide your copy. Records and tombstones are
interleaved in the same `data` array in `updated_at` order — branch on the
`removed` field.

An employer leaves the feed when OECS revokes or rejects its verification, or
when it withdraws consent to external sharing. The two are not distinguished:
in both cases you are no longer authorised to display the record.

Recommended cadence: once or twice a day. There is no benefit to polling faster.

---

## Rate limits

600 requests per hour per key. Over the limit:

```
429 {"error": "rate_limited", "retry_after": 1832}
```

`retry_after` is in seconds. With `limit=200`, this is enough for 120,000
records an hour — far more than a change-feed needs. Poll on a schedule rather
than continuously.

---

## Status codes

| Code | Body | Meaning / what to do |
|---|---|---|
| 200 | `{data, next_cursor, has_more}` | Success. |
| 400 | `{"error": "invalid_cursor"}` | Cursor not recognised — restart the sync from the beginning. |
| 400 | `{"error": "invalid_updated_since"}` | Not a parseable ISO 8601 timestamp. |
| 400 | `{"error": "include_removed_requires_updated_since"}` | Tombstones need a window — add `updated_since`. |
| 401 | `{"error": "unauthorized"}` | Missing, malformed, unknown, revoked or out-of-scope key. Check the header; contact OECS. |
| 405 | `{"error": "Method not allowed"}` | Only GET is supported. |
| 429 | `{"error": "rate_limited", "retry_after": n}` | Back off for `retry_after` seconds. |
| 500 | `{"error": "server_error"}` | Transient — retry with exponential backoff. |
| 503 | `{"error": "Server configuration error"}` | Deployment misconfigured; contact OECS. |

---

## Terms of use (for partners)

- Display employer data only while it is present in the feed. Honour tombstones
  promptly.
- `contact_email` is personal data. Use it for the purpose agreed with OECS and
  nothing else — no resale, no bulk marketing, no onward sharing.
- Do not present KTIP verification as your own. If you show a verified badge,
  attribute it to OECS.
- `registration_number` comes from public business registries and may be
  displayed.
- Every request you make is logged against your key.

Questions, key rotation, or a suspected leak: contact your OECS representative.

---

## Auditing

Every request is recorded in `api_access_log` with the calling key, endpoint,
status, record count and source IP. OECS can answer "which partner received this
employer's details, and when" from that table.

---

## For KTIP administrators

**Getting an employer into the feed** takes two separate, deliberate steps:

1. **Verify it** — Admin → Employers → shield icon. Record the method and, where
   available, the business registration number. The reviewer, timestamp and note
   are written to an audit trail that cannot be edited afterwards.
2. **Share it** — the globe icon. Verification is not consent; this second toggle
   is what actually publishes the record. It is disabled until the employer is
   verified, and it is switched off automatically whenever verification is lost.

**To withdraw an employer**, revoke its verification or turn off sharing. Prefer
either over deleting the row: deletion removes the audit history, and partners
polling with `include_removed=true` are still told about a revocation.

Relevant code:

| Concern | File |
|---|---|
| Endpoint | [api/partner/v1/employers.ts](../api/partner/v1/employers.ts) |
| Payload allowlist | [src/lib/partner-payload.ts](../src/lib/partner-payload.ts) |
| Key issuance / revocation | [api/admin/api-clients.ts](../api/admin/api-clients.ts) |
| Schema, RLS, verification RPC | [supabase/migrations/058_employers.sql](../supabase/migrations/058_employers.sql) |
| API clients, access log, auth RPC | [supabase/migrations/059_partner_api.sql](../supabase/migrations/059_partner_api.sql) |

No new environment variables are required; the endpoint reuses
`VITE_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
