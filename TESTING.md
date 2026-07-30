# KTIP — Test & Verification Plan

**Companion to:** [FEATURES.md](FEATURES.md)
**Purpose:** everything that must pass before calling the platform complete and the workflows correct.
**Current automated coverage:** 26 Vitest files (pure logic only — validation, delete-guard, site-search, personalization, venue-presence, cv-build, partner-payload, image-optimize, gantt, hero-images). **No E2E suite. No CI pipeline.** See §20.

---

## How to use this file

- `[ ]` = must pass before launch. `[~]` = should pass, non-blocking. `[!]` = negative test — the action must be **refused**.
- Every `[!]` must be tried **from the UI and again by calling Supabase directly** (browser console / REST) — hiding a button is not a security control, RLS is.
- Test each flow **twice**: happy path, then interrupted path (refresh mid-flow, back button, second tab, lost connection).
- Record: browser, role, screen width, and the exact error text when something fails.

---

## 1. Test Accounts You Need First

Create one account per role and keep the credentials in the team vault. Many bugs only appear at role boundaries.

| # | Role | Needed to test |
|---|---|---|
| 1 | `student` | Safeguarding rules, sponsor-gated grant applications, leaderboard exclusion |
| 2 | `faculty` | Sponsorship inbox, mentees/research tabs, institution membership |
| 3 | `mentor` | Mentees tab, venue mentor role |
| 4 | `investor` | Funding tab, `project:create` denial path |
| 5 | `entrepreneur` | Standard creator path |
| 6 | `private_sector` / `sme` | Chamber verification, Business tab |
| 7 | `researcher` | Research tab |
| 8 | `oecs` (admin) | Full admin console |
| 9 | `super_admin` | Locked permission-matrix cells |
| 10 | `safety_admin` | Moderation escalation |
| 11 | Chamber reviewer (scoped to one country) | `/admin/chamber` jurisdiction limits |
| 12 | Institution reviewer | `/admin/institutions` roster approval |
| 13 | Signed-out visitor | Public routes |
| 14 | Suspended account | Exclusion from leaderboard, directory, public profile |
| 15 | OAuth-only account (no password) | Secondary-email warnings, password flows |
| 16 | Virtual Campus account | SSO handoff + CV sync |

- [ ] All 16 exist and are documented
- [ ] At least two accounts hold **multiple roles** (tests the role switcher and tab narrowing)
- [ ] Seed data present: ≥6 projects, ≥6 events (past/live/upcoming), ≥6 grants (active/expired/external-URL), ≥6 forum posts, ≥3 resources, ≥3 integrations, ≥1 hackathon with a venue

---

## 2. Authentication & Account Lifecycle

### 2.1 Sign-up
- [ ] Step 1 blocks Next until display name, valid email, password (all checklist rules), and role are set
- [ ] Password checklist updates live and matches what the server actually enforces
- [ ] Step 2 and Step 3 are genuinely skippable; skipping still creates a usable account
- [ ] Optional fields entered in steps 2–3 actually persist to the profile
- [ ] Duplicate email produces a clear message, not a raw Postgres error
- [ ] "Check your email" state shows the exact address entered
- [ ] Confirmation link activates the account; a second click on the same link fails gracefully
- [ ] `signup` funnel events fire per step; `signup_success` fires once, not twice
- [!] Submitting with dev-tools-modified role values cannot grant a verification-gated role (student, faculty, sme, oecs)

### 2.2 Login
- [ ] Correct credentials → home, "Welcome back" toast, `login_success` analytics
- [ ] Wrong password → "Invalid email or password", not a stack trace
- [ ] Unconfirmed email → the confirm-your-email message specifically
- [ ] Simulated 15s hang → recovery banner appears; "Clear Session" clears localStorage and login then works
- [ ] Session survives a hard refresh and a browser restart
- [ ] Session expiry mid-session → redirected to login, not a blank screen

### 2.3 OAuth (Google + Microsoft)
- [ ] New OAuth user lands on `/onboarding`, not home
- [ ] Onboarding pre-fills name and avatar from the provider
- [ ] Returning OAuth user goes straight home
- [ ] User cancels at the provider → error toast, back on `/login`
- [ ] Callback with no session resolves within 10s to a sensible page (safety net)
- [ ] Avatar loads (check `referrerPolicy` — Google avatars 403 without it)

### 2.4 Virtual Campus SSO
- [ ] Start → callback → land completes and installs a session
- [ ] First-time user lands on `/cv?welcome=vc` with a CV built from the campus record
- [ ] Returning user lands on `/dashboard`
- [ ] Ticket is stripped from the URL before the POST (check history + address bar)
- [ ] Reloading `/auth/vc/land` after success does not re-consume or error confusingly
- [ ] Each `vc_error` code renders its specific copy: `not_configured`, `rate_limited`, `email_unverified`, `token_replayed`, `account_suspended`, `subject_bound_elsewhere`
- [ ] The error param is removed from the URL after being read once
- [!] A replayed ticket is rejected
- [!] A tampered assertion signature is rejected

