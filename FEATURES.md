# KTIP — Platform Feature Inventory

**Generated:** 2026-07-30
**Stack:** React 19 + react-router (data router, lazy routes) · Supabase (Postgres + RLS + Realtime + Storage) · TanStack Query · Tailwind v4 · Vite · Vercel serverless (`/api/*`)
**Scope:** every route in [src/App.tsx](src/App.tsx), page by page, section by section, plus global chrome, admin console, and backend surfaces.

---

## 0. Global Chrome (present on every page)

### 0.1 Navbar — [src/components/layout/Navbar.tsx](src/components/layout/Navbar.tsx)
- Transparent overlay bar; auto-hides on scroll down, reappears on scroll up / near top
- Leading links: Home, Projects
- Dropdown groups with per-item icon + description:
  - **Events** — All Events, Virtual Hackathon, Event Calendar, Create an Event, My Events
  - **Funding** — Grants, My Applications, My Submissions
  - **Community** — Directory, Forums, Collaborate
- Trailing links: Resources & Integrations, Help
- Global search box with `Ctrl/⌘ K` shortcut hint
- Notification bell — unread count badge, dropdown list, mark-one-read, mark-all-read, realtime updates
- User menu — avatar, role labels, dashboard/settings/admin links, sign out
- Role switcher (`active_role`) for multi-role accounts
- Mobile hamburger menu with full nav + search
- Session recovery banner when a user exists but the profile fails to load

### 0.2 Global Search — [src/hooks/useGlobalSearch.ts](src/hooks/useGlobalSearch.ts), [src/components/layout/NavbarSearchPanel.tsx](src/components/layout/NavbarSearchPanel.tsx)
- Three result classes in one panel:
  - **Places & actions** — instant local fuzzy match over a static site map, filtered by what the viewer can actually reach (permissions/roles)
  - **Content** — one debounced round trip across seven Supabase tables (5 hits each)
  - **AI navigation** — brain toggle calls `/api/ai-search` to re-rank places and return a plain-language answer; degrades to local results on failure
- Recent searches (localStorage, max 5), suggested entries when empty
- Keyboard navigation, expandable "how-to" rows for actions with no destination URL
- "See all results" row → `/projects?search=`

### 0.3 Docked panels & overlays
- **Messaging panel** — [MessagingPanel.tsx](src/components/messages/MessagingPanel.tsx): non-modal docked chat (conversation sidebar + chat window), pin/unpin, Escape/outside-click close, mobile list↔chat toggle, new DM / new group modals, AI assistant thread
- **Member panel** — [MemberPanel.tsx](src/components/directory/MemberPanel.tsx): read-only member drawer opened from any member name anywhere; profile, badges, stats, connections, projects, events, Connect / Message / Report actions
- **Floating action button** — [FloatingActionButton.tsx](src/components/ui/FloatingActionButton.tsx): expandable cluster with page tour (when the page has one), light/dark toggle, messages toggle
- **Tutorial overlay** — [TutorialOverlay.tsx](src/components/tutorial/TutorialOverlay.tsx): anchored step-by-step walkthroughs (`data-tutorial` targets), auto-start for first-time visitors, completion tracking; Events page tour shipped
- **Achievement unlock modal** — celebratory popup when a badge is awarded, links to the gallery
- **Toasts**, **spy rail** (page-scroll section jump built from `data-spy` markers; `data-spy-off` mutes it for a page and `data-spy-skip` for one section, both keeping the marker the tutorials anchor to), **skip-to-content** link, **footer**

### 0.4 Cross-cutting systems
- Analytics provider — page views, feature events, funnels, conversions
- Page-title hook per route
- Personalization-aware sorting (`For You`) across list pages
- Light/dark theme + readable-font (Atkinson Hyperlegible) accessibility mode
- Route guards: `ProtectedRoute` (auth), `AdminRoute` (admin), `PermissionRoute` (single permission, e.g. `project:create`)
- Error boundary, PWA, lazy route splitting with placeholder fallback

---

## 1. Authentication & Onboarding

### 1.1 Login — `/login` — [LoginPage.tsx](src/pages/auth/LoginPage.tsx)
- Email + password sign-in with Zod validation
- 15s timeout guard; on timeout, offers a "Clear Session" recovery button for a stuck Supabase lock
- Distinct error copy for unconfirmed email vs bad credentials
- OAuth buttons (Google / Microsoft)
- OECS Virtual Campus SSO button
- Virtual-Campus failure codes rendered as human copy (`not_configured`, `rate_limited`, `email_unverified`, `token_replayed`, `account_suspended`, `subject_bound_elsewhere`); error stripped from URL after read
- Forgot-password and sign-up links
- `login_success` conversion analytics

