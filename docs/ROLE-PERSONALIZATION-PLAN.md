# Role personalization — final plan

## Context

The RBAC model is sound. `supabase/migrations/063_rbac_permissions.sql` defines 13 roles across three tiers, a 24-key capability matrix, hard safeguard denials for students, and DB triggers that make privilege escalation impossible from the client. Migration `099` scoped `get_my_permissions()` to `profiles.active_role`; commit `c470d6f` taught the Navbar to render for the active role.

What the model lacks is consistent *consumption*: gating applied unevenly, a homepage with no role-awareness at all, and a ranker that barely knows roles exist.

This is the third revision. Two earlier versions contained changes that would have broken the app and one feature that would have silently done nothing. All three are recorded below rather than deleted — the reasoning is the most valuable part of the document.

---

## Risks found and resolved

### R1 — `/admin` redirect loop 🔴 would have broken production

Original plan: admit `chamber_admin` to the console, then redirect non-`org:manage` holders from `/admin` to "the first visible admin path" from `AdminLayout.tsx:79`.

`AdminLayout.tsx:49` is `{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }` — **no `requires`**, so it survives every filter. "First visible path" resolves to `/admin`, which redirects to `/admin`, forever.

**Resolution:** target the first entry whose `href !== '/admin'`, and render an empty state — never a `<Navigate>` — when nothing else survives.

### R2 — migration signature change 🔴 would have silently disabled the feature

Original plan added a `p_country` parameter to `personalization_contributions()`, which takes 13 arguments (`061:250-263`). `CREATE OR REPLACE` cannot add a parameter — it creates an **overload**. Both callers (`rank_content` `061:491`, `get_personalized_feed` `061:549`) pass 13 args positionally, so they would have kept calling the old function and the new term would never have fired. `061:570` also spells the 13-arg signature out in a `REVOKE`.

**Resolution:** freeze the signature. Add a separate `geography_contribution(...) RETURNS JSONB` and concatenate arrays at both call sites — `personalization_contributions(…) || geography_contribution(…)`. Both are JSONB arrays; the surrounding `jsonb_array_elements(...)` is unchanged, and `061:570` stays valid untouched.

Verified separately: `content_index` is referenced only from **function bodies**, never another view. Postgres binds function bodies late, so `DROP VIEW IF EXISTS content_index; CREATE VIEW …` is safe without `CASCADE`.

### R3 — the admin widening was oversold 🟡

`DEFAULT_ROLE_PERMISSIONS.super_admin` is `ALL_PERMISSION_KEYS` (`permissions.ts:310`) and **no other role holds `org:manage` or `institution:verify`**. Of the two capabilities added to the console admission set, only `sme:verify` changes anything, and it admits exactly one role.

`educational_partner` holds `institution:approve_students`, not `institution:verify` — it approves its own roster, it does not verify schools. It correctly stays out.

**True blast radius: one role (`chamber_admin`), one page (`/admin/chamber`).**

### R4 — `useIsEventHost` swap is a no-op 🟢

`useEvents.ts:383` already calls `useAuth()`, so `auth.can('org:manage')` is a drop-in. Only `super_admin` holds `org:manage`, and `expandRoles` maps `oecs → super_admin`, so the resulting set is identical to today's hardcoded check. Zero behaviour change on the default matrix.

### R5 — country matching was dead on arrival 🔴 would have shipped a feature that never fired

`normalize_topic()` (`055_personalization.sql:116`) lowercases, trims, and collapses `[&/,._#-]` to spaces. **No tokenization, no substring, no stemming.** Against the real seed data, `normalize_topic(events.location) = normalize_topic(profiles.country)` matches **zero of six** non-virtual events:

| `events.location` | profile `country` | match |
|---|---|---|
| `Bay Gardens Hotel, Rodney Bay, Saint Lucia` | `Saint Lucia` | ❌ |
| `Dominica State College, Roseau` | `Dominica` | ❌ |
| `Sandals Grande, Antigua` | `Antigua and Barbuda` | ❌ |
| `Grenada Trade Centre, St. George's` | `Grenada` | ❌ |
| `National Research & Development Foundation, Kingstown` | `Saint Vincent and the Grenadines` | ❌ |
| `SVG Community College, Villa` | `Saint Vincent and the Grenadines` | ❌ |

`content_index` does not select `location` at all today, so nothing was even computing it. The `+10` term would have been dead code that reviewed as a working feature.