### 2.5 Password & email management
- [ ] Forgot password sends the email; link opens `/reset-password`; new password works on next login
- [ ] Reset link cannot be reused
- [ ] Change password from Settings → old password stops working, new one works
- [ ] Change email sends confirmation to the **new** address; login only switches after confirmation

### 2.6 Secondary email
- [ ] Add → verification email arrives → confirm page requires a **click** (does not auto-confirm on load)
- [ ] After confirming, the secondary address signs in with the same password
- [ ] Resend works when the token expired; expired-state copy appears after 24h
- [ ] Remove clears it; the address can then be re-added
- [ ] OAuth-only account sees the "set a password first" warning
- [!] An address already registered to another KTIP account is rejected (`email_taken`)
- [!] A link scanner GET on `/verify-email/:token` does not verify anything

### 2.7 Account deletion
- [ ] Delete requires typing `DELETE` exactly
- [ ] After deletion: login fails, public profile 404s, and owned content behaves as designed (verify the intended cascade vs orphan policy for projects, events, posts, messages)
- [ ] Deleted user's name no longer appears in the directory or leaderboard

---

## 3. Global Navigation & Search

- [ ] Every navbar link and dropdown item resolves (no 404, no placeholder "being migrated" screen)
- [ ] Navbar hides on scroll down, returns on scroll up, and stays put while a menu is open
- [ ] Mobile hamburger menu contains everything the desktop bar does
- [ ] `Ctrl/⌘ K` focuses search from any page
- [ ] Search with 1 char shows places only; 2+ chars triggers content search; 3+ enables AI
- [ ] Results are grouped and keyboard-navigable (↑ ↓ Enter Esc)
- [ ] Rows with no destination expand to show steps instead of navigating
- [ ] "See all results" goes to `/projects?search=<term>` with the term applied
- [ ] Recent searches persist (max 5) and clear correctly
- [ ] AI toggle: on failure, local results remain visible and an error state is shown — the panel never goes blank
- [ ] Search results are **access-filtered**: a signed-out visitor never sees admin routes; an investor never sees "Create Project"
- [ ] Notification bell: unread count correct, dropdown lists recent items, mark-one-read and mark-all-read both work and persist
- [ ] A notification arrives **in realtime** without a refresh (second browser test)
- [ ] Notification links land on the right record (including old `/profile/:id` rows, which must redirect to `/u/:id`)
- [ ] Role switcher changes `active_role` and narrows the dashboard rail; it never widens access
- [ ] FAB: page-tour action appears only on pages with a tour, badge clears after completion; theme toggle flips instantly; messages toggle opens the panel

---

## 4. Discover (Home)

- [ ] All three modes (Grants / Projects / Events) load live data
- [ ] Auto-rotate advances every 6s and pauses on card hover, tab switch, window blur
- [ ] Clicking a non-adjacent card first rotates it into the rightmost slot, then expands — no visual hole in the strip
- [ ] Arrow keys and hover arrows navigate; counter matches the active index
- [ ] Hero image swap has no flash, jump, or duplicated card
- [ ] Empty mode (e.g. no active grants) shows the fallback copy and "Browse" CTA
- [ ] Stats wheel shows real counts, not `—`, once loaded
- [ ] All 7 bento cards navigate correctly
- [ ] Partner marquee loops seamlessly and pauses on hover
- [~] Verify on a slow 3G throttle — hero images are the heaviest asset on the site

---

## 5. Projects

### 5.1 List
- [ ] Search debounces and returns matching projects
- [ ] Each filter works alone: category, phase, Climate Action, hashtags
- [ ] Filters combine correctly (category + phase + climate returns the intersection)
- [ ] "Clear all filters" resets every control including the tag chips
- [ ] `?sort=` survives refresh, back/forward, and sharing the link
- [ ] With personalization **on**, default sort is For You; **off**, default is Newest
- [ ] Sidebar category counts match the filtered result set
- [ ] Empty result shows the right message (filters vs genuinely nothing)

### 5.2 Create / edit
- [ ] Required fields (title, category) block submit with visible errors
- [ ] Summary cap of 180 chars enforced, and the summary appears in the homepage hero
- [ ] Hashtags normalize (case, `#`, spaces) and cap at 10
- [ ] Details editor saves both standalone fields and grouped items, and they render on the detail page
- [ ] Private project is invisible to other members and to signed-out visitors
- [ ] Edit loads current values, saves, and returns to the detail page
- [!] Investor (no `project:create`) is blocked at `/projects/new` by `PermissionRoute` **and** by RLS on a direct insert
- [!] A non-owner, non-editor cannot open `/projects/:id/edit` (gets the Not authorized screen) and cannot update via the API