### 1.2 Sign-up — `/signup` — [SignupPage.tsx](src/pages/auth/SignupPage.tsx)
- 3-step wizard with progress rail
  - **Step 1 (required):** display name, email, password (live password checklist), role picker
  - **Step 2 (optional):** organisation, industry select, Caribbean country select, bio with character counter — skippable
  - **Step 3 (optional):** skills tag input with suggestions, interests tag input, "openness to collaborate" multi-select
- Per-field validation on blur; submit re-validates and jumps back to the offending step
- OAuth sign-up on step 1
- "Check your email" confirmation state
- Funnel analytics per step + `signup_success` conversion

### 1.3 Forgot password — `/forgot-password`
- Email validation, reset-link dispatch, sent-confirmation state

### 1.4 Reset password — `/reset-password`
- New + confirm password with schema validation, success state, auto-redirect after 3s

### 1.5 OAuth callback — `/auth/callback`
- Waits for session + profile, routes new OAuth users to `/onboarding` and returning users home
- Reads provider errors from the URL hash
- 10s safety-net bailout

### 1.6 Virtual Campus landing — `/auth/vc/land` — [VcLandingPage.tsx](src/pages/auth/VcLandingPage.tsx)
- Trades a one-time ticket over POST for a Supabase session (`/api/auth/vc/session`); ticket stripped from URL before the request
- First-time users land on `/cv?welcome=vc` with a CV auto-built from their campus record; returning users go to `/dashboard`

### 1.7 Secondary-email confirmation — `/verify-email/:token`
- Click-to-confirm (never auto-confirms on load, to defeat link scanners)
- Typed failure copy: not found, expired, email taken, malformed, rate limited, server error

### 1.8 Onboarding — `/onboarding`
- Post-OAuth profile completion, 2 steps, pre-filled from the OAuth account (name, avatar, org, industry, country, bio)
- Role required; skills/interests/open-to optional with "skip for now"
- Bounces already-onboarded users home

---

## 2. Discover (Home) — `/` — [DiscoverPage.tsx](src/pages/discover/DiscoverPage.tsx)

### 2.1 Hero
- Full-bleed sticky hero with mode toggle: **Grants / Projects / Events** (live data)
- Ring carousel of portrait mini-cards (5 visible) with circular wrapping
- FLIP animation: the selected card physically expands into the hero image while the strip slides
- Auto-rotate every 6s; pauses on hover, tab hidden, window blur
- Keyboard ← → navigation, hover arrows, item counter (`03 / 06`)
- Active item panel: eyebrow, title, description, key details list, "View Details" CTA
- Empty state with "Browse <mode>" fallback

### 2.2 Bento feature grid
- 7 photo-backed cards with brand gradient wash: Projects, Events, Grants, Forums, Messages, Resources, Directory

### 2.3 Partners + stats
- Partner logo marquee (auto-scroll, pause on hover): OECS Commission, World Bank, CDB, CARICOM, UNDP, ECCB
- Auto-rotating stats wheel: Members, Projects, Active Grants, Events (live from `usePlatformStats`)
- Decorative flip watermark straddling the section boundary

---

## 3. Projects

### 3.1 Projects list — `/projects` — [ProjectsPage.tsx](src/pages/projects/ProjectsPage.tsx)
- Page hero with breadcrumb + "Create Project" CTA (hidden for roles without `project:create`; signed-out visitors keep it as a funnel to login)
- Debounced text search (300ms)
- Filters: category select, phase select (concept / prototype / funding / launch), Climate Action checkbox, hashtag chips
- Sort select persisted in the URL (`?sort=`) — For You / Newest / etc., defaults to For You when personalization is on
- Result count, skeleton grid while loading, empty state with CTA
- Sidebar widgets: Start a Project CTA, Recent Projects (or "Top Matches" under For You), Categories with live counts, tag cloud + Climate Action toggle

### 3.2 Project detail — `/projects/:id` — [ProjectDetailPage.tsx](src/pages/projects/ProjectDetailPage.tsx)
- Hero: image, phase badge, category, breadcrumb
- Owner/editor actions: Edit; owner-only: Delete with impact summary (public status + collaborator count) via `DeleteEntityControl`
- Admin action: toggle Featured
- Body: image, hashtags, summary lede, description, additional-details list
- Engagement row: Like, Follow, view count, Share (copy link)
- View tracking — one view per browser session per project
- **Documents panel** — attached files + AI-extracted editable copy (see §12)
- **Comments** section
- Sidebar: search projects, recent projects, project owner card (opens member panel), **Team widget** (accepted members, pending-invite accept/decline, manage-team modal for owner), project details (created, updated, visibility, views)