**Resolution:** add a real `events.country_code` column fed by a picker. See C2.

### R6 — two competing country vocabularies 🟡 design decision, made here

- `profiles.country` — free-text `TEXT`, constrained only by the `CARIBBEAN_COUNTRIES` TS constant (15 alphabetical names, `constants.ts:429`).
- `countries` table (`058_employers.sql:26`) — `CHAR(2)` PK, `name`, `is_oecs_member`, `sort_order`. OECS members first. Includes Anguilla, BVI, Martinique, Guadeloupe and non-Caribbean partners the constant lacks. Already drives the Chamber form via `useCountries(true)` (`useInstitutions.ts:14`).

`058:21` is explicit: `-- profiles.country stays free text; this table does not inherit that mistake.`

**Decision: `events.country_code CHAR(2) REFERENCES countries(code)`, not free text.** Mirroring `profiles.country` would mean deliberately adopting a mistake the codebase has already named. The cross-vocabulary match is an exact join — `countries.name = profiles.country` — and I verified all 15 `CARIBBEAN_COUNTRIES` strings appear verbatim in `countries.name`. Cost is one join in the scoring predicate; benefit is a referential column and the better picker.

### R7 — the RBAC guide's "known failure" is stale 🟢 documentation rot

`RBAC_TESTING_GUIDE.md:1462-1468` says `validation.test.ts > signupSchema > accepts valid signup data` fails, 226 of 227. Commit `19105de` added `date_of_birth` to `signupSchema` **and** fixed the test in the same commit; the guide paragraph was never updated, and sixteen commits have landed since.

**Resolution:** delete the paragraph (Part D). Verification baseline is a clean **227/227** — any failure is then unambiguously ours, which is a stronger gate than "expect one known failure."

### R8 — second-pass dashboard findings 🟡 three corrections, one addition

Verified every dashboard surface directly on a second pass:

1. **Wrong path in the plan.** The fourth admin-check copy is at `src/components/messages/AssistantChatWindow.tsx:27` — there is no `components/assistant/` directory. Its comment even says "Matches AdminRoute", so it must move with the others.
2. **A fifth `activeRole`-ignoring site, previously missed.** `AssistantChatWindow.tsx:23` passes `userRole: auth.profile?.roles?.[0]` to the AI assistant — the persona is told the member's first held role regardless of the context they switched into. Should be the first of `effectiveRoles`.
3. **Naive narrowing would double the chips.** `expandRoles(['oecs'])` returns `['oecs', 'super_admin']` — both slugs, by design, so RLS and tab lists keep working. Rendering that as chips shows **two chips for one identity** ("OECS Admin" from `LEGACY_ROLE_LABELS` wins for `oecs` in `ROLE_LABELS`, plus "Super Admin"). Display surfaces need the *opposite* transform: map each held slug through `ROLE_ALIASES` and dedupe. That is a separate helper — `displayRoles()` — not a reuse of `effectiveRoles`.
4. **Both chip surfaces fix at one callsite.** `DashboardLayout.tsx:91` renders the hero chips from raw `profile?.roles` and passes the same raw array to `DashboardTopBar` at `:115` (rendered at `DashboardTopBar.tsx:73`). Narrow once in `DashboardLayout`, both bands follow.
5. Minor line drift against the current tree: `AdminRoute.tsx:12`, `Navbar.tsx:219`, `useGlobalSearch.ts:265`.

---

## Confidence, per part

| Part | Confidence | Why |
|---|---|---|
| **A** gating | **~97%** | Client rendering only. Each change either hides a control that already dead-ended, or widens a check whose default-matrix result is provably identical (R4). The one real widening is R3 — one role, one page — with R1's loop fixed. SQL untouched, so no change here can grant access. |
| **B** homepage | **~96%** | `rank_content` has an explicit `IF v_bag IS NULL THEN RETURN` carrying the comment *"Returning nothing makes the caller keep the server ordering it already has, which is the degradation guarantee."* Degradation is designed in, not incidental, and it stacks with the `usePersonalizationActive()` guard in each hook and the `try/catch` in `rankRows`. Three independent layers. Anonymous visitors take today's exact code path. |
| **C1** role affinity | **~95%** | Signature frozen (R2). `061` is fully idempotent — no `CREATE TABLE`, no `INSERT`, no `CREATE INDEX` — so re-running it is a clean rollback. |
| **C2** geography | **~88%** | The largest remaining surface: a column, four type lists, two forms, a backfill, and a seed change. Nothing subtle, but the most places to miss one. Ships behind C1 and can be dropped without affecting it. |