### 5.3 Detail & engagement
- [ ] View count increments once per browser session, not on every render
- [ ] Like toggles and persists across refresh
- [ ] Follow toggles and generates a notification for the owner (respecting their preferences)
- [ ] Share copies the correct absolute URL
- [ ] Comments post, appear, and delete (author only)
- [ ] Owner sees Edit + Delete; accepted editor sees Edit only; everyone else sees neither
- [ ] Delete dialog states the real impact (public status + collaborator count) and the count is accurate
- [ ] After delete, related likes/comments/documents/members are cleaned up (no orphans)
- [ ] Admin Feature toggle works and the project appears wherever featured projects surface

### 5.4 Team
- [ ] Owner can invite a member with a role (editor / viewer)
- [ ] Invitee sees it on `/invitations` **and** in the Team widget on the project
- [ ] Accept grants the stated access immediately; decline removes the invite
- [ ] Editor can edit but **cannot** delete the project
- [ ] Removing a member revokes their access immediately (test in their open session)
- [!] A member cannot escalate their own role

---

## 6. Events

### 6.1 List & calendar
- [ ] Calendar and Grid both render; the choice persists across reloads (localStorage)
- [ ] Multi-day events appear on **every** day they span
- [ ] An event starting before the visible grid still shows (31-day back-buffer)
- [ ] Auto-select lands on the nearest upcoming day that has an event
- [ ] Prev/next month, Today, and jump-to-next-event all work; jump crosses a month boundary correctly
- [ ] Day panel lists that day's events and links through
- [ ] Grid-only controls (Upcoming Only, Sort) are hidden in calendar view
- [ ] Collapsible search: expands on click, stays open while it has text, collapses on Escape / outside click when empty, and does **not** collapse when clicking the tutorial card
- [ ] First-time visitor gets the guided tour; it never starts mid-load; completing it stops the auto-start
- [ ] Every tour step anchors to a visible element (no orphaned highlight)

### 6.2 Create / edit
- [ ] Validation failure names the offending fields in a banner and scrolls back to the form
- [ ] The error banner appears **both** at the top and next to the submit button
- [ ] Virtual toggle hides the location field and stores "Virtual"
- [ ] Start date cannot be in the past; end date cannot precede start
- [ ] Capacity blank = unlimited
- [ ] Admin-only status control is invisible to non-admins; a non-admin cannot create a published-suppressed draft
- [ ] Challenge toggle stores the flag and the deadline, and the Challenge tab becomes usable

### 6.3 Detail & RSVP
- [ ] RSVP increments the count and shows "You're attending"
- [ ] Cancel RSVP decrements and restores the button
- [ ] At capacity, non-attendees see "Event is full" and the button is disabled
- [ ] Two people RSVPing simultaneously cannot exceed capacity (race test — enforce in SQL, not the client)
- [ ] Event **with** custom registration fields shows the form instead of a one-click RSVP
- [ ] Required custom fields block submission; submitted answers appear in the admin Registrations tab
- [ ] Submitting a registration creates a **submission receipt** in the dashboard
- [ ] Past events show the banner and disable registration
- [ ] Cancelled events show the cancelled badge everywhere they appear
- [ ] Organizer sees Edit/Delete; delete impact names RSVP count, venue, and challenge accurately
- [ ] Schedule, speakers, page sections, updates, and articles all render only when populated, in the intended order
- [~] "Contact Organizer" and sidebar "Copy Link" buttons — confirm they are wired (both look inert in the current markup)

### 6.4 Virtual venue
- [ ] Registered attendee enters the venue; unregistered user gets the "register first" screen with a route back
- [ ] Event without a venue shows the no-venue screen, not an error
- [ ] Floorplan renders the uploaded SVG; rooms whose `svg_zone_id` does not match appear under "Not on the map"
- [ ] Entering a room navigates and updates presence for everyone
- [ ] Leaving the page removes you from the room list within ~2 minutes
- [ ] Availability auto-switches to away after 5 minutes in a background tab
- [ ] "Do not disturb" pins the status and survives backgrounding
- [ ] Headcount matches the number of non-offline occupants
- [ ] Room chat delivers in realtime between two browsers
- [ ] Spectators cannot post; a closed room blocks posting for everyone
- [ ] Host can moderate (delete) messages
- [ ] Connection drop → reconnect restores presence without a duplicate ghost entry
- [ ] **Load test:** 20+ concurrent occupants across rooms — one socket, not one per room

