# KTIP Implementation Plan — Features 6–14

**Date:** 2026-07-27
**Stack:** React 19 + TanStack Query 5 + react-router 7 + Supabase + Tailwind v4 + zod
**Next migration number:** `031`

Ordered by dependency: teams (6) unlocks the collaboration spec items; the rest are independent and can be built in any order or in parallel.

---

## Conventions every feature follows

Each feature is the same five-layer stack. Deviating from these patterns is the main way to create inconsistency, so all plans below assume them:

1. **Migration** — `supabase/migrations/NNN_name.sql`. `CREATE TABLE IF NOT EXISTS`, UUID PK, FKs to `profiles(id)` with `ON DELETE CASCADE`, `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, indexes named `idx_<table>_<col>`, RLS enabled with named policies. Admin check is always `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))`. `updated_at` via shared trigger `update_updated_at_column()`.
2. **Type** — add row interface + string-literal unions to `src/types/index.ts` (not `database.ts`, which is stale).
3. **Hook** — `src/hooks/use<Domain>.ts` using the `keys` factory from `src/queries/keys.ts` (`keys.list/detail/sub/all`), return shape `{ <domain>, loading: isPending, error, refetch }`, mutations invalidate `keys.all(domain)`.
4. **UI** — pages in `src/pages/<domain>/`, components in `src/components/<domain>/`, routes registered in `src/App.tsx` (public / `ProtectedRoute` / `AdminRoute` blocks).
5. **Admin tab** (when needed) — entry in `adminNavItems` in `src/components/layout/AdminLayout.tsx:17-29` + route under the `AdminLayout` children in `App.tsx:118-129` + page `src/pages/admin/<x>/Admin<X>Page.tsx`.

---

## 6. Project Collaboration / Team Model

**Unlocks:** Project Collaboration (#5), Team-based permissions (#30), Team members access project data (#34).

### Migration `031_project_members.sql`

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
```

One table handles both membership and the invite flow (`status = 'pending'` *is* the invite). The owner stays on `projects.owner_id` — do not duplicate the owner into `project_members`.

**Critical RLS detail — recursion guard.** Policies on `projects` that reference `project_members`, combined with policies on `project_members` that reference `project_members` (e.g. "members can see other members"), cause Postgres infinite-recursion errors. Create a `SECURITY DEFINER` helper first and use it in all policies:

```sql
CREATE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID, p_min_role TEXT DEFAULT 'viewer')
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = p_user_id AND status = 'accepted'
      AND (p_min_role = 'viewer' OR role = 'editor')
  );
$$;
```

**Policies:**
- `project_members` SELECT: project owner, the member themself, or `is_project_member(project_id, auth.uid())`.
- `project_members` INSERT: project owner only (`EXISTS (SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid())`) — invites are owner-initiated.
- `project_members` UPDATE: the invitee (`user_id = auth.uid()`) for accept/decline; owner for role changes.
- `project_members` DELETE: owner (remove member) or self (leave).
- `projects` — extend existing policies ([001_create_projects_table.sql:33-50](supabase/migrations/001_create_projects_table.sql)): `DROP` and recreate SELECT as `is_public = TRUE OR owner_id = auth.uid() OR is_project_member(id, auth.uid())`, and UPDATE as `owner_id = auth.uid() OR is_project_member(id, auth.uid(), 'editor')`. DELETE stays owner-only.
- Optionally extend `project_comments`/likes SELECT the same way for private projects.

### Frontend

- **Type:** `ProjectMember` interface (+ `ProjectMemberRole`, `ProjectMemberStatus` unions) in `src/types/index.ts`, with `user?: Profile` join.
- **Hook:** new `src/hooks/useProjectMembers.ts`: `useProjectMembers(projectId)` (join `user:profiles(*)`), `useMyInvites(userId)`, mutations `inviteMember`, `respondToInvite`, `updateMemberRole`, `removeMember`. Keys: `keys.sub('projects', 'members', projectId)`, invalidate `keys.all('projects')`.
- **Invite search:** reuse the `useSearchUsers` pattern from [src/hooks/useMessages.ts](src/hooks/useMessages.ts) (ilike on `display_name`, limit 10).
- **Notify invitee:** client-side insert into `notifications` with `type: 'project_invite'`, `link: '/projects/<id>'` — same fire-and-forget pattern as `ShareDocumentModal.tsx:129-137`. Bell UI needs zero changes (type-agnostic).
- **UI:**
  - "Team" widget on `ProjectDetailPage.tsx` sidebar, between the Project Owner widget (ends ~line 369) and Project Details widget (~line 371): avatars + roles, "Manage" button for owner.
  - `ManageTeamModal.tsx` in `src/components/projects/`: member list, role dropdown, remove, user-search invite.
  - Invite acceptance: pending-invite banner on the project page for the invitee (plus the bell notification link).
  - Permission checks: `ProjectDetailPage.tsx:37` currently `isOwner = project?.owner_id === auth.user?.id` — add `canEdit = isOwner || acceptedMembership?.role === 'editor'` and gate the Edit button (line 139) with it. `EditProjectPage` gets the same check.

