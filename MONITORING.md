# Monitoring Runbook

## Scope

Error monitoring is Sentry, wired into both halves of the app:

- **Browser** — `src/lib/monitoring.ts`, initialised from `src/instrument.ts` (the first import in `src/index.tsx`).
- **Edge API** — `api/_monitoring.ts`, applied per route with `withApiMonitoring()`.

Session Replay is deliberately **not** enabled: it records the DOM, which on this platform contains grant applications, direct messages, and CVs.

Sentry is entirely optional. With no `VITE_SENTRY_DSN`, `initializeMonitoring()` returns early and every `captureException` becomes a silent no-op — that is the supported state for a fork, a preview branch, or a local checkout, not a misconfiguration.

## Setup

1. Create one Sentry React project.
2. Set `VITE_SENTRY_DSN` (browser) and `SENTRY_DSN` (Edge) in the Vercel Production/Preview scopes. The same DSN can serve both.
3. Set `VITE_SENTRY_ENVIRONMENT` / `SENTRY_ENVIRONMENT`. They fall back to the Vite mode and `VERCEL_ENV` respectively.
4. Release tagging falls back to `VERCEL_GIT_COMMIT_SHA`; set `VITE_SENTRY_RELEASE` / `SENTRY_RELEASE` to override.
5. For `/admin/errors` and private source-map upload, set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. EU-region orgs also need `SENTRY_API_BASE_URL=https://de.sentry.io/api/0`.
6. Configure alerts: a new production issue, and an issue exceeding ~10 events in 10 minutes.
7. Exclude drills from alerts by filtering out `simulated:true` (see [Error Simulator](#error-simulator)).

Source maps are only generated when all three of `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` plus a release are present, and are deleted from `dist` after upload — a build without them emits no maps at all rather than publishing readable source.

### Token type and scopes

**The token type matters more than the scopes.** Sentry issues three kinds and they are not interchangeable:

| Prefix | Kind | Can read issues? |
|---|---|---|
| `sntrys_` | Organization auth token (what the setup wizard and CI examples hand you) | **No** — release/source-map work only. Every read returns `403`. |
| `sntryu_` | User auth token (Settings → Account → User Auth Tokens) | Yes, with the scopes below |
| `sntryu_`/custom | Internal integration (Settings → Developer Settings → New Internal Integration) | Yes — preferred, since it is not tied to one person leaving the org |

A `sntrys_` token fails with `403` on *every* endpoint including `/organizations/`, which looks like a scope problem but is not fixable by adding scopes. Use an internal integration and give it Releases: Admin as well, so one token covers both source-map upload and the dashboard.

| Action | Scope |
|---|---|
| View issues and events | `event:read`, `project:read` |
| Resolve / ignore / reopen | `+ event:write` |
| Delete | `+ event:admin` |

`SENTRY_ORG` is the org **slug**, not the display name. It is visible in the Sentry URL, or decodable from the `org` field of a `sntrys_` token payload.

## What is sent

Enough to debug, minus anything that identifies a person or grants access.

**Sent:** exception messages, stack frames, breadcrumbs, extra data, span descriptions, request URL and method, and record UUIDs. Every string first passes through `redactDeep` in `src/lib/redact.ts`, which strips email addresses, JWTs, bearer tokens, and secret-bearing query parameters (including the signed storage URLs Supabase issues), and drops the value of any credential-named key outright.

**Not sent:** request bodies, cookies, headers, IP addresses, emails, usernames. `sendDefaultPii` is false (the envelope carries `infer_ip: "never"`). The user record is reduced to its UUID.

**Sent by Sentry, not by us:** Sentry derives a coarse `user.geo` (country and region) at ingest from the connection, before the IP is discarded. Verified on a real event: `ip_address: null` alongside `geo: {country_code: "GD", region: "Grenada"}`. So "no IP is stored" is true, but "no location is stored" is not — country-level location is retained and cannot be scrubbed by `beforeSend`, which runs client-side. Note this in the privacy review; suppress it with Sentry's server-side data-scrubbing settings if country is considered identifying for this user base.

UUIDs and numeric record IDs are preserved **on purpose** — they are how an error is traced back to the project, grant, or profile row that produced it.

> A user UUID is pseudonymous, not anonymous: joined against `profiles` it identifies a person. Treat Sentry access as access to personal data and keep the org member list current.

### Consent

Performance tracing is gated on optional analytics consent (`src/lib/analytics-consent.ts`) and runs at 100% once granted, 0% otherwise. **Error capture is not gated** — an unhandled exception is necessary to operate the service. Product analytics (`src/hooks/useAnalytics.ts`) is gated identically to tracing.

Tracing headers propagate to same-origin API routes only, so a browser span and its Edge span join one distributed trace.

## Error codes

Every reported error should carry an `error_code` tag from `SAFE_MESSAGES` in `src/lib/app-error.ts`. Each code maps to a fixed, developer-authored sentence; nothing is interpolated from runtime data, so the table is provably safe to send.

Prefer `AppError` over a bare `Error` where a failure is expected: it carries `code` / `area` / `operation`, takes its message from the registry, groups by code rather than stack shape, and accepts the original error as `cause`. Add a code by adding one entry — `ErrorCode` widens automatically.

Server captures are additionally tagged with `route` and `status`, and `safeApiValue` rebuilds the title from those tags so a 5xx names the route it came from.

## Admin dashboard — `/admin/errors`

Live Sentry issues, with scope/period filters, search, expandable per-issue context (request, client, release, tags, stack, breadcrumbs), and bulk triage.

- Gated by `AdminRoute` client-side and by the `org:manage` permission server-side, evaluated through the same `has_permission()` function RLS uses — revoking an admin in the matrix revokes their access here.
- The Sentry auth token is organisation-wide and **never** reaches the browser. All reads go through `api/admin/sentry.ts`, which authorises first and only then resolves the token.
- That route takes **no service-role client**: it reads nothing from Postgres beyond the caller's own permission check.
- Scopes are allow-listed (`unresolved` / `resolved` / `ignored` / `all`) rather than passing a raw Sentry query through, so the endpoint cannot be used as an open proxy.
- A missing token returns **501** (not 500) and the page renders setup instructions — the deployment is healthy, the operator simply has not wired it up.

The vendored ReUI/shadcn grid lives in `src/pages/admin/errors/ui/` and its design tokens are scoped to `.errors-console` in `errors-console.css`. Both are deliberately local to this dashboard: those components are written against shadcn's neutral palette and its own radius scale, so defining either globally would restyle the whole app. Re-sync from the registry by replacing that folder.

## Error Simulator — `/admin/errors/simulate`

Six scenarios (data API, authentication, application API, AI provider, collaboration, route loading) that send controlled, privacy-safe events through the **live** pipeline and report each event ID.

It is gated behind admin permission rather than a `DEV` flag on purpose: the thing worth proving is that *production* reporting works, which a dev-only capture cannot demonstrate. Containment comes from tagging instead — every event carries `simulated: true` and a dedicated fingerprint (`['sentry-simulator', code]`), so drills never merge into a real issue and can be filtered out of alerts.

Triage them from `/admin/errors` when finished.

### Raising errors by hand

```js
setTimeout(() => { throw new Error('console smoke test') }, 0)
Promise.reject(new Error('console rejection test'))
```

A `throw` typed at the prompt is swallowed by devtools, so it must escape through a timer to reach the global handler. Neither carries an `error_code`, so neither groups by code.

To verify what leaves the browser, set `VITE_SENTRY_DSN` locally and filter the Network tab for `envelope` — the body is the scrubbed event, so titles, tags, and the absence of personal data can be checked without opening Sentry.

To confirm the `cause` chain survives:

```js
setTimeout(() => { throw new Error('outer', { cause: new Error('inner') }) }, 0)
```

Two entries under `exception.values` means linked-errors handling is active. One means anything relying on `cause` for diagnostic detail — including `AppErrorBoundary` — is losing its original stack.

## Capture points

| Source | Location | Code |
|---|---|---|
| React error boundary | `src/components/ErrorBoundary.tsx` | `REACT_COMPONENT_ERROR` |
| React root (uncaught) | `src/index.tsx` | `REACT_UNCAUGHT_ERROR` |
| React root (recovered) | `src/index.tsx` | `REACT_RECOVERABLE_ERROR` |
| Lazy route chunk failure | `src/App.tsx` (`lazyPage`) | `ROUTE_IMPORT_FAILED` |
| Analytics ingestion | `src/hooks/useAnalytics.ts` | `ANALYTICS_INGESTION_FAILED` |
| API 5xx response | `api/_monitoring.ts` | `API_INTERNAL_SERVER_ERROR` |
| API thrown exception | `api/_monitoring.ts` | `API_UNHANDLED_EXCEPTION` |

Route transactions are named after the matched pattern (`/projects/:id`), not the literal URL, via `Sentry.wrapCreateBrowserRouter` — otherwise every record would create its own transaction and performance data could not aggregate.

`withApiMonitoring` also emits one structured JSON log line per request (`type`, `route`, `method`, redacted `url`, `status`, `duration_ms`, `request_id`) and sets `X-Request-Id` on the response, so a user-reported failure can be located in Vercel logs.

## Rollback and cost control

- **Disable Sentry entirely:** remove `VITE_SENTRY_DSN` and redeploy.
- **Reduce trace volume:** lower the sampler in `src/lib/monitoring.ts` / `tracesSampleRate` in `api/_monitoring.ts`.
- **Revoke dashboard access without redeploying:** remove `org:manage` from the role in the permission matrix.
- **Revoke Sentry API access:** delete the token in Sentry; the dashboard degrades to the 501 setup notice.