---

## 7. Grants

### 7.1 Browse
- [ ] Type, Active-only, Climate, tag filters, and sort all work and combine
- [ ] Expired grants show the Expired badge and block applying
- [ ] Inactive grants show the inactive notice
- [ ] Grants with an external `application_url` open the external site instead of the wizard

### 7.2 Application wizard
- [ ] Each step's required fields block Next
- [ ] Auto-save fires ~5s after typing stops; the badge shows saving → saved
- [ ] Close the tab mid-application, return → the draft resumes at the same step with the same content
- [ ] Manual "Save Draft" works and toasts
- [ ] Stepper allows jumping backwards, and forwards only through completed steps
- [ ] Submit with an incomplete earlier step jumps back to it and names it
- [ ] Successful submit creates a receipt and routes to `/dashboard/submissions/:id`
- [ ] AI review panel returns feedback; on failure the wizard remains submittable
- [ ] Applying twice to the same grant is prevented (the page redirects with "already applied")
- [!] Direct navigation to `/grants/:id/apply` for an expired/inactive/external grant redirects out

### 7.3 Student sponsorship
- [ ] Student can draft freely
- [ ] Student **cannot** submit without an accepted sponsor — the DB refuses, not just the UI
- [ ] Nominating a faculty member notifies them and appears in their Sponsorship requests
- [ ] Faculty accept unblocks submission; decline keeps it blocked with clear copy
- [ ] Sponsorship state survives refresh on both sides

### 7.4 Admin review
- [ ] Approve / reject / mark-under-review each update the applicant's visible status
- [ ] Status change notifies the applicant
- [ ] Application detail modal renders both wizard-format and legacy applications
- [ ] Status filter is accurate; drafts never appear in the admin queue
- [ ] Grant delete: only OECS or the original creator sees the control; the impact copy is honest
- [!] A member cannot approve their own application by any route

---

## 8. Forums
- [ ] Board list shows accurate post counts
- [ ] Post search filters within the board
- [ ] Create post validates title and content
- [ ] Reply posts, appears immediately, and persists
- [ ] Author can delete their own post (with confirm) and their own replies
- [ ] Deleting a post removes its replies
- [ ] Pinned posts sort to the top and show the badge
- [ ] Non-author sees Report instead of Delete
- [ ] Report enters the moderation queue with a content snapshot taken at report time
- [!] A member cannot delete someone else's post or reply via the API
- [ ] **Content filter:** posting text matching an active moderation term triggers the configured severity behaviour (warn / quarantine / suspend+escalate)

---

## 9. Directory, Profiles, Leaderboard, Achievements

### 9.1 Directory
- [ ] Each filter works: search, role, country, skill, badge
- [ ] Connection counts respect the owner's audience setting (public / connections / private)
- [ ] Rank and points appear only for members who have earned badges
- [ ] `?member=<id>` opens the drawer; closing removes the param; reopening the same member works
- [ ] Connect button state is correct per member: none / pending / connected
- [!] Students do not appear where safeguarding rules exclude them

### 9.2 Connections
- [ ] Send request → recipient sees it on `/invitations` and gets a notification
- [ ] Accept creates a mutual connection visible on both sides
- [ ] Decline removes it cleanly
- [ ] Remove connection works from the dashboard tab and updates both counts
- [ ] Cannot send a duplicate request or connect to yourself

### 9.3 Public profile `/u/:id`
- [ ] Opens for a **signed-out** visitor
- [ ] Streak is visible on your own profile only, never on someone else's
- [ ] Suspended account returns "Member not found"
- [ ] Standing card is hidden entirely for a member with zero badges
- [ ] Showcase renders pinned trophies in the pinned order
- [ ] Message / Connect / Report actions appear only for signed-in non-self viewers
- [ ] Viewing others (not yourself) counts toward the `explorer` hidden achievement

### 9.4 Leaderboard
- [ ] All-time and monthly windows return different, plausible data
- [ ] Country and role boards scope to the viewer's own country/role and are disabled when unset
- [ ] Top-3 medal styling present, and rank is still readable without colour
- [ ] "You are #N of M" appears when outside the top 50
- [!] Students, opted-out members, and suspended accounts never appear — verify by calling `get_leaderboard()` directly
- [ ] Toggling the leaderboard opt-out in Settings removes you within one refresh

### 9.5 Achievements
- [ ] Badges award automatically from real actions (create a project, RSVP, apply for a grant, connect)
- [ ] Unlock modal fires once per badge, not on every page load
- [ ] Points and level match the badges held
- [ ] Progress bars show real progress toward unearned badges
- [ ] Category tabs and rarity chips filter correctly
- [ ] Hidden badges show only as masked "secret" cards, and their count is **not** leaked by the rarity filter
- [ ] Showcase editor caps at 5, seeds from what is actually pinned (not the 5 most recent), and saving does not silently replace the existing showcase
- [ ] Streak increments on consecutive-day activity and resets after a gap