### 3.3 Create project — `/projects/new` (permission-gated `project:create`)
- Title, summary (180 chars, feeds the homepage hero), description
- Additional Details editor (standalone fields or grouped items)
- Category (required), phase, hashtags (max 10, normalized, with suggestions)
- Climate Action flag, public/private visibility
- Friendly copy when RLS refuses because the role lacks the permission

### 3.4 Edit project — `/projects/:id/edit`
- Same form pre-populated; editable by owner or accepted `editor` team member
- Non-authorized users get an explicit "Not authorized" screen
- Owner-only danger zone with delete + impact summary

---

## 4. Events

### 4.1 Events list — `/events` — [EventsPage.tsx](src/pages/events/EventsPage.tsx)
- **Two views** with persisted preference (localStorage): **Calendar** and **Grid**
- Calendar view: month grid, multi-day event spans, day panel with the selected day's events, prev/next month, Today, jump-to-next-event, auto-selects the nearest upcoming day with an event
- Grid view: cards, "Upcoming only" toggle, sort select (URL-persisted)
- Filters: event type, Climate Action, tag chips, collapsible search (expands on click, collapses on outside click/Escape)
- Guided tour auto-starts for first-time visitors (`data-tutorial` anchors across hero, filters, view toggle, results)
- Create Event CTA, result count, skeletons, empty state

### 4.2 Event detail — `/events/:id` — [EventDetailPage.tsx](src/pages/events/EventDetailPage.tsx)
- Hero: image, type badge, cancelled/past badges; organizer actions (Edit, Delete with impact: status, RSVP count, venue, challenge)
- Past-event banner
- Details grid: date (multi-day aware), time, location/virtual, capacity with "Full" marker
- Summary, tags, description, additional details
- **Virtual venue door** — prominent card linking to `/events/:id/venue` when enabled
- **Challenge brief** — objectives/constraints/deliverables/judging criteria + submission deadline
- **Custom page sections** rendered from the page builder (about / FAQ / venue / sponsors / custom)
- **Schedule timeline**, **speaker grid**
- **Updates** feed (typed announcements) and **Articles** feed (typed long-form)
- Sidebar: RSVP / cancel RSVP, or a **custom registration form** when the organizer built one; capacity enforcement; attendee count; organizer card; event details; share

### 4.3 Create event — `/events/new`
- Title, summary, description, tags, additional details
- Event type (hackathon / workshop / meetup / conference / demo day)
- Status control (draft/published) for admins only
- Virtual toggle or location, start date+time, optional end date+time, capacity
- Challenge toggle with optional submission deadline
- Climate Action flag
- Validation banner repeated top and bottom, with named fields and auto-scroll back to the form

### 4.4 Edit event — `/events/:id/edit`
- Same fields pre-populated for the organizer

### 4.5 Virtual Hackathon index — `/hackathons`
- Sections: **Happening now** (live rows with "Enter the venue"), **Coming up**, **Past** (latest 6)
- Live detection from start/end dates and published status
- Empty state linking to all events

### 4.6 Event venue floorplan — `/events/:id/venue`
- Single realtime presence channel drives the whole page (one socket, N rooms)
- Interactive floorplan (uploaded SVG) with room cards and occupancy
- Top bar: headcount, connection state, availability control (auto-away after 5 min in a background tab; "Do not disturb" pins it)
- "In the venue" lobby list of people not yet in a room
- Guarded states: event not found, venue not enabled, not registered (with route back to the event page)
- Organizer shortcut to venue setup when no rooms exist

### 4.7 Venue room — `/events/:id/venue/room/:roomId`
- Room header: kind label/icon, description, closed badge, sponsor strip (logo, name, link)
- Live occupant list for the room
- Realtime room chat with moderation for hosts; posting blocked for spectators and closed rooms
- Audio/video placeholder (LiveKit slated for phase 2)

---

## 5. Grants & Funding

### 5.1 Grants list — `/grants`
- Search, grant-type filter, Active-only toggle, Climate Action toggle, tag chips
- URL-persisted sort (deadline default; For You when personalized)
- Result count, skeletons, empty state
- "My Applications" CTA in the hero

### 5.2 Grant detail — `/grants/:id`
- Amount range display, deadline (with expiry styling), submitted-application count
- Description, additional details, eligibility requirements
- **Documents panel** (admin-editable)
- Apply widget with full state machine: already applied, draft in progress, expired, inactive, external application URL, no permission
- Student path: students may draft but need a faculty sponsor before submission — explained inline