**No single number for the whole plan.** A and B land first behind a verification gate; C is separated so a problem there cannot take them down.

What protects all of it: nothing here is a security boundary. Authorization is decided in SQL by `has_permission()`, which this plan does not modify.

---

## Part A — Role-gating fixes

### A1. One admission rule, one narrowing helper

In `src/lib/permissions.ts`, beside `expandRoles` / `isOrganizationAccount` / `defaultPermissionsFor` — all pure, all unit-testable without a React tree:

- `ADMIN_CONSOLE_CAPABILITIES: PermissionKey[]` = `['org:manage', 'moderation:view', 'sme:verify', 'institution:verify']` — the union of every `requires` on the `AdminLayout` sidebar.
- `effectiveRoles(roles, activeRole)` — the narrowing rule duplicated verbatim in `Navbar.tsx:208`, `dashboard-tabs.ts:85`, `AuthContext.tsx:205`.
- `displayRoles(roles, activeRole)` — `effectiveRoles`, then each slug mapped through `ROLE_ALIASES` and deduped, for chip/badge rendering (R8.3 — without the collapse a legacy `oecs` account renders two chips for one identity).
- `canUseGrantApplications(can, roles)` — see A3.
- `primaryProfileLink(effectiveRoles)` — see A5.

Then:

- `AdminRoute.tsx:12` — `isAdmin` becomes `ADMIN_CONSOLE_CAPABILITIES.some(auth.can)`; update its comment, which currently names the two-capability rule.
- `AdminLayout.tsx` — export `visibleAdminNavItems(can)` wrapping the `:79` filter so layout and dashboard share one list.
- `AdminDashboardPage.tsx` — when `!auth.can('org:manage')`, redirect to `visibleAdminNavItems(auth.can).find(i => i.href !== '/admin')?.href`, **rendering a plain "nothing assigned to this account" panel when that is `undefined`** (R1).
- Replace the three copies of `org:manage || moderation:view` — `Navbar.tsx:219`, `useGlobalSearch.ts:265`, `src/components/messages/AssistantChatWindow.tsx:27` (path per R8.1).
- `useEvents.ts:390` — hardcoded slugs → `auth.can('org:manage')` (R4).
- Apply the narrowing at the five sites that skip it:
  - `DashboardLayout.tsx:91` — hero chips from `displayRoles(auth.roles, auth.activeRole)`; the same value goes into the `roles` prop at `:115`, which fixes `DashboardTopBar.tsx:73` for free (R8.4).
  - `RoleTabStub.tsx:35` — uses `expandRoles` but ignores `activeRole`, so a tab hidden by the switcher is still reachable by URL; use `effectiveRoles`.
  - `LeaderboardPage.tsx:42` — its own `active_role || roles[0]` fallback; use `effectiveRoles(...)[0]`.
  - `RoleSwitcher.tsx:24` — raw `profile.roles`, so a legacy `oecs` account is offered "OECS Admin (legacy)" instead of Super Admin; list `displayRoles(auth.roles, null)` (the switcher must always offer every held role, never the narrowed set — narrowing the switcher by its own output would lock the member into a context).
  - `AssistantChatWindow.tsx:23` — `userRole: auth.profile?.roles?.[0]` tells the assistant the first held role regardless of switched context (R8.2); use `effectiveRoles(auth.roles, auth.activeRole)[0]`.

### A2. Gate the CTAs that lie

Follow `ProjectsPage.tsx:42`: `!auth.user || auth.can(...)`, so signed-out visitors keep the CTA and route to login.

Gate on `event:create`: `EventsPage.tsx:346` (header) and `:472` (empty state), `EventsTab.tsx:21`, `AdminDashboardPage.tsx:255`, `AdminEventsPage.tsx:195`. While in `AdminDashboardPage`, gate the other three quick actions and the nav cards on their sidebar `requires` — a `safety_admin` gets a correctly trimmed sidebar next to four buttons that all dead-end, the exact failure `AdminLayout`'s docstring (`:30-41`) says it was written to fix.

⚠️ `EventsPage.tsx` and `GrantsPage.tsx` have **no auth import at all** — both need `useAuth` added. `EventsTab.tsx` already has `auth` in scope at line 11.