---

## 10. CV / Résumé
- [ ] Screen and print renders show the same content
- [ ] Download B&W and Download Color each print the correct theme (theme must commit before `window.print()` — verify no wrong-theme capture)
- [ ] Sidebar bleed renders on the printed page with background graphics enabled
- [ ] Curated vs Full changes the screen only; the PDF is always complete
- [ ] Edit: every section saves; only touched sections are marked `manual`
- [ ] **Provenance test:** edit the summary → sync from Virtual Campus → summary survives, courses update
- [ ] **Provenance test:** delete a course → sync → the course stays deleted
- [ ] Sync reports accurate counts of synced courses and skipped sections
- [ ] Publish makes `/u/:id/cv` open for a signed-out visitor
- [ ] Unpublish makes it return "not public" — verify `public_resume()` returns nothing, not just a hidden UI
- [ ] A user with no CV sees the profile-derived draft and the explanatory banner

---

## 11. Dashboard
- [ ] Overview tiles show correct connection count and pending-invitation total (collab + project + connection)
- [ ] For You rail renders when personalization is on with signal, and renders nothing when off
- [ ] Recent submissions match `/dashboard/submissions`
- [ ] Personal calendar shows your events and deadlines only
- [ ] Tab rail is role-correct: investor sees Funding, mentor sees Mentees, faculty sees Mentees + Research, SME sees Business, admin sees Admin
- [ ] Selecting an `active_role` **narrows** the rail; unsetting restores all tabs
- [!] Direct navigation to `/dashboard/funding` without the investor role bounces to `/dashboard`
- [ ] Each tab's empty state is correct and offers the right CTA
- [ ] Submission receipt renders every field submitted, prints cleanly, and links to the source record
- [!] Another member cannot open your receipt by id

---

## 12. Collaboration Suite

### 12.1 Common to whiteboard / document / snippet
- [ ] New → first auto-save creates the record and swaps the URL to the real id (`replace`, so Back does not return to `/new`)
- [ ] Auto-save indicator cycles saving → saved with a timestamp
- [ ] Ctrl+S / Save button forces an immediate save
- [ ] Title edits save on blur
- [ ] Refresh mid-edit loses nothing beyond the last debounce window
- [ ] Delete from the list works and is confirmed
- [ ] Search filters the list
- [ ] Shared-with-me section shows the correct permission label
- [ ] View-only share: the editor is genuinely read-only and the "View Only" badge shows
- [!] A view-only collaborator cannot save changes via the API
- [!] A revoked collaborator loses access immediately in an already-open tab

### 12.2 Whiteboard
- [ ] Drawing persists across reload
- [ ] Shape counter is accurate
- [ ] Export PNG / SVG / JSON each produce a valid, openable file
- [ ] Export with an empty canvas does not crash
- [ ] Not-found id shows the ToolNotFound fallback, not a blank canvas

### 12.3 Document
- [ ] All toolbar formatting applies and persists: headings, bold/italic, lists, alignment, colour, sub/superscript, tables
- [ ] Link modal inserts and edits links
- [ ] Image modal inserts images that survive save/reload
- [ ] Export HTML and Markdown produce correct output; PDF prints cleanly
- [ ] Word and character counters are accurate
- [!] **XSS check:** paste `<script>` / `<img onerror>` HTML into the editor — it must not execute on save or on any viewer's screen

### 12.4 Code sandbox
- [ ] Each of the 6 languages highlights correctly
- [ ] Run executes JS and prints console output, including errors
- [!] Sandbox escape: `while(true){}`, `fetch()` to an internal URL, `document.cookie`, `localStorage` access — verify the isolation boundary
- [ ] HTML/CSS preview updates and closes
- [ ] Copy, download, reset-to-template, font-size cycle, theme toggle all work
- [ ] Language switch seeds a template only into an untouched **new** snippet, never over existing code
- [ ] One-time localStorage draft import: offers only real drafts, imports them, then never prompts again

### 12.5 Video
- [ ] Jitsi call connects with camera + mic across two devices
- [ ] Generate produces a unique room name; Share copies a working `?room=` link
- [ ] Opening the shared link pre-fills the room
- [ ] Invite: connections quick-pick and member search both work
- [ ] Invitees receive **both** a DM with the link and an in-app notification
- [ ] Notification is suppressed when the recipient disabled collaboration notifications
- [ ] Screen share and leave-call behave