**Estimate:** the largest feature — 1 migration, 1 new hook file, 1 modal, 1 widget, permission-check updates.

---

## 7. Project Engagement Completion (follows + view tracking)

### Migration `032_project_engagement.sql`

**Follows** — clone `project_likes` ([001:69-94](supabase/migrations/001_create_projects_table.sql)) exactly:

```sql
CREATE TABLE project_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
-- RLS: SELECT true / INSERT auth.uid() = user_id / DELETE auth.uid() = user_id
```

**Views** — counter column + RPC (cheaper than a per-view rows table; the generic `analytics_events` table from 022 is admin-only and not per-project):

```sql
ALTER TABLE projects ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

CREATE FUNCTION increment_project_view(p_project_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE projects SET view_count = view_count + 1 WHERE id = p_project_id;
$$;
```

`SECURITY DEFINER` so viewers don't need UPDATE rights on projects. If unique-viewer analytics are ever needed, add a `project_views` rows table later; don't start there.

### Frontend

- **Hook:** `useProjectFollow(projectId, userId)` — copy `useProjectLike` ([useProjects.ts:232-339](src/hooks/useProjects.ts)) including the optimistic-update flow (`onMutate` snapshot / `onError` rollback / `onSettled` invalidate). Keys: `keys.sub('projects','followed', ...)`, `keys.sub('projects','follow-count', projectId)`.
- **`FollowButton.tsx`** — copy [LikeButton.tsx](src/components/projects/LikeButton.tsx) (44 lines), render beside it in the engagement row (`ProjectDetailPage.tsx:210-222`).
- **View tracking:** `useEffect` in `ProjectDetailPage` calling `supabase.rpc('increment_project_view', ...)` once per session per project (guard with `sessionStorage` key `ktip_viewed_<id>` to avoid refresh inflation). Display count in engagement row and/or the Project Details sidebar widget (lines 375-393).
- **Optional wiring to notifications (do it — it makes feature 11 meaningful):** on project update, notify followers (`type: 'project_update'`); on new follower, notify owner.

**Estimate:** small — pure copy of the likes pattern + one RPC.

---

## 8. Networking & Connections

### Design decision: mutual connections (request → accept), not one-way follows
Directory already says "CONNECT NOW"; grievance/report flows assume person-to-person semantics; mutual matches the spec's "Networking & Connections".

### Migration `033_connections.sql`

```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
```

Duplicate-in-reverse (A→B and B→A) is prevented in the hook (check both directions before insert) plus a unique **ordered-pair index**: `CREATE UNIQUE INDEX idx_connections_pair ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));`

**RLS:** SELECT `auth.uid() IN (requester_id, addressee_id)`; INSERT `auth.uid() = requester_id`; UPDATE `auth.uid() = addressee_id` (accept/decline); DELETE either party (cancel request / remove connection).

### Frontend

- **Type:** `Connection` + `ConnectionStatus` in `src/types/index.ts`.
- **Hook:** `src/hooks/useConnections.ts`: `useConnectionStatus(myId, otherId)` (queries both directions, returns `none | pending_sent | pending_received | connected`), `useMyConnections(userId)`, `usePendingRequests(userId)`, mutations `sendRequest` / `accept` / `decline` / `remove`. Notifications on request + accept (`type: 'connection_request'` / `'connection_accepted'`, `link: '/profile/<id>'`).
- **UI:**
  - `ConnectButton.tsx` (state-aware: Connect / Pending / Accept-Decline / Connected✓) in `src/components/directory/`.
  - `DirectoryPage.tsx`: the "CONNECT NOW" tab (lines 191-203) is currently just a profile `Link` — make it the real button (keep the card link elsewhere).
  - `ProfilePage.tsx`: add `ConnectButton` to the `!isOwnProfile` action block (lines 195-207); add a Connections count/tab to the tab row (lines 254-288) listing connections as mini member cards.
  - Pending requests: surface via bell notifications + the profile Connections tab. A dedicated `/connections` page is optional polish.

**Estimate:** medium. Follows likes/grievances patterns; the only novel bit is the two-direction status logic.

---

## 9. Group Messaging UI

### Migration `034_group_messaging.sql`