While in `EventsTab.tsx`, wrap its strings in `<Trans>` — its sibling `ProjectsTab.tsx` is the model for both the gate (`:23`) and the i18n, and `EventsTab` currently has neither.

### A3. Grants: students and investors

**Students.** `GrantDetailPage.tsx:52` deliberately lets a student start an application (`canApply = … && (canSubmit || isStudent)`) — sponsorship is the point, and Part 8 of the RBAC guide tests it. But `Navbar.tsx:134` gates `My Applications` on `grant:apply`, which `SAFEGUARD_DENY.student` permanently denies, so a student creates a draft and then has no navigation entry back to it — while `GrantsPage.tsx:126` shows the same link unconditionally to everyone.

Export `canUseGrantApplications` and use it at all three sites. Note `GrantDetailPage.tsx:50` currently derives `isStudent` from raw `auth.profile?.roles?.includes('student')` — not `expandRoles`, not `activeRole`. The helper should use `expandRoles` for consistency with the rest of the codebase; `student` is never an alias target so this changes no behaviour today.

**Investors.** `grant:post` is granted to `investor` by default (`permissions.ts:327`), RLS has supported non-admin authoring since migration 077 (`grants.created_by`), and `admin/grants/AdminGrantFormModal.tsx` is already a self-contained modal over `useCreateGrant` — but its only entry point is a super-admin page. Move it to `src/components/grants/GrantFormModal.tsx`, import from both places, add a "Post a funding call" button to the `/grants` hero gated on `grant:post`. No new form, no new route.

### A4. Two orphaned surfaces

- `/sme/verification` (`ChamberOnboardingPage.tsx:81`) checks only `auth.user`, so a verified student can file a Chamber of Commerce business registration. Gate it and give it the nav entry it has never had. Note the RBAC guide's step 9.2 already claims it is "reachable from the dashboard Business tab" — only true via `/org/edit`.
- Global search: `filterByAccess` (`site-search.ts:141`) has only `guest`/`auth`/`oecs`, so Ctrl-K offers `/events/new` and `/org/edit` to every signed-in account. Add optional `requires?: PermissionKey` to `SiteEntry` (`site-map.ts:19`), set it on the four entries that need it — `projects.new`, `events.new`, `grants.my-applications`, `org.profile` — and extend `Viewer` with a `can` predicate. ⚠️ `site-search.test.ts` asserts every href in `site-map.ts` matches a real route; adding an optional field must not disturb it.

### A5. Fold the CV ↔ Business-profile fork into one place

Written three times — `Navbar.tsx:847` (desktop, JSX branch), `Navbar.tsx:1131` (mobile ternary, and the only labels in that file not wrapped in `<Trans>`), `dashboard-tabs.ts:41`/`:64`. The two tests also disagree: `isOrganizationAccount()` falls back to the CV, while the tab list keys CV off `INDIVIDUAL_ROLES` and Business off `ORGANIZATION_ROLES`. `primaryProfileLink()` at all three sites; wrap the mobile labels.

⚠️ Expected behaviour change: **admin-tier roles are in neither `ORGANIZATION_ROLES` nor `INDIVIDUAL_ROLES`**, so a pure `safety_admin` gets neither tab today and gains "My CV". Intended, but it is a change, not a pure refactor — put it on the walkthrough.

---

## Part B — Role-aware homepage

All in `src/pages/discover/DiscoverPage.tsx`, which gains its first `useAuth` import. Hero layout, motion and FLIP machinery untouched.

### B1. Default mode by role

`MODES` (`:37`) stays. Add `DEFAULT_MODE_BY_ROLE: Partial<Record<RoleSlug, Mode>>` to `src/lib/personalization.ts`:

- `grants` — `investor`, `private_sector`, `sme`, `entrepreneur`
- `events` — `student`, `faculty`, `educational_partner`
- `projects` — `mentor`, `researcher`, `chamber_admin`
- admin roles and signed-out fall through to today's `grants` default

Seed `useState<Mode>` from `effectiveRoles(auth.roles, auth.activeRole)[0]`; re-seed on `activeRole` change **only** while the member has not touched the toggle — a `userPickedMode` ref, so switching context re-tailors the page but a manual choice always wins.

### B2. Rank the hero

Pass `sort: 'for_you'` to the three hooks at `:327-329`. Three independent degradation layers (see the confidence table). The existing `useEffect` at `:416` clamps `index` on `count` change, which covers the transient during the refetch the new query key triggers.