### 12.6 Invitations
- [ ] All four sections populate: collaboration, project team, connection requests, sent
- [ ] Accepting a collaboration invite navigates straight to the resource
- [ ] Withdraw (in-app) and Revoke (email) both remove the pending invite
- [ ] Email invite arrives with a working `/join/:token` link
- [ ] Signed-out visitor on `/join/:token` is prompted to sign in and is returned to redemption afterwards
- [!] Each failure path renders its own copy: not found, expired (>14d), revoked, already used, wrong account
- [!] Redeeming with a different account than the one invited is refused

---

## 13. Documents & AI Extraction
- [ ] Upload to a project and to a grant; the file appears with correct metadata
- [ ] Download/open works from private storage (signed URL)
- [ ] Delete removes both the row **and** the storage object (verify the bucket)
- [ ] Extraction produces field proposals against the current record values
- [ ] Apply writes the proposed values to the parent record
- [ ] Extraction panel is hidden from someone who cannot edit the parent
- [ ] Access modal grants/revokes per-document access; request-access notifies the owner
- [!] A user without access cannot download the file by guessing the storage path
- [ ] Oversized and wrong-type uploads are rejected with a named reason

---

## 14. Resources, Integrations, Help
- [ ] Resources: search, type, category, climate, tags, sort — each and combined
- [ ] Resource detail: content renders, download link works, author opens the member panel
- [ ] Integrations tab: search, category, tags; `?search=` deep link pre-filters
- [ ] `/integrations` redirects to `/resources?tab=integrations`
- [ ] Tab switching preserves `?sort=`
- [ ] Help: search filters, result count is accurate
- [ ] Role-specific getting-started guide is highlighted for the viewer's role
- [ ] `?article=<id>` expands and scrolls to that article
- [ ] `?q=<text>` pre-fills search (arriving from global search)
- [ ] "Ask the assistant" opens the AI thread in the messaging panel and returns a useful answer
- [ ] FAQ search and accordion work; feedback modal opens and submits
- [ ] Every help article's quick links resolve

---

## 15. Messaging
- [ ] Start a DM from the directory, member panel, and public profile
- [ ] Message delivers in realtime to a second browser
- [ ] Unread indicators appear and clear correctly
- [ ] Group creation, naming, adding/removing participants, and group settings all work
- [ ] Panel: pin keeps it open on outside click; unpinned closes; Escape closes unless a modal is open
- [ ] Mobile: list ↔ chat toggle works
- [ ] AI assistant thread answers and does not mix into human conversations
- [ ] Long messages, links, and emoji render correctly; no layout break
- [!] A member cannot read a conversation they are not a participant in (query it directly)
- [ ] Message notifications respect the recipient's preference toggle

---

## 16. Safety, Moderation & Feedback
- [ ] Report a user: category required, description bounded 20–5000, invalid evidence URL rejected
- [ ] Confirmation modal requires the good-faith checkbox before enabling submit
- [ ] Submitted report appears in `/grievances/my-reports` and in the admin queue, and generates a receipt
- [ ] Report content (forum post etc.) captures a snapshot of the content at report time
- [ ] Auto-quarantine triggers once the configured number of distinct reporters is reached inside the window
- [ ] Reports by the **same** person repeatedly do not trip the threshold
- [ ] Admin actions each do what they say: dismiss, restore, remove content
- [ ] Removed content actually disappears for all viewers
- [ ] Severity matrix behaves: low warns the author, medium quarantines, high quarantines + suspends + escalates
- [ ] AI second opinion returns a verdict and changes nothing on its own
- [ ] Filter terms: plain term and POSIX regex both match; toggling active stops enforcement; a bad regex does not break posting platform-wide
- [ ] Feedback modal submits all four categories and appears in `/admin/feedback`
- [!] A non-admin cannot read the moderation queue or the grievance table

---

## 17. Settings
- [ ] Avatar: click-upload and drag-drop; >5MB rejected; non-image rejected; large image resized; new avatar appears everywhere immediately
- [ ] Profile save persists every field and survives refresh
- [ ] Self-assignable role chips toggle; **verification-granted roles are read-only** and are not stripped on save (this is the classic regression — save the profile and confirm student/faculty/sme roles survive)
- [ ] Skills/interests caps enforced
- [ ] Each notification toggle actually suppresses that notification type (test one end-to-end)
- [ ] Connection-count audience: set to private → another member sees no count; set to connections → only connections see it
- [ ] Leaderboard opt-out removes you from the public board
- [ ] Readable-font and dark-mode apply instantly and persist across reload
- [ ] Personalization: enabling adds For You to every list page and makes it default
- [ ] Turning off an individual signal (profile / activity / badges) visibly changes the For You ordering
- [ ] Reset to defaults clears everything
- [ ] Verification: 3-file cap, 10MB cap, accepted types only, rejected files named
- [ ] Pending state shows after submit; approved grants the badge; rejected shows the admin note and allows resubmission
- [~] Privacy toggles marked "local-only" (public profile, show email, show country) — confirm intent, or wire them server-side before launch