```sql
ALTER TABLE conversations
  ADD COLUMN name TEXT,
  ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversation_participants
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'));
```

**Fix existing RLS holes while here** (found in [004_create_messages_table.sql](supabase/migrations/004_create_messages_table.sql)):
- `conversation_participants` INSERT is `WITH CHECK (auth.uid() IS NOT NULL)` — **anyone can add anyone to any conversation.** Replace with: self-insert, OR inserter is an admin participant of that conversation (use a `SECURITY DEFINER` helper `is_conversation_admin(conversation_id, user_id)` — same recursion guard rationale as feature 6; the existing self-referencing SELECT policy at 004:64-72 should also migrate to a `is_conversation_participant()` helper).
- No DELETE policy exists on participants — add: self (leave group) or conversation admin (remove member).
- `find_conversation_between` (004:124-133) matches *any* conversation containing both users — a group with both members breaks 1-to-1 dedup. Recreate with `WHERE is_group = FALSE` and participant count = 2.

### Frontend

Current display-name logic is hardcoded to "the other participant" in exactly two places — both must gain a group branch:
- `ConversationList.tsx:21-26` (`getOtherParticipant`) → `conv.is_group ? conv.name : other?.display_name`; group avatar = stacked initials or Users icon.
- `MessagesPage.tsx:57-62` (`getOtherUserName`) → same fallback; pass participant count to `ChatWindow` for a "N members" subheader (`ChatWindow.tsx:83-85`).

Changes:
- **Hook** ([useMessages.ts](src/hooks/useMessages.ts)): add `createGroupConversation(creatorId, participantIds[], name)` — insert conversation with `is_group: true, name, created_by`, insert creator as `role: 'admin'`, others as `member`. Keep `createConversation` for 1-to-1.
- **`NewConversationModal.tsx`:** multi-select (chips) instead of single-select; when >1 selected, show required group-name field; branch to `createGroupConversation`.
- **`MessageBubble.tsx`:** show sender display name above bubble when `is_group && !isOwn` (data already fetched — `sender:profiles(*)`).
- **New `GroupSettingsModal.tsx`:** rename (admin), add members (admin), remove member (admin), leave (anyone), member list with roles. Opens from ChatWindow header.
- **Realtime:** `useRealtimeMessages` only subscribes to `messages` — a group rename won't live-update. Acceptable; invalidate conversations on rename mutation.

**Estimate:** medium. Schema tiny; work is UI + RLS hardening.

---

## 10. Verification Workflow

Existing: `profiles.is_verified` + admin toggle ([AdminUsersPage.tsx:388-410](src/pages/admin/users/AdminUsersPage.tsx), mutation [useAdminDashboard.ts:130-142](src/hooks/useAdminDashboard.ts)) + badge on ProfilePage (lines 173-177). Missing: user-initiated request with documents.

### Migration `035_verification.sql`

```sql
CREATE TABLE verification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  document_paths TEXT[] NOT NULL DEFAULT '{}',
  user_note TEXT,
  admin_note TEXT,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: user INSERT/SELECT own (block new insert while one is pending — partial unique index `ON (user_id) WHERE status = 'pending'`); admin SELECT/UPDATE all.

**New storage bucket `verification-documents` — the first PRIVATE bucket** (all 5 existing buckets are public, image-only). `public: false`, mime `application/pdf` + images, 10MB, path `{userId}/...` with owner-scoped INSERT/SELECT policies (`storage.foldername(name)[1] = auth.uid()::text`, same as avatars) + admin SELECT policy. Admin UI reads via `createSignedUrl`.

### Frontend

- **User side:** "Verification" section in Settings (`SettingsPage.tsx` — new tab or inside `ProfileSettingsTab`): status display, doc upload, note, submit. Hook `useVerification.ts` (`useMyVerificationRequest`, `submitRequest`).
- **Admin side:** new tab **Verification** (`adminNavItems` + `/admin/verification` route + `AdminVerificationPage.tsx`): pending queue, signed-URL doc preview, approve/reject with note. Approve = update request + existing `toggleVerified(userId, true)` mutation; notify user (`type: 'verification_result'`).

**Estimate:** medium. Private-bucket policies are the only new territory.

---

## 11. Notification Preferences Table

Current state ([PreferencesTab.tsx](src/pages/settings/PreferencesTab.tsx)): localStorage blob `ktip_preferences`, shape `{ notifications: { email, messages, events, projects, forums }, privacy: {...} }`, enforced nowhere. Also: notifications INSERT RLS is `WITH CHECK (true)` and only 3 types are ever produced today (`video_invite`, `whiteboard_share`, `document_share`) — features 6–8 add the producers that make prefs meaningful.

### Migration `036_notification_preferences.sql`

```sql
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  messages BOOLEAN NOT NULL DEFAULT TRUE,
  events BOOLEAN NOT NULL DEFAULT TRUE,
  projects BOOLEAN NOT NULL DEFAULT TRUE,
  forums BOOLEAN NOT NULL DEFAULT TRUE,
  collaboration BOOLEAN NOT NULL DEFAULT TRUE,
  connections BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: own-row SELECT/INSERT/UPDATE. Columns (not JSONB) — matches existing UI shape, typed, defaults enforced in DB.