### B3. CTA by capability

Primary action chosen by mode and capability; "View Details" always present as secondary:

| Mode | Capability | Primary CTA |
|---|---|---|
| grants | `canUseGrantApplications` | Apply for this grant |
| grants | `grant:post` | Post a funding call |
| projects | `project:create` | Start a project |
| events | `event:create` | Host an event |
| — | none | View Details only |

### B4. For You rail and empty state

`ForYouRail.tsx` already self-hides for signed-out members, disabled personalization and empty signal sets — its docstring says it is for "Dashboard and Discover" and it has only ever been mounted on the Dashboard. Mount it below the hero, **inside its own light-background section wrapper** — the rail's cream cards were styled for the dashboard canvas, and the Discover hero is a full-bleed dark band; dropping it in bare would put cream cards straight onto the dark gradient. The empty state (`:940`) gains a role-shaped second line from the B3 table.

### B5. Bento grid

`FEATURES` (`:207`) is seven static tiles including Messages and Directory, shown to signed-out visitors who cannot use either. Add optional `requires?: PermissionKey` / `authOnly?: boolean`, filter with the Navbar's rule.

### B6. Dashboard Overview quick actions

The user asked for the dashboard pass explicitly, so the scope decision is recorded here rather than left implicit.

**In scope:** a small `RoleQuickActions` strip at the top of `OverviewTab.tsx` — the same capability table as B3 rendered as buttons (`project:create` → Start a project, `event:create` → Host an event, `canUseGrantApplications` → My applications, `grant:post` → Post a funding call) plus `primaryProfileLink()` as the final entry. Every entry reuses helpers this plan already builds; the component is a flat capability-filtered list with zero new logic. The Overview panel today has no role-aware content at all besides the For You rail's scoring.

**Explicitly out of scope: real panels for the three role-tab stubs.** `FundingTab` / `MenteesTab` / `ResearchTab` are thin wrappers over `RoleTabStub` ("Coming soon"), and their own docstring says the panels "still need data hooks that don't exist yet." Building deal-flow, mentee and publications panels is a data-model feature per tab, not a personalization fix — bolting placeholder content into them would be scope theft from this plan and would still ship nothing real. They keep their gating fix (A1) and nothing else.

---

## Part C — Ranker

Two migrations, not one, so C2's larger surface cannot break C1.

### C1 — `100_role_affinity.sql`

House style from `099`: `-- ===` rule, imperative title, prose explaining prior behaviour and what does *not* change. Must be re-runnable (guide §0.2 runs everything twice) — `CREATE TABLE IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`, `CREATE OR REPLACE FUNCTION`. `061` itself has no table or insert, so these guards are new here and must be right.

- `personalization_bag()` (`061:209`) adds `'active_role', v_prof.active_role`. Additive to a JSONB object — no signature change, no caller change.
- New `role_entity_affinity(role_slug, entity, weight)` seed table, so the mapping is data and retunable without a deploy — the same argument `055`'s header makes for `topic_aliases`.
- `personalization_contributions()` replaces the three-branch `IF` at `061:328` with a lookup over that table. **Signature frozen** (R2). Seed all 13 slugs — `researcher`, `sme`, `private_sector`, `educational_partner`, `chamber_admin` currently get no role term at all. Weight `8 → 18`, still under the 25/topic and 30/category explicit picks so a stated interest keeps outranking a role guess. Label names the role.
- Prefers `active_role` when set, falls back to the union over held roles, takes **max** weight rather than summing so a multi-role account is not double-counted.
- Ends with `NOTIFY pgrst, 'reload schema';` (new table).

### C2 — `101_event_country.sql` + client changes

Per R5 and R6.

**Migration.** `ALTER TABLE events ADD COLUMN IF NOT EXISTS country_code CHAR(2) REFERENCES countries(code)` — house pattern from `092_event_type_fields.sql:22-25`, with `COMMENT ON COLUMN`. Best-effort backfill guarded `WHERE country_code IS NULL` so it is idempotent, matching `location ILIKE '%' || c.name || '%'` and leaving NULL where ambiguous. Rebuild `content_index` with `country_code` and `is_virtual` (NULL/FALSE for the other three entities). Add `geography_contribution(p_bag, p_country_code, p_is_virtual)`: `+10` when `EXISTS (SELECT 1 FROM countries c WHERE c.code = p_country_code AND c.name = p_bag->>'country')`, `+4` when virtual. Concatenate at both call sites (R2).