---

## 18. Admin Console

### 18.1 Access control
- [!] A non-admin hitting `/admin` and every `/admin/*` sub-route is refused
- [!] Every admin mutation is refused when called directly by a non-admin (RLS/RPC level)
- [ ] `safety_admin` and `super_admin` each see the intended subset

### 18.2 Per section
- [ ] **Dashboard** — every stat matches a manual DB count; all 7 charts render with real data; CSV export opens in Excel with correct headers
- [ ] **Projects** — search, feature/unfeature, featured count accurate
- [ ] **Events** — stat tiles accurate; publish/cancel/complete each change public visibility correctly and are confirmation-gated
- [ ] **Event → Registrations** — stats correct, per-row status change, bulk check-in, expandable custom answers, CSV export contains the custom fields
- [ ] **Event → Reg. Form** — all 7 field types render on the public form; required works; dropdown options save; reorder persists; deleting a field with existing answers behaves sanely
- [ ] **Event → Challenge** — toggle, deadline, criteria CRUD, reorder, weights; the public brief matches
- [ ] **Event → Venue** — enable, floorplan URL, room CRUD across all 8 kinds, audio modes, open/close lock, sponsor fields, `svg_zone_id` matching, one-click starter set, roster role assignment and removal
- [ ] **Event → Pages** — all 5 section types create/edit/reorder/publish/delete and render publicly in order
- [ ] **Event → Schedule / Speakers / Updates / Articles** — CRUD, publish toggles, public rendering
- [ ] **Users** — create user (login works with the given password), reset password (old fails, new works), edit roles, verify/unverify, delete
- [ ] **Roles & Permissions** — toggling a permission takes effect **immediately for that role's users** (verify in a second session); locked cells cannot be changed; audit trail records actor + timestamp; reset-to-defaults restores and is audited
- [ ] **Achievements** — description/check-value edits take effect; trophy art upload replaces the artwork everywhere
- [ ] **Moderation** — see §16
- [ ] **Institutions** — approve/reject with email domains; domain assignment actually gates student verification; roster approve/reject
- [ ] **Chamber** — reviewer sees **only** their jurisdiction's employers (verify by querying directly); verify/reject/revoke each notify and update the SME's status page
- [ ] **Grants** — see §7.4
- [ ] **Forums** — pin/unpin reflects publicly; delete cascades replies
- [ ] **Resources** — create/edit/publish/unpublish/delete; unpublished is invisible publicly
- [ ] **Grievances** — filters, notes, status transitions, resolver stamped
- [ ] **Feedback** — filters, status workflow, admin note
- [ ] **Verification** — signed document URLs open and **expire**; approve grants the badge; reject stores the note
- [ ] **Integrations** — CRUD; created-unpublished by default; publishing surfaces it publicly
- [ ] **Employers** — CRUD, slug generation, verification methods, sharing toggle, verification history
- [ ] **Partner API** — issue key (shown once only), copy, revoke; revoked key returns 401 from `/api/partner/v1/employers`; scope enforced
- [ ] **Analytics** — all 4 ranges return distinct data; funnel and conversion counts are plausible
- [ ] **UAT** — aggregates match raw responses; individual responses expand

---

## 19. Cross-Cutting Verification

### 19.1 Security (do these before launch, from a browser console with a low-privilege session)
- [!] Read another user's messages, receipts, grievances, verification documents, draft applications, private projects
- [!] Update another user's profile, project, event, grant, document
- [!] Grant yourself a role, a permission, or `is_verified`
- [!] Insert a project as an investor; insert a grant as a member; publish an event as a non-admin
- [!] Read the `employers` table outside your chamber jurisdiction
- [!] Call every `/api/*` endpoint unauthenticated and with a member (non-admin) token
- [!] Reuse a consumed VC ticket, invite token, email-verification token, password-reset link
- [ ] Storage buckets: verification documents and entity documents are **not** publicly listable
- [ ] Rate limits behave on login, alias add, invite send, AI endpoints
- [ ] No secrets in the client bundle (`grep` the build output for service-role keys)

### 19.2 Data integrity
- [ ] Delete a user → dependent rows behave per policy (no crashes on pages that referenced them)
- [ ] Delete a project/event/grant → likes, comments, RSVPs, documents, receipts, members handled
- [ ] Deleted-record references in notifications degrade gracefully (no white screen)
- [ ] Counters (views, RSVPs, connections, points, post counts) match a manual DB count after a session of activity
- [ ] Timezone: an event created at 23:30 local shows on the correct calendar day for a viewer in another timezone

