# KTIP Course Catalog API

How KTIP pulls courses from **OECS Virtual Campus** — a single multi-tenant
deployment served on several hostnames. **Learning Hub is unchanged** — same
endpoints, keys, and behavior as before (`/api/external/catalog`,
`/api/external/enrollments`, `LEARNING_HUB_API_KEY`).

---

## Hostnames (same app, tenant resolved from hostname)

| Host | Tenant | KTIP catalog |
|------|--------|--------------|
| `https://mypd.oecscampus.org` | MyPD (platform) | Federated platform catalog |
| `https://commons.oecscampus.org` | Regional Commons | **Same** federated catalog |
| `https://oecscampus.org` | Default (legacy apex) | **Same** federated catalog |
| `https://{institution}.oecscampus.org` | That institution only | Institution’s own courses only |

**Platform federation:** MyPD, Commons, and the default tenant share one catalog
(same pattern as the library). Calling KTIP endpoints on **any platform host**
returns the same `items[]`. Pick one base URL for integration — `mypd.oecscampus.org`
is the usual production choice.

**Institutional tenants** (mcc, acc, salcc, …) are siloed: their catalog only
includes courses managed under that tenant.

Path shape is identical on every host:

```
https://{host}/api/external/ktip/catalog
https://{host}/api/external/ktip/enrollments
```

Set `NEXT_PUBLIC_APP_URL` (or pass the host you integrate against) so response
fields like `catalog_url`, `sign_in_url`, and `course_url` match your chosen base.

---

## Learning Hub (no changes required)

| Item | Value |
|------|--------|
| Catalog | `GET /api/external/catalog` |
| Enroll | `POST /api/external/enrollments` |
| Auth | `Authorization: Bearer <LEARNING_HUB_API_KEY>` |
| Hub-side changes | **None** |

Existing Hub integrations keep working. `available_to_learning_hub` defaults to
`true`; Hub enrollments are **not** blocked by distribution flags.

---

## KTIP integration (new)

KTIP only sees courses where an admin has enabled **Available to KTIP** (on
approve or in course edit). Default is off.

### Environment (Virtual Campus / Vercel)

| Variable | Purpose |
|----------|---------|
| `MYPD_KTIP_API_KEY` | Secret KTIP sends on enrollment calls (name is historical; used platform-wide) |

Set on the **virtual-campus** Vercel project (Production). Share the same value
with the KTIP team for server-to-server calls.

Local dev: `.env.local` → `MYPD_KTIP_API_KEY=...`

> **Note:** `KTIP_API_KEY` in `.env.example` is a different flow (Virtual Campus
> **pulling** verified employers **from** KTIP). Catalog enrollment auth uses
> `MYPD_KTIP_API_KEY` only.

---

## Endpoints

All paths below are relative to your chosen `{BASE_URL}` (e.g.
`https://mypd.oecscampus.org` or `https://commons.oecscampus.org`).

### `GET /api/external/ktip/catalog`

Public read (no auth), same JSON shape as the Learning Hub catalog.

**Alias:** `GET /api/external/ktip/courses`

| Param | Default | Description |
|--------|---------|-------------|
| `provider_key` | — | Filter external provider |
| `limit` | `50` | Max `200` |
| `offset` | `0` | Pagination |

**Examples (equivalent on platform hosts)**

```http
GET https://mypd.oecscampus.org/api/external/ktip/catalog?limit=20
GET https://commons.oecscampus.org/api/external/ktip/catalog?limit=20
```

**Response (abbreviated)**

```json
{
  "consumer": "ktip",
  "items": [
    {
      "catalog_type": "external",
      "course_id": "uuid",
      "candidate_id": "uuid",
      "title": "Introduction to Entrepreneurship",
      "subject_area": "Business & Entrepreneurship",
      "grade_level": "University",
      "external_launch_url": "https://…",
      "enrollable": true,
      "is_external": true
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0,
  "catalog_url": "https://{BASE_URL}/api/external/ktip/catalog",
  "enroll_endpoint": "https://{BASE_URL}/api/external/ktip/enrollments"
}
```

Use `items[].course_id` for enrollment. Use the **same** `{BASE_URL}` for enroll
that you used for catalog (either platform host works for federated content).

---

### `POST /api/external/ktip/enrollments`

Enroll a learner by email into a KTIP-visible course.

**Auth**

```http
Authorization: Bearer <MYPD_KTIP_API_KEY>
Content-Type: application/json
```

**Body**

```json
{
  "email": "learner@example.com",
  "course_id": "<from items[].course_id>",
  "name": "Optional display name"
}
```

Alternatives: `candidate_id`, or `provider_key` + `external_id` (same as Hub).

**Success**

```json
{
  "consumer": "ktip",
  "message": "Enrolled successfully",
  "user_id": "uuid",
  "course_id": "uuid",
  "enrollment_id": "uuid",
  "is_new_user": false,
  "sign_in_url": "https://{BASE_URL}/auth/signin",
  "course_url": "https://{BASE_URL}/courses/{course_id}"
}
```

**Errors**

| Status | Meaning |
|--------|---------|
| `401` | Missing or wrong API key |
| `403` | Course not flagged `available_to_ktip` |
| `404` | Course / candidate not found |

---

### `GET /api/external/ktip/enrollments?email=...`

List active enrollments for an email. Same API key as POST.

---

## Admin: enabling courses for KTIP

On any platform host: **Admin → External Catalog** (`/admin/external-catalog`):

1. Import or sync a candidate (CSV / auto-sync).
2. **Approve** — check **Available to KTIP** (Learning Hub defaults on).
3. Publish the LMS course when ready.

Or edit any course → **External distribution** → **Available to KTIP**.

Database columns on `courses` (all tenants):

| Column | Default | Consumer |
|--------|---------|----------|
| `available_to_learning_hub` | `true` | Learning Hub |
| `available_to_ktip` | `false` | KTIP |

Migration: `database/consolidated/089-course-distribution-flags.sql`

---

## Quick test (after deploy + migration)

```bash
BASE=https://mypd.oecscampus.org   # or https://commons.oecscampus.org

# Catalog (no auth) — same items on either platform host
curl "$BASE/api/external/ktip/catalog?limit=5"

# Enroll (replace course_id)
curl -X POST "$BASE/api/external/ktip/enrollments" \
  -H "Authorization: Bearer $MYPD_KTIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","course_id":"<uuid>"}'
```

---

## Related docs

- [External Catalog & Courses API](./external-catalog-api.md) — full reference
  (Hub + admin + candidates)
- [Course Structure](./course-structure.md) — LMS course model

## Source files

| Area | Path |
|------|------|
| KTIP catalog route | `app/api/external/ktip/catalog/route.ts` |
| KTIP enrollments | `app/api/external/ktip/enrollments/route.ts` |
| Platform tenant scope | `lib/external-catalog/platform-tenants.ts` |
| Consumer filtering | `lib/community-catalog.ts`, `lib/catalog-consumer.ts` |
| KTIP auth | `lib/ktip-api/auth.ts` |
| Migration | `database/consolidated/089-course-distribution-flags.sql` |
