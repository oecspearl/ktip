# KTIP Verified Employers API — Quick Start

A read-only feed of employers that OECS has verified and that have agreed to be
listed on partner platforms. You pull from it on your own schedule; KTIP never
pushes to you.

**Base URL:** `https://<deployment>/api/partner/v1`

---

## 1. Your key

OECS issues you one API key. It is shown once and cannot be recovered — store it
in your secrets manager immediately.

Send it on every request:

```
Authorization: Bearer ktip_<prefix>_<secret>
```

This is a **server-to-server credential**. Never put it in a browser, a mobile
app, or anything else an end user can read. No CORS headers are sent, so
browser-side calls will fail by design.

Keys do not expire. If one leaks, tell OECS and it will be revoked — revocation
takes effect on the very next request.

---

## 2. First call

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

Follow `next_cursor` until `has_more` is `false`:

```
GET /employers?limit=100&cursor=<next_cursor>
```

Treat the cursor as opaque — pass it back exactly as received.

---

## 3. What an employer looks like

```json
{
  "id": "6f1c…",
  "slug": "castries-tech-limited",
  "legal_name": "Castries Tech Limited",
  "trading_name": "CasTech",
  "industry": "ICT & Digital Services",
  "website_url": "https://castriestech.example",
  "logo_url": null,
  "description": "Software development house…",
  "address": {
    "country": { "code": "LC", "name": "Saint Lucia" },
    "administrative_area": "Castries",
    "locality": "Castries",
    "line1": "12 Bridge Street",
    "line2": null,
    "postal_code": "LC04 101"
  },
  "contact_email": "careers@castriestech.example",
  "contact_email_verified": true,
  "verification": {
    "status": "verified",
    "method": "registry_lookup",
    "verified_at": "2026-05-12T09:30:00Z",
    "registration_number": "LC-2019-004412",
    "evidence_document_count": 1
  },
  "created_at": "2026-05-01T00:00:00Z",
  "updated_at": "2026-05-12T09:30:00Z"
}
```

Notes:

- `id` is the stable key. Store it and match on it. `slug` is human-readable and
  also stable, but `id` is what you should join on.
- **`address` is a hierarchy.** `country.code` is ISO 3166-1 alpha-2 from a
  controlled list. Every field below `country` may be `null` — render
  defensively.
- **`contact_email` is `null` unless `contact_email_verified` is `true`.** KTIP
  only forwards an address once the employer has confirmed it. Do not display or
  mail an address you did not receive.
- `verification.method` is how OECS checked the employer:
  `registry_lookup`, `document_review`, or `manual_attestation`.
- `evidence_document_count` is how many supporting documents OECS holds. The
  documents are not available through this API in any form.
- Any field can be `null` except `id`, `slug`, `legal_name`, `address.country.code`,
  `created_at` and `updated_at`.

---

## 4. Staying in sync

After your first full pull, record the highest `updated_at` you saw. On every
later sync, pass **both** parameters:

```
GET /employers?updated_since=2026-07-01T00:00:00Z&include_removed=true
```

`include_removed=true` is not optional for incremental sync. Without it you will
never learn that an employer was removed — it simply stops appearing, and your
copy would keep showing it as verified after OECS has withdrawn that.

Removed employers arrive as tombstones in the same `data` array:

```json
{ "id": "6f1c…", "slug": "castries-tech-limited", "removed": true, "updated_at": "2026-07-01T00:00:00Z" }
```

Branch on `removed`. When you see one, **delete or hide your copy** — you are no
longer authorised to display that employer. This happens when OECS revokes the
verification or when the employer withdraws consent to be listed; the two are
not distinguished, and your obligation is the same either way.

Recommended cadence: once or twice a day. There is no benefit to polling faster.

---

## 5. Limits and errors

**600 requests per hour per key.** At `limit=200` that is 120,000 records an
hour — far more than a change feed needs.

| Code | Meaning | What to do |
|---|---|---|
| 200 | Success | — |
| 400 `invalid_cursor` | Cursor not recognised | Restart the sync from the beginning |
| 400 `invalid_updated_since` | Not a valid ISO 8601 timestamp | Fix the parameter |
| 400 `include_removed_requires_updated_since` | Tombstones need a window | Add `updated_since` |
| 401 `unauthorized` | Key missing, malformed, unknown or revoked | Check the header; contact OECS |
| 405 | Wrong method | Only `GET` is supported |
| 429 `rate_limited` | Over the hourly limit | Wait `retry_after` seconds, then retry |
| 500 `server_error` | Transient fault on our side | Retry with exponential backoff |
| 503 | Deployment misconfigured | Contact OECS |

Every error body is `{"error": "<code>"}`. `429` also carries
`retry_after` in seconds.

A `401` is deliberately identical for every cause. If you believe your key is
valid, contact OECS rather than retrying in a loop.

---

## 6. Terms of use

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