### 19.3 Realtime & concurrency
- [ ] Messages, notifications, venue presence, and room chat all update without refresh
- [ ] Two tabs of the same account stay consistent
- [ ] Two users editing the same shared document — confirm the intended behaviour (last-write-wins vs merge) and that it is not silently destructive
- [ ] Simultaneous RSVP at capacity (see §6.3)
- [ ] Reconnect after network loss restores subscriptions

### 19.4 Responsive & browsers
- [ ] 320px, 375px, 768px, 1024px, 1440px, 2560px — no horizontal body scroll anywhere
- [ ] Wide tables (leaderboard, all admin tables, permission matrix) scroll **inside their own container**
- [ ] Chrome, Firefox, Safari, Edge (latest 2 versions each)
- [ ] iOS Safari and Android Chrome — including the venue, the code editor, and the document editor
- [ ] PWA installs and launches; offline shows a sensible state
- [ ] Print styles: CV, submission receipt

### 19.5 Accessibility
- [ ] Full keyboard traversal of every flow — no keyboard trap in modals, panels, or the tutorial overlay
- [ ] Visible focus ring on every interactive element
- [ ] Escape closes every modal, drawer, and dropdown
- [ ] Screen reader: form labels, error announcements, live regions for toasts, table headers
- [ ] Colour contrast passes AA in **both** light and dark themes
- [ ] Nothing conveyed by colour alone (leaderboard rank, badge rarity, status pills)
- [ ] Images have alt text; decorative images are `alt=""`
- [ ] Readable-font mode does not break any layout
- [ ] Run axe-core on every route and fix criticals

### 19.6 Performance
- [ ] Lighthouse ≥90 performance on Discover, Projects, Events, Dashboard
- [ ] Discover hero on throttled 3G — measure and set a budget
- [ ] Bundle size measured per route; the tldraw / CodeMirror / TipTap chunks load only on their own routes
- [ ] Directory and admin tables with 500+ rows stay responsive
- [ ] No N+1 request storms (Network tab on the directory and dashboard)
- [ ] Realtime with 20+ concurrent venue users

### 19.7 Error & empty states
- [ ] Every list has a distinct empty state for "no data" vs "no results for these filters"
- [ ] Every detail route 404s cleanly on a bad id
- [ ] `*` route shows the 404 page inside the layout
- [ ] Kill the Supabase connection → the app degrades with an error, not a white screen
- [ ] Error boundary catches a thrown render error and offers recovery
- [ ] No raw Postgres/RLS text ever reaches the user

---

## 20. Automation Gaps to Close

| Gap | Recommendation |
|---|---|
| **No CI** | GitHub Actions running `tsc -b`, `vitest run`, `vite build` on every PR |
| **No E2E** | Playwright covering the 10 critical paths in §21 |
| **No RLS test suite** | pgTAP or a scripted Supabase client run asserting every `[!]` in §19.1 |
| **No a11y automation** | axe-core via Playwright on every route |
| **No visual regression** | Playwright screenshots on Discover, Dashboard, CV print, admin tables |
| **No load test** | k6 against venue presence and the directory |
| **No error tracking** | Sentry (or equivalent) in production — currently nothing reports runtime failures |
| **No uptime/APM** | Status monitoring on `/api/*` and the Supabase project |
| **No dependency scanning** | Dependabot + `npm audit` in CI |
| **26 unit tests, logic only** | Add component tests for forms with complex validation: grant wizard, event create, form builder |

---

## 21. Release Gate — Critical Paths That Must All Pass

Run this list end to end on staging before any launch. A failure here blocks release.

1. **Sign up → confirm email → complete profile → land on Discover**
2. **Create a project → invite a collaborator → they accept → they edit → owner deletes**
3. **Create an event with a custom registration form → publish → a member registers → organizer sees the answers and checks them in**
4. **Apply for a grant → autosave → resume the draft → submit → receipt appears in the dashboard**
5. **Student drafts a grant application → nominates a sponsor → faculty accepts → student submits**
6. **Hackathon: enter the venue → join a room → chat with a second user → presence updates for both**
7. **Report a user → admin reviews → admin actions → reporter sees the status change**
8. **Admin revokes a permission → the affected user loses the affordance and the API refuses them**
9. **Build a CV → edit a section → sync from Virtual Campus → the edit survives → publish → open the public link signed out**
10. **Connect with a member → message them in realtime → both notification and unread state behave**

- [ ] All 10 pass on staging
- [ ] All 10 re-run on production after deploy (with test accounts, then cleaned up)