### 5.3 Grant application wizard — `/grants/:id/apply`
- Multi-step wizard (`GRANT_APPLICATION_STEPS`) with clickable stepper
- Rich-text step fields, per-step required-field validation
- **Auto-save** every 5s with save-status badge; manual "Save Draft"
- Draft hydration and resume at the saved step
- Review step: full application preview, **AI review panel** (advisory feedback)
- **Sponsor nomination card** for students (nominate faculty, track acceptance)
- Submit validates every step, jumps to the first incomplete one, then routes to the generated **submission receipt**
- Guards: redirects when the grant is inactive/expired/external or already submitted

### 5.4 My applications — `/grants/my-applications`
- Application cards: grant title, type badge, project title, requested amount, executive-summary snippet, status badge (draft / pending / under review / approved / rejected)
- Continue-draft button, "View submitted copy" (receipt) link, View Grant link
- **Sponsorship requests inbox** for faculty/school partners — accept or decline student nominations
- Empty state → Browse Grants

---

## 6. Forums

### 6.1 Boards — `/forums`
- Board grid with icon, description, post count; skeletons and empty state

### 6.2 Board — `/forums/:slug`
- Board hero with description and "New Post"
- Debounced post search, post list with pinned indicators, empty state

### 6.3 Post detail — `/forums/:slug/:postId`
- Author strip (opens member panel), relative timestamps, pinned badge
- Full post content, replies list with per-reply delete for the author
- Reply composer with validation
- Author can delete the post; everyone else gets a **Report** button (content moderation pipeline)
- Sidebar: board info + post details (posted date, reply count)

### 6.4 New post — `/forums/:slug/new`
- Title + content with schema validation, publish/cancel

---

## 7. Directory, Profiles & Leaderboard