The migration header must state that `project`, `grant` and `resource` carry no geography **by design** — `grants.eligibility` is free text and would need its own column — so the next reader does not file it as a bug.

**Client — the column appears in four separate type lists**, and missing one is the likeliest way this breaks:
1. `src/types/index.ts:282` — `Event` interface, with the `/** Migration NNN — … */` comment the file uses.
2. `src/types/database.ts` — `events` `Row` (`:200`), `Insert` (`:233`) **and** `Update` (`:266`), three lists.
3. `src/lib/validation.ts:164` — `eventSchema`, used by both event pages.
4. `src/hooks/useEvents.ts:150-172` — `useCreateEvent`'s own inline arg type. This is the one that produces the TS error at the call site.

**Forms.** Extract a `CountrySelect` mirroring `IndustrySelect`'s props (`{ value, onChange, label }`) — it deduplicates three byte-identical inline `<select>` blocks (`ProfileSettingsTab.tsx:299`, `OnboardingPage.tsx:360`, `SignupPage.tsx:309`) and gives the events form its picker for free. Feed it from `useCountries()` so events use the OECS-first list. `CreateEventPage.tsx` needs four edits — `EventDraft` type (`:52`), `useState` (`:96`), the `useFormDraft` payload (`:128`, or the field silently drops from drafts), and the field itself inside the existing `showLocation` guard (`:605`). `EditEventPage.tsx` needs three — state (`:38`), hydration (`:90`), field (`:333`).

Country sits **inside** the `!virtual` guard: a virtual event has no country and scores the `+4` Online term instead.

**Deliberately not touching** `event-blueprints.ts`. Adding a parallel `country: FieldRule` would mean updating every blueprint entry and the exhaustiveness assertions in `event-blueprints.test.ts:38`/`:111`, for no benefit — country is not type-dependent.

**Seed.** Add `country_code` to the `INSERT` column list at `seed.sql:181` **and** to the `ON CONFLICT DO UPDATE SET` at `:254`, or an already-seeded database never picks it up.

**Known drift, not chased:** `supabase/schema.sql`, `_ALL_MIGRATIONS.sql` and `combined_*.sql` are generated aggregates that already lag the numbered migrations.

### C3 — `organization` and `open_to`

Neither belongs in the ranker: `open_to` describes what a member wants *from people*, `organization` is a display string. Surface them where they mean something — `open_to` as a Directory filter facet (`DirectoryPage.tsx`, beside the role filter built on `DIRECTORY_ROLE_LABELS`), `organization` on the directory card. Closes the "collected but never used" gap honestly instead of manufacturing a weak score.

---

## Part D — one RBAC document: `RBAC.md`

Per the user's direction, all RBAC documentation consolidates into a single `RBAC.md` (now `docs/RBAC.md`). Inventory of what exists today:

- `RBAC_TESTING_GUIDE.md` (45KB) — the only substantial RBAC doc; the per-role walkthrough of record.
- `KTIP_Access_Matrix.svg` (31KB) — a hand-drawn access-matrix diagram. Exactly the artifact the generated tables below replace, and as a drawing it can only drift from `permissions.ts`.
- `FEATURES.md` §17.6, `TESTING.md` §1/§9.2/§19.4, `MONITORING.md` — passing mentions only; they stay where they are, with their references pointed at `RBAC.md`.

**Structure of `RBAC.md`:** Part 1 — the model reference (the three tables below, plus a short prose section on tiers, aliases, safeguards and `active_role` narrowing). Part 2 — the full testing guide, absorbed from `RBAC_TESTING_GUIDE.md` with the updates below applied during the move, not after.

**Deletions, called out for approval:** `RBAC_TESTING_GUIDE.md` (content absorbed) and `KTIP_Access_Matrix.svg` (superseded by the generated matrix table). Check for inbound references first — `grep -ri "RBAC_TESTING_GUIDE\|Access_Matrix"` across the repo — and update any found.

### The reference tables (Part 1 of RBAC.md)