**Enforcement — DB trigger, not client checks** (client inserts can't be trusted to check):

```sql
CREATE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite','whiteboard_share','document_share') THEN collaboration
    WHEN NEW.type IN ('project_invite','project_update','project_follow') THEN projects
    WHEN NEW.type IN ('connection_request','connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    ELSE TRUE
  END INTO category_enabled
  FROM notification_preferences WHERE user_id = NEW.user_id;
  IF category_enabled = FALSE THEN RETURN NULL; END IF;  -- silently drop
  RETURN NEW;
END; $$;
CREATE TRIGGER check_notification_prefs BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enforce_notification_preferences();
```

No row in the table (or no match) = allow. Silently dropping is correct for fire-and-forget senders.

**Also tighten the `WITH CHECK (true)` INSERT policy** on notifications ([017_notifications.sql](supabase/migrations/017_notifications.sql)) at least to sanity constraints, or accept it consciously — flag for review.

### Frontend

- **Hook:** `usePreferences.ts` — `useMyPreferences(userId)` + `upsert` mutation (`.upsert()` on PK).
- **`PreferencesTab.tsx`:** swap localStorage read/write (lines 68, 107) for the hook. One-time migration: on first load with no DB row, seed from `localStorage['ktip_preferences']` then clear it. Privacy toggles (`profilePublic`, `showEmail`, `showCountry`) can stay local for now or get their own columns — decide during build; they're equally unenforced today.
- **Email column:** stored but dormant — no email-sending infra exists. Note it in UI ("coming soon") or hide the toggle.

**Estimate:** small-medium. Trigger is the only subtle part.

---

## 12. General Feedback Channel + FAQ Page

### Feedback — model on grievances (hook + admin tab + RLS), not the inline UAT flow

**Migration `037_feedback.sql`:** table `feedback` — id, `user_id` (nullable → allows anonymous), `category` CHECK (`bug`, `feature_request`, `general`, `content`), `subject`, `message`, `status` CHECK (`new`, `in_review`, `resolved`, `dismissed`) default `new`, `admin_note`, timestamps + `updated_at` trigger. RLS: INSERT `authenticated` (own `user_id` or NULL); SELECT own rows; admin SELECT/UPDATE all (`'oecs' = ANY(roles)`).

**Frontend:**
- Hook `useFeedback.ts` — copy [useGrievances.ts](src/hooks/useGrievances.ts) shape (`useMyFeedback`, `useCreateFeedback`, `useAdminFeedback`, `useUpdateFeedback`).
- `FeedbackModal.tsx` — category select + subject + message. Trigger: a "Send Feedback" item in the Navbar user menu and/or a small floating button in `MainLayout.tsx` next to the UAT button (line 25). Keep it lighter than the 3-step UAT survey.
- Admin tab **Feedback** → `/admin/feedback` → `AdminFeedbackPage.tsx` (copy `AdminGrievancesPage.tsx`: list, filter by status/category, status dropdown, note).

### FAQ — static first, DB later only if admins must edit it

[src/lib/help-content.ts](src/lib/help-content.ts) articles are already Q&A-shaped (`{ id, title: "How do I…?", content, tags }`). Cheapest correct implementation:
- Add a `FAQS` export (or an `id: 'faq'` category) to `help-content.ts`.
- New `/help/faq` route (public block in `App.tsx`) + `FAQPage.tsx`: accordion list grouped by category, reusing `HelpSearch`-style filtering; link card from `HelpCenterPage`.
- Cross-link the feedback modal ("Didn't find an answer? Send feedback").

**Estimate:** small. Both halves copy existing templates.

---

## 13. Integration Directory

Net-new, no existing code. Interpretation: an admin-curated public directory of external tools/services/partner platforms relevant to OECS entrepreneurs (name, description, category, link) — same content model as Resources.

**Migration `038_integrations.sql`:** table `integrations` — id, `name`, `description`, `category` (TEXT — seed suggested set: `funding`, `productivity`, `government`, `education`, `developer`), `logo_url`, `website_url`, `is_published` BOOLEAN default FALSE, `sort_order` INT default 0, timestamps + trigger. RLS: public SELECT where `is_published = TRUE`; admin full CRUD. Logos: reuse an existing public image bucket (e.g. `document-images`) — a dedicated bucket is unnecessary.

**Frontend — copy the Resources vertical wholesale:**
- Type `Integration` in `src/types/index.ts`.
- Hook `useIntegrations.ts` — copy [useResources.ts](src/hooks/useResources.ts) (public published list + `useAdminIntegrations` unfiltered + CRUD mutations).
- Public page `/integrations` (public route block): card grid, category filter, search, external-link buttons (`target="_blank" rel="noopener"`).
- Admin tab **Integrations** → `/admin/integrations` → `AdminIntegrationsPage.tsx` (copy `AdminResourcesPage.tsx`: create/edit modal, publish toggle).
- Navbar: add to the main nav or under a "Resources" grouping.

**Estimate:** small-medium. Pure pattern replication.

---

## 14. Achievement Badges

**Migration `039_badges.sql`:**

```sql
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'award',      -- lucide icon name
  color TEXT NOT NULL DEFAULT 'ocean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
```

RLS: both publicly SELECTable; **no client INSERT on `user_badges`** — awards only via `SECURITY DEFINER` trigger functions (prevents self-award).

**Awarding: DB triggers** (client-side awarding is spoofable and misses events). Seed definitions + one `award_badge(p_user_id, p_slug)` helper (idempotent via `ON CONFLICT DO NOTHING`, inserts a `notifications` row `type: 'badge_awarded'` — flows through the feature-11 prefs trigger automatically). Launch set:

| slug | trigger source |
|---|---|
| `first_project` | AFTER INSERT ON `projects` |
| `popular_project` (25 likes) | AFTER INSERT ON `project_likes` (count check) |
| `first_connection` | AFTER UPDATE ON `connections` when accepted (needs feature 8) |
| `community_voice` (10 forum posts/replies) | AFTER INSERT ON `forum_posts` / `forum_replies` |
| `verified_member` | AFTER UPDATE ON `profiles` when `is_verified` flips true |
| `event_goer` (first RSVP) | AFTER INSERT ON `event_rsvps` |

Backfill existing users' earned badges in the migration (one-off INSERT…SELECT per rule).

**Frontend:**
- Types `Badge`, `UserBadge` in `src/types/index.ts`.
- Hook `useBadges.ts`: `useUserBadges(userId)` (join `badge:badges(*)`), `useAllBadges()`.
- `AchievementBadge.tsx` — wrapper over [ui/Badge.tsx](src/components/ui/Badge.tsx), modeled on [ClimateBadge.tsx](src/components/ui/ClimateBadge.tsx), dynamic lucide icon + tooltip with description/date.
- `ProfilePage.tsx`: "Achievements" row in the info card below role badges (lines 218-227). Empty state: hide section.
- Optional polish (defer): badge showcase modal listing all badges incl. unearned.

**Estimate:** medium. Trigger functions are the bulk; UI is trivial.

---

## Suggested build order & migration numbers

| Order | Feature | Migration | Size | Depends on |
|---|---|---|---|---|
| 1 | 6. Project teams | `031_project_members.sql` | L | — |
| 2 | 7. Follows + views | `032_project_engagement.sql` | S | — |
| 3 | 8. Connections | `033_connections.sql` | M | — |
| 4 | 9. Group messaging | `034_group_messaging.sql` | M | — |
| 5 | 10. Verification | `035_verification.sql` | M | — |
| 6 | 11. Notification prefs | `036_notification_preferences.sql` | S-M | best after 6–8 (they create the notification producers) |
| 7 | 12. Feedback + FAQ | `037_feedback.sql` | S | — |
| 8 | 13. Integrations | `038_integrations.sql` | S-M | — |
| 9 | 14. Badges | `039_badges.sql` | M | `first_connection` needs 8; notify-on-award benefits from 11 |

Only real sequencing constraints: **11 after 6–8** (so the prefs map covers the new notification types) and **14 last** (badge triggers reference connections and benefit from the prefs trigger). Features 6–10, 12, 13 are mutually independent and parallelizable.

## Pre-existing issues to fix opportunistically

- `conversation_participants` INSERT RLS lets any authenticated user add anyone to any conversation (fix in feature 9).
- `notifications` INSERT RLS is `WITH CHECK (true)` — any user can notify any user (review in feature 11).
- `find_conversation_between` matches group conversations (fix in feature 9).
- `uat_responses` SELECT policy allows any authenticated user to read all survey responses — should be admin-only (quick standalone patch).