### 7.1 Member directory — `/directory`
- Filters: search, role, country, skill, **badge**
- Member bento cards: avatar, roles, country, first skill, connection count (respects the owner's visibility setting), rank + points (only once they have badges), up to 3 achievement badges with overflow count
- Inline **Connect** button per card
- `?member=<id>` opens the shareable member drawer; closing the drawer strips the param
- Batched stats RPC — one request for the whole page

### 7.2 Public member page — `/u/:id` (public)
- Identity header: avatar, verified check, country, organization/industry, connection count, join date, role badges
- Actions for other members: Connect, Message, Report
- **Standing** card: level, rank name, points, achievements, streak (streak is owner-only)
- **Showcase** of pinned trophies
- About: bio, skills, interests, "open to" collaboration chips
- Full achievements wall, project list, event list
- Powers the `explorer` hidden achievement (self-views excluded)

### 7.3 Leaderboard — `/leaderboard` (public)
- Time windows: all time / this month
- Boards: everyone / my country / my role
- Table: rank (medal styling for top 3), member with verified check, level, badge count, points
- "You are #N of M" standing row when outside the visible top 50
- Opt-out awareness with a link to the privacy setting
- Students, opted-out members and suspended accounts excluded in SQL

### 7.4 Legacy redirects
- `/profile/me` → `/dashboard`, `/profile/:id` → `/u/:id`

---

## 8. Achievements — `/achievements`
- Rank header: level, rank name, earned/total, points, streak, active days
- Progress bar toward the next rank, fireworks overlay once past level 1
- **Collections** grid with per-collection progress and completion state
- Category tabs with earned/total counters (Projects, Grants, Events, Community, Network, Collaboration, Knowledge, Profile, Dedication, Milestones, Secrets)
- Rarity filter chips
- Trophy grid with locked/unlocked art, progress toward each badge, earned dates
- **Hidden achievements** masked as "secret" cards until earned, and never revealed through filters
- **Showcase editor** — pin up to 5 trophies to your profile
- Link out to the leaderboard

---

## 9. CV / Résumé

### 9.1 My CV — `/cv`
- Dual render from one document: on-screen `ResumeScreen` + print-real A4 `ResumeSheet`
- Downloads via the browser print dialog (B&W or Color themes), no PDF library
- Screen-only **Curated ↔ Full CV** toggle (the PDF is always complete)
- **Sync from Virtual Campus** — pulls course history, reports how many courses synced and how many hand-edited sections were left alone. Says plainly when no campus could be reached instead of reporting "0 courses"
- **Auto-created on first view** — a member who never came from the Virtual Campus gets a real CV row built from their KTIP profile, public projects, badges and institution membership (`/api/cv/generate`)
- **Publish/unpublish** toggle for the public link
- Banner only when the automatic build could not run

### 9.2 Edit CV — `/cv/edit`
- Sections: identity (name, headline, location, phone, email, about), experience (repeatable roles with bullet points), education (repeatable), languages, professional skills, interests
- Courses, projects and awards are read-only records but removable — removal sticks across future syncs and regenerates
- **Provenance tracking**: three sources ranked `manual` > `vc` > `ktip`. Only fields you touch are stamped `manual`, so no generator overwrites your edits; the campus outranks KTIP's own guess at the same field; and editing one section never freezes another
- **Fill blanks from my profile** runs the same server-side generator as first view — one profile→CV mapping, not a second client-side copy
- Counter of how many sections will be marked as yours

### 9.3 Public CV — `/u/:id/cv` (public)
- Renders the full document for signed-out visitors, download in both themes
- Returns a "not public" state when the owner has not published it (enforced in SQL)

---

## 10. Dashboard — `/dashboard` — [DashboardLayout.tsx](src/pages/dashboard/DashboardLayout.tsx)

### 10.1 Shell
- Identity strip: avatar, name, verified check, role badges, connection count
- Sticky role-aware tab rail — tabs narrow to the **active role** context when one is selected
- Create Event CTA in the hero

### 10.2 Tabs
| Tab | Contents |
|---|---|
| **Overview** (index) | **For You** rail, **Recent submissions**, personal **calendar** |
| **Profile** | Read-only view of what other members see; badges, bio, skills, interests, open-to, join date; Edit → settings |
| **Progress** | Lazy-loaded activity timeline |
| **Achievements** | Links out to the full gallery (`/achievements`) |
| **Projects** | Projects you own, with create CTA gated on `project:create` |
| **Events** | Events you organize, create CTA |
| **Connections** | Connection cards, open member drawer, remove connection |
| **Submissions** | Every submitted copy (grant application, event registration, grievance) with kind badge, submitted date, "View copy" |
| **Funding** (investor) | Role-gated stub — deal flow |
| **Mentees** (mentor/faculty) | Role-gated stub |
| **Research** (faculty/researcher) | Role-gated stub |
| **Business** (sme/private_sector) | Links to Chamber verification |
| **Admin** (oecs/super_admin/safety_admin) | Links to the admin console |

### 10.3 Submission receipt — `/dashboard/submissions/:id`
- Full-page immutable copy of what was submitted, rendered as a document with sections
- Print / Save as PDF, link back to the source record, reference id in the footer
- RLS-scoped to the owner

---

## 11. Collaboration Suite

### 11.1 Hub — `/collaborate`
- Four tool cards: Whiteboard, Document Editor, Code Sandbox, Video Conference (with usage analytics)

### 11.2 Whiteboards — `/collaborate/whiteboards`, `/collaborate/whiteboard/new|:id`
- List: search, create, delete, **Shared with me** section with can-edit / view-only markers
- Editor: tldraw canvas, inline editable title (saved on blur), shape counter
- Auto-save with save-state indicator + manual Save (Ctrl+S)
- Export as PNG / SVG / JSON
- **Invite collaborators** modal (per-resource share with view/edit permission)
- Read-only mode and "Shared with you" badge for non-owners; not-found fallback

### 11.3 Documents — `/collaborate/documents`, `/collaborate/document/new|:id`
- List: search, create, delete, Shared-with-me section
- Editor: TipTap rich text on a paper-sheet canvas, full menu bar + formatting toolbar
- Link modal, image modal
- Export: PDF (print), HTML, Markdown
- Word/character counters, auto-save, share modal, permission-aware read-only mode

### 11.4 Code sandbox — `/collaborate/snippets`, `/collaborate/code/new|:id`
- Six languages: JavaScript/TypeScript, Python, HTML, CSS, JSON, Markdown
- CodeMirror editor with line/col/char metrics and 3 font sizes
- **Run** sandboxed JavaScript with a console output panel
- **Live preview** for HTML/CSS
- Copy, download as file, reset to language template, theme toggle
- Auto-save + manual save, share/invite modal, permission-aware read-only
- One-time **import of pre-database local drafts** from localStorage

### 11.5 Video conference — `/collaborate/video`
- Jitsi-embedded call
- Room name field + random name generator + copy shareable link (`?room=`)
- **Invite participants**: quick-pick from your accepted connections, debounced member search, chip selection
- Invitations send a DM with the join link *and* an in-app notification honoring recipient preferences
- Cross-links to the other collaboration tools

### 11.6 Sharing & invitations
- **ShareEntityModal** — invite existing members or email addresses, with view/edit permission
- `/invitations` — one inbox for **collaboration invites**, **project team invites**, **connection requests**, plus a **Sent — awaiting response** section with withdraw/revoke for both in-app and emailed invites
- `/join/:token` — public redemption of an emailed invite: stashes the token for unauthenticated visitors, redeems after sign-in, typed failures (not found, expired, revoked, already used, wrong account)

---

## 12. Entity Documents & AI Extraction
- Documents attach to **projects** and **grants** ([DocumentsPanel.tsx](src/components/documents/DocumentsPanel.tsx))
- Upload modal, document cards, download/open from private storage, delete with confirmation
- **Content modal** — the editable copy scraped out of the uploaded file
- **Extraction review panel** — AI-proposed field values shown against current record values, applied only by someone who can edit the parent (`/api/extract-fields`)
- **Access control**: per-document access modal for owners, request-access modal for everyone else

---

## 13. Resources, Integrations & Help

### 13.1 Resources & Integrations — `/resources` (tabs via `?tab=`)
- **Resources tab:** search, type filter, category filter, Climate Action toggle, tag chips, URL-persisted sort, card grid, empty state
- **Integrations tab:** search (deep-linkable via `?search=`), category filter, tag chips, integration cards; `/integrations` redirects here

### 13.2 Resource detail — `/resources/:id`
- Thumbnail, type/category/climate badges, summary, description, body content
- Download panel for the attached file
- Sidebar: author (opens member panel), publish date, tags, browse-all CTA

### 13.3 Help center — `/help`
- Search embedded in the hero, category filter, result counts
- **Getting-started guides per role** with numbered steps and quick links; the viewer's own role is highlighted
- Browse-by-topic accordion of all help articles
- Deep links: `?article=<id>` expands and scrolls to an answer, `?q=<text>` pre-fills the search (used by global search)
- Contact CTA: ask the AI assistant, send a message, visit forums

### 13.4 FAQ — `/help/faq`
- Searchable, category-grouped accordion
- "Didn't find an answer" panel opening the feedback modal

---

## 14. Safety, Moderation & Feedback (member side)
- **Report a user** — `/grievances/report/:userId`: category select, 20–5000 char description, evidence URL, "where did this happen" context, responsible-use warning, two-stage confirmation modal with an explicit good-faith checkbox
- **My reports** — `/grievances/my-reports`: status tracking (pending/reviewing/resolved/dismissed), category badges, link to the submitted copy
- **Report content** — inline `ReportButton` on forum posts and other content types, feeding the moderation queue
- **Feedback modal** — bug / feature request / general / content, reachable from FAQ and elsewhere
- **UAT feedback** — dedicated 12-question survey form and reminder popup

---

## 15. Settings — `/settings` (`?tab=` deep-linkable)

### 15.1 Profile tab
- Avatar upload with drag & drop, 5MB limit, automatic resize/optimization
- Display name, bio, organisation, industry, country
- **Self-assignable roles** as toggle chips; **verification-granted roles** shown read-only with an explanation of who can change them
- Skills, interests (tag inputs with suggestions and caps), openness to collaborate

### 15.2 Security tab
- Change password
- Change email (confirmation flow)
- **Secondary email** — add, resend, replace, remove; verified/pending/expired states; can sign in with the same password; warning for OAuth-only accounts
- **Delete account** — typed `DELETE` confirmation, explicit list of what is destroyed

### 15.3 Preferences tab
- Notification toggles: email, messages, events, projects, forums, collaboration, connections, achievements (persisted server-side and enforced by a DB trigger)
- Privacy: public profile, show email, show country
- **Leaderboard visibility** opt-out
- **Connection-count audience** radio group (enforced by RPC)
- Accessibility: readable font mode (applies instantly)
- Appearance: dark mode (applies instantly)

### 15.4 Personalization tab
- Master "Personalize what I see" toggle — adds a **For You** sort to every list page and makes it the default; nothing is ever hidden
- Topic picker (biggest ranking lever)
- Category chips (projects + resources), content-type chips namespaced per entity (resources / events / grants)
- Climate focus boost
- Signal switches: my profile, my activity, my badges — each individually disableable
- Signal summary panel, reset to defaults

### 15.5 Verification tab
- **Student/school verification card** — email-domain-based track approved by an institution
- **Identity verification (KYC)** — upload up to 3 documents (PDF/JPG/PNG/WebP, 10MB each) with drag & drop, optional note
- States: verified, pending review, rejected with admin note and re-submit

---

## 16. SME / Chamber — `/sme/verification`
- Business registration form: legal name, trading name, OECS member state (routes to that Chamber), registration number, industry, contact email/phone, website, description
- Post-submission status card: pending / verified / rejected / revoked with explanatory copy and the submitted facts
- Details deliberately immutable after submission (a verified badge must not sit over changed data)

---

## 17. Admin Console — `/admin/*` ([AdminLayout.tsx](src/components/layout/AdminLayout.tsx))

Sticky sidebar (desktop) / scrollable pill nav (mobile) across 20 sections.

### 17.1 Dashboard — `/admin`
- Stat tiles: users, events, active grants, forum posts, resources
- Climate Action rollup: projects / events / grants
- **Platform calendar**
- Charts: user growth over time, users by role, users by country, projects by category, projects by phase, events by type, grant application pipeline
- CSV export of the analytics set
- Quick actions and navigation cards

### 17.2 Projects — `/admin/projects`
- Searchable table (title, owner, phase, created), featured count tile, feature/unfeature toggle per project

### 17.3 Events — `/admin/events`
- Stat tiles (total / published / drafts / upcoming)
- Search + status + type filters
- Table with per-row actions: view, publish, cancel, mark complete (all confirmation-gated)

### 17.4 Event detail — `/admin/events/:id` — 10 tabs
- **Overview** — description, organizer, created/end dates; publish/cancel/complete actions
- **Registrations** — stats (confirmed / waitlisted / checked-in / cancelled), search, per-row status changes, **bulk check-in**, expandable custom-field answers, **CSV export**
- **Reg. Form** (form builder) — add/edit/reorder/delete fields across 7 types (text, long text, number, email, dropdown, checkbox, date), per-field placeholder, required flag, help text, dropdown option editor
- **Challenge** — enable/disable, submission deadline, and CRUD + reordering of criteria grouped as objectives, constraints, deliverables and judging criteria (with weights)
- **Venue** — enable the virtual venue, floorplan SVG URL, room CRUD across 8 room kinds (main hall, networking, workshop, help desk, sponsor booth, judging, stage, breakout), audio mode (open / moderated / listen-only), open/closed lock, sponsor fields, SVG zone id, one-click starter room set, plus roster management (assign participant/mentor/judge/organizer/spectator roles, remove members)
- **Pages** (page builder) — add/reorder/publish/unpublish/delete sections of 5 types: About, FAQ (Q&A repeater), Venue (name/address/map/directions), Sponsors (name/logo/website repeater), Custom
- **Schedule** — timeline item CRUD with start/end datetimes, location, linked speaker, session type
- **Speakers** — speaker CRUD with photo upload, title, bio, website
- **Updates** — typed announcement CRUD with publish toggle
- **Articles** — typed long-form CRUD with publish toggle

### 17.5 Users — `/admin/users`
- Search + role + verified filters
- Table: avatar, name, country, role badges, verified state
- Actions: edit roles, **reset password**, verify/unverify, delete user (all confirmation-gated)
- **Create user account** modal (email, display name, password, roles)

### 17.6 Roles & Permissions — `/admin/roles`
- Member list with search and per-member role assignment (verification-gated roles flagged)
- **Full permission matrix** — every permission × every role, grouped by category, toggled live and enforced by the database
- Locked cells for child-safety rules and for Super Admin (with explanatory tooltips)
- Scoped per-record roles shown as a separate, non-editable column group
- **Audit trail** modal of every grant/revoke with actor and timestamp
- **Reset to shipped defaults** (audited)

### 17.7 Achievements — `/admin/achievements`
- **Definitions tab** — edit badge descriptions and check values (via permission-checked RPCs)
- **Trophy art tab** — upload/replace shared trophy artwork per tier

### 17.8 Moderation — `/admin/moderation`
- Tabs: **Reports** (human), **Auto-flagged** (machine), **Filter terms**, **Settings**
- Queue filters by status (open/reviewing/actioned/dismissed) and severity
- Report detail: content snapshot at report time, reporter note, admin notes, **AI second opinion** (advisory only), and actions — dismiss, restore, remove content
- Filter terms: term or POSIX regex, severity, category, per-term active toggle, delete
- Settings: report-driven auto-quarantine toggle, report threshold, time window; fixed severity matrix documented inline (low = warn, medium = quarantine, high = quarantine + suspend + escalate)

### 17.9 Institutions — `/admin/institutions`
- Filter by kind (school / university / TVET / chamber) and status
- Review flow: approve/reject with note and **email domain** assignment
- Institution member roster with per-member approve/reject

### 17.10 Chamber review — `/admin/chamber`
- Scoped to the reviewer's chamber jurisdiction (RLS enforced)
- Employer submissions filtered by status; verify / reject / revoke with registration number and note

### 17.11 Grants — `/admin/grants`
- **Grants tab** — create/edit grant modal, activate/deactivate, ownership-aware delete with impact summary
- **Applications tab** — status filter, application detail modal (wizard preview or legacy key/value), approve, reject, mark under review

### 17.12 Forums — `/admin/forums`
- **Boards tab** — board cards with icon, description, post count, sort order
- **Posts tab** — search + board filter, pin/unpin, delete (cascades replies)

### 17.13 Resources — `/admin/resources`
- Resource table with create/edit modal, publish/unpublish, delete

### 17.14 Grievances — `/admin/grievances`
- Status + category filters, detail modal with admin notes, status transitions; resolver and resolved-at stamped automatically

### 17.15 Feedback — `/admin/feedback`
- Bug / feature request / general / content, status workflow (new → in review → resolved/dismissed), admin note

### 17.16 Verification — `/admin/verification`
- Pending/approved/rejected filter, signed URLs for uploaded identity documents, approve (grants the verified badge) or reject with note

### 17.17 Integrations — `/admin/integrations`
- Integration directory CRUD: name, summary, description, tags, category, website, logo, sort order; publish/unpublish; delete confirmation

### 17.18 Employers — `/admin/employers`
- Employer CRUD with auto-slug, legal/trading name, industry, full address, contact details
- Verification decisions with method (document review / registry lookup / manual attestation), status badges, sharing toggle, **verification history**

### 17.19 Partner API — `/admin/partner-api`
- Issue scoped API keys (`employers:read`); the key is shown once, never stored client-side
- Copy-to-clipboard, revoke with confirmation

### 17.20 Analytics — `/admin/analytics`
- Range selector: 7d / 30d / 90d / all time
- Summary tiles: total events, unique sessions, tracked pages, conversions
- Daily page-views chart, top pages, feature usage, pre-registration funnel, conversion breakdown, recent sessions

### 17.21 UAT feedback — `/admin/uat`
- Aggregated 12-question survey results with distributions, NPS-style rating, expandable individual responses, export

---

## 18. Backend Surfaces

### 18.1 Serverless endpoints (`/api`)
| Endpoint | Purpose |
|---|---|
| `admin/create-user`, `admin/delete-user`, `admin/reset-password`, `admin/api-clients` | Privileged user + key administration |
| `auth/vc/start`, `auth/vc/callback`, `auth/vc/session` | OECS Virtual Campus SSO handshake (signed assertion → one-time ticket → session) |
| `auth/add-alias`, `auth/verify-alias`, `auth/reset-alias`, `auth/login-alias` | Secondary-email lifecycle and alias sign-in |
| `ai-chat`, `ai-search`, `extract-fields`, `moderate` | AI assistant, AI navigation ranking, document field extraction, moderation second opinion |
| `invite/send` | Emailed collaboration invitations |
| `vc/sync` | Course-history sync into the CV |
| `cv/generate` | Builds the CV from KTIP's own records (profile, public projects, badges, institution membership) |
| `partner/v1/employers` | Public partner API for verified employer data |
| `delete-account` | Self-service account deletion |

### 18.2 Database (70+ migrations, all RLS-enabled)
Profiles · projects (+ members, likes, follows, comments, views, featured) · events (+ RSVPs, registration forms, schedule, speakers, articles, updates, page sections, challenge criteria, venue rooms/roster) · grants (+ application wizard, sponsorship) · forums · messaging (DM + group) · connections (+ count visibility) · notifications (+ preferences) · resources · integrations · whiteboards / documents / snippets (+ per-resource permissions, collab invites, email invites) · entity documents · submission receipts · grievances · feedback · UAT responses · verification requests · institutions & safeguarding · employers & chamber verification · partner API clients · RBAC permission matrix (+ audit) · moderation (terms, reports, settings) · achievements engine & definitions · leaderboard · personalization (+ scoring) · résumés · analytics · email aliases · VC SSO · ownership & upload cleanup.

---

## 19. Cross-Platform Conventions
- **Deletion guard** — every destructive action states its blast radius (`describeProjectDeletion`, `describeEventDeletion`, `describeGrantDeletion`) before confirming
- **URL as state** — sort, tab, member drawer, help article, search query all live in the query string so they are shareable and survive back/forward
- **Permission honesty** — affordances are hidden when the database would refuse them, and RLS refusals are translated into role-specific copy rather than raw Postgres errors
- **Public-by-design surfaces** — leaderboard, `/u/:id`, `/u/:id/cv` open for signed-out visitors, with visibility enforced in SQL rather than in the client
- **Auto-save everywhere it matters** — grant applications, documents, whiteboards, snippets, with visible save state
- **Skeletons + empty states** on every list surface, with a CTA where one makes sense
- **Realtime** — messages, notifications, venue presence, venue room chat