1. **"The complete matrix"** — three tables:
   - *Roles*: slug, label, tier, self-assignable, requires-verification, alias. 13 rows from `ROLE_DEFINITIONS`.
   - *Role → capabilities*: 13 × 24 grid marking granted / denied / 🔒 safeguard-locked. **Generate from `permissions.ts`, do not hand-type** — it must reproduce `DEFAULT_ROLE_PERMISSIONS` plus `SAFEGUARD_DENY` exactly.
   - *Role → what they see*: nav dropdown entries, dashboard tabs, admin sidebar entries, homepage default hero mode. This is the table that did not exist and is what makes the walkthrough checkable.
### Updates applied to the guide as it moves in (Part 2 of RBAC.md)

2. **§0.1** — add `099`, `100`, `101` with the ordering note.
3. **§0.3** — counts stay 13 / 24 / 288, plus `role_entity_affinity`.
4. **§2.1** — the sidebar assertion becomes role-dependent now `chamber_admin` is admitted.
5. **§4.2** — a Safety Admin's admin *dashboard* now shows only usable quick actions (A2).
6. **§5.3** — the switcher check gains the homepage: switching context changes the default hero mode (B1) and the For You ordering (C1). Today it changes neither.
7. **New §8.11** — a student reaches `My Applications` from the navbar after starting a draft (A3).
8. **New §9.10** — `chamber_admin` logs in; `/admin` lands on Chamber Review, not analytics, and never loops (R1).
9. **New §6.12** — an event created with a country scores the geography term for a member in that country (C2).
10. **§16** — add the signed-out homepage check and the personalization-off check.
11. **Troubleshooting** — rows for the redirect loop, a vanished For You rail (personalization off vs. no signals), and a role term that never fires (migration applied but `role_entity_affinity` empty).
12. **Delete §"Known unrelated failure"** (R7). §17's health check gains: every `role_entity_affinity.role_slug` exists in `role_definitions`; `content_index` still returns four entities after the rebuild.

---

## Order of work

A → B → **gate** → C1 → C2 → C3 → D.

D is last so it documents what the code actually does rather than what it was meant to do.

## Verification

Commands: `npx vitest run` (one-shot; `npm test` is watch), `npx tsc -b` for types, `npm run build` for the full gate. **There is no eslint in this project** — no lint step exists to run.

1. `npx tsc -b` then `npx vitest run`. Baseline is a clean **227/227** (R7). Any failure is ours.
2. New `src/lib/permissions.test.ts` — no test exists for `permissions.ts` or `dashboard-tabs.ts` today, so this is greenfield. Match `src/lib/slug.test.ts`: explicit `import { describe, it, expect } from 'vitest'` despite `globals: true`, relative import of the unit, one `describe` per export, behavioural `it` names. Cover: no roles, one role, multiple roles with and without `active_role`, an `active_role` the account does not hold, a legacy `oecs` account, an admin-tier-only account (the A5 change), and a student against `canUseGrantApplications`.
3. **Gate before C.** Role walkthrough on A + B with the seven guide accounts. For each: navbar and dashboard rail agree; every visible CTA renders somewhere; Ctrl-K offers nothing the navbar hides; the hero opens on the expected mode with a usable CTA; the Overview quick-actions strip (B6) shows only usable actions. Chip check: a legacy `oecs` account shows **one** admin chip, not two (R8.3), in both the hero band and the collapsed top bar. Highest-risk — `chamber_admin` (newly admitted, must land on Chamber Review, must not loop), `safety_admin` (three sidebar entries, three matching quick actions, and now a "My CV" tab), `student` (`My Applications` visible again), `investor` (no project CTA, working "Post a funding call").
4. Signed out, reload `/` — must be identical to today: `grants` mode, deadline order, no For You rail, no role CTA. A difference here means B2 is wrong.
5. Personalization off at `/settings?tab=personalization` while signed in — homepage falls back to anonymous ordering rather than erroring.
6. Apply 100, **then apply it a second time** (guide §0.2). `SELECT * FROM rank_content('grant', ARRAY[…])` for a test user; `UPDATE profiles SET active_role = 'investor'`; confirm grant rows rise and the reasons array carries the new label.
7. Apply 101 twice. Confirm `SELECT DISTINCT entity FROM content_index` still returns four rows and the backfill left no bad `country_code`. Create an event through the form end to end, then confirm a member in that country sees the geography reason on it — **this is the check that R5 would have passed silently without**.
8. Rollback rehearsal: re-run `061_personalization_scoring.sql` and confirm the ranker returns to prior behaviour. `061` is fully idempotent (no `CREATE TABLE`, no `INSERT`, no `CREATE INDEX`), so this is a clean revert.
