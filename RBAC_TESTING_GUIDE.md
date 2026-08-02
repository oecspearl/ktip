# KTiP Roles, Safeguarding & Moderation — Testing Guide

A step-by-step walkthrough to confirm everything works. Written in plain English.
Work through it top to bottom — later sections depend on accounts created earlier.

**Time needed:** about 90 minutes for the full pass.

**What you need:**
- Access to the Supabase SQL editor for this project
- The app running (`npm run dev`) or a deployed URL
- A browser you can open several private/incognito windows in (one per test account)

Tick each box as you go. If something fails, note the step number — the
troubleshooting table at the end covers the common causes.

---

## Part 0 — Setup

### 0.1 Run the migrations

1. Open the Supabase SQL editor.
2. Open `supabase/migrations/063_rbac_permissions.sql`, copy the whole file, paste, Run.
3. Do the same for `064_institutions_safeguarding_chamber.sql`.
4. Do the same for `065_moderation.sql`.
5. Do the same for `090_admin_capability_and_event_permission.sql`.

> Order matters. 064 and 065 both use functions created in 063, and 090 uses
> `is_platform_admin()` from 063 plus helpers defined as late as 085.
>
> 090 retires the literal `'oecs' = ANY(roles)` test that 55 policies still
> carried, and adds the `event:create` permission. Run it against a database
> that is already up to 087 — it rewrites policies by name, so applying it to a
> partially-migrated database will silently skip whatever is not there yet.

- [ ] All four ran with no errors

### 0.2 Run them a second time

Paste and run all four again, in the same order.

- [ ] All four ran again with no errors

> This is the point of "idempotent". If a re-run fails, something is wrong —
> stop and fix it before continuing, because your production database will be
> migrated more than once over its life.

### 0.3 Check the tables and roles landed

Run this in the SQL editor:

```sql
SELECT count(*) AS roles FROM role_definitions;
SELECT count(*) AS permissions FROM permission_definitions;
SELECT count(*) AS matrix_cells FROM role_permissions;
SELECT count(*) AS audit_rows FROM role_permission_events;
```

Expected:
- `roles` = **13**
- `permissions` = **24**
- `matrix_cells` = **288** (12 non-legacy roles × 24 permissions)
- `audit_rows` = **0** — seeding must not write audit entries

- [ ] All four numbers match

### 0.4 Confirm your existing admin still works

Your current admin accounts have `'oecs'` in their roles. That slug was kept and
now points at Super Admin.

```sql
-- Replace with your admin's email
SELECT p.roles, has_permission(p.id, 'org:manage') AS is_admin
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'YOUR-ADMIN-EMAIL@example.com';
```

- [ ] `is_admin` comes back `true`
- [ ] Log in as that admin in the browser — `/admin` still loads
- [ ] All the old admin pages still work (Users, Events, Grants, Employers, etc.)

### 0.5 Create the test accounts

Sign up through the app's normal signup form for each of these. Use real
mailboxes or Supabase's "auto-confirm" setting so you can log in.

| Nickname | Suggested email | What they are |
|---|---|---|
| **ADMIN** | your existing admin | Super Admin |
| **SAFETY** | safety@test.com | Safety Admin |
| **TEACHER** | teacher@test.com | Faculty — sponsors students, supervises channels |
| **STUDENT** | student@test.com | School-verified student |
| **ADULT** | adult@test.com | Ordinary entrepreneur |
| **CHAMBER** | chamber@test.com | Chamber of Commerce reviewer |
| **BIZ** | biz@test.com | Business owner applying for SME status |

- [ ] All 7 accounts exist and can log in

### 0.6 Note down each account's user ID

```sql
SELECT u.email, u.id
FROM auth.users u
WHERE u.email IN (
  'safety@test.com','teacher@test.com','student@test.com',
  'adult@test.com','chamber@test.com','biz@test.com'
)
ORDER BY u.email;
```

Keep this list handy — several steps need the IDs.

- [ ] IDs written down

---

## Part 1 — The privilege escalation hole is closed

This was the most serious problem before the change: **any user could make
themselves a platform administrator** by saving their profile.

### 1.1 Try to make yourself an admin

1. Log in as **ADULT**.
2. Open the browser developer console (F12 → Console).
3. Paste and run:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: { user } } = await supabase.auth.getUser()
const { error } = await supabase.from('profiles')
  .update({ roles: ['oecs'] }).eq('id', user.id)
console.log(error)
```

**Expected:** an error mentioning that the role requires verification or an
administrator.

- [ ] The update was **rejected**
- [ ] Reload the page — ADULT still has no admin link in the menu

> If this succeeds, stop. Nothing else in this guide matters until it doesn't.

### 1.2 Try to verify yourself

Same console, as **ADULT**:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: { user } } = await supabase.auth.getUser()
console.log(await supabase.from('profiles')
  .update({ is_verified: true }).eq('id', user.id))
```

- [ ] Rejected with a message about platform admins

### 1.3 Try to un-suspend yourself

Same console, as **ADULT**:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: { user } } = await supabase.auth.getUser()
console.log(await supabase.from('profiles')
  .update({ is_suspended: false }).eq('id', user.id))
```

- [ ] Rejected

### 1.4 Normal profile saving still works

1. Still as **ADULT**, go to **Settings → Profile**.
2. Change the bio, add a skill, change the country.
3. Click Save.

- [ ] Saves successfully, no error
- [ ] Reload — the changes are still there

> This is the step people most often break. The profile form used to send the
> roles column on every save; if it still did, every save would now fail.

### 1.5 Picking your own ordinary role still works

1. As **ADULT**, in **Settings → Profile**, scroll to **Roles**.
2. You should see: Entrepreneur, Mentor, Investor, Private Sector, Researcher.
3. You should **not** see Student or Faculty as options.
4. Tick "Mentor" and Save.

- [ ] Saved successfully
- [ ] Reload — Mentor is still ticked

### 1.6 Verification-granted roles show as read-only

Give TEACHER the faculty role from the SQL editor (this runs as the database
owner, which is a trusted path):

```sql
UPDATE profiles SET roles = ARRAY['faculty']
WHERE id = (SELECT id FROM auth.users WHERE email = 'teacher@test.com');
```

1. Log in as **TEACHER** → Settings → Profile → Roles.

- [ ] "Faculty" appears in a separate section with a shield icon
- [ ] There is text explaining it can only be changed by an institution or admin
- [ ] It cannot be un-ticked
- [ ] Saving the profile still works and does not remove the Faculty role

---

## Part 2 — The Roles & Permissions admin tab

### 2.1 Find the page

1. Log in as **ADMIN**.
2. Go to `/admin`.
3. In the left sidebar, find **Roles & Permissions**.

- [ ] The sidebar item exists, between "Users" and "Moderation"
- [ ] Clicking it opens the page

### 2.2 The members table

At the top of the page there is a list of members.

- [ ] Every member is listed with their current roles as small pills
- [ ] Typing in the search box filters the list by name
- [ ] Each row has an "Edit roles" button

### 2.3 The permission matrix

Scroll down to **Complete permission matrix**.

- [ ] Permissions are rows, grouped under headings: Platform, Moderation &
      Safety, Grants & Funding, Projects, Community, Messaging, Verification
- [ ] Roles are columns, each labelled with its tier (Admin / Organization / Individual)
- [ ] There are extra amber columns on the right labelled PROJECT / INSTITUTION /
      EMPLOYER, showing a dash — these are per-record roles, not global ones
- [ ] Most cells are on/off switches
- [ ] The whole Super Admin column shows green ticks, not switches (always all-access)
- [ ] Safeguard rows have a shield icon next to the permission name

### 2.4 Locked cells

Look at the **Student** column.

- [ ] `dm:initiate` shows a **padlock**, not a switch
- [ ] `grant:apply` shows a padlock
- [ ] `grant:manage_funds` shows a padlock
- [ ] `moderation:action` shows a padlock
- [ ] Hovering a padlock shows a tooltip explaining it is a child-safety rule

---

## Part 3 — The matrix actually controls access

A permission matrix that only changes the interface is decoration. These steps
prove the toggles reach the database.

### 3.1 Turn a permission off and watch it bite

1. Log in as **ADULT** in one window. Make a forum post — confirm it works.
2. As **ADMIN**, open `/admin/roles`.
3. Find the row `forum:post`, column **Entrepreneur**. Switch it **off**.
4. Back in the ADULT window, reload and try to post again.

- [ ] The post is **rejected** with a permission error
- [ ] Turn the switch back **on** as ADMIN
- [ ] ADULT reloads and can post again

> If the post still succeeds with the switch off, the write is not going through
> RLS. That is a real failure, not a UI glitch.

### 3.2 The change is recorded

1. As **ADMIN**, on `/admin/roles`, click **Audit trail** (top right).

- [ ] Both changes from 3.1 appear (one revoked, one granted)
- [ ] Each shows the role, the permission key, who did it, and when
- [ ] The newest entry is at the top

### 3.3 Direct database writes cannot beat a safeguard

This is the important one. Run in the SQL editor:

```sql
-- Force-grant the student the ability to start DMs, bypassing the UI entirely
UPDATE role_permissions
SET allowed = TRUE
WHERE role_slug = 'student' AND permission_key = 'dm:initiate';

-- Now ask the system whether a student can actually do it
SELECT has_permission(
  (SELECT id FROM auth.users WHERE email = 'student@test.com'),
  'dm:initiate'
) AS student_can_dm;
```

- [ ] `student_can_dm` is **false**

Now put it back:

```sql
UPDATE role_permissions SET allowed = FALSE
WHERE role_slug = 'student' AND permission_key = 'dm:initiate';
```

- [ ] Reset done

### 3.4 Reset to defaults

1. As **ADMIN**, on `/admin/roles`, turn off three or four permissions across
   different roles.
2. Click **Reset to defaults**, confirm.

- [ ] A message says how many permissions were restored
- [ ] The matrix returns to its original state
- [ ] Clicking Reset again says "Already at defaults" (0 changed)
- [ ] The audit trail shows the reset changes

### 3.5 Non-admins cannot edit the matrix

1. Log in as **ADULT**.
2. Go to `/admin/roles` directly in the URL bar.

- [ ] An "Access Denied" screen appears

---

## Part 4 — Assigning roles

### 4.1 Assign from the admin tab

1. As **ADMIN**, `/admin/roles`, find **SAFETY** in the members table.
2. Click **Edit roles**.
3. Tick **Safety Admin**. Save.

- [ ] Success message appears
- [ ] The row now shows the Safety Admin pill

### 4.2 The Safety Admin can moderate but not run the platform

1. Log in as **SAFETY**.

- [ ] `/admin/moderation` loads
- [ ] `/admin/roles` shows Access Denied
- [ ] `/admin/users` is not reachable in a way that lets them create users

### 4.3 Assign the remaining test roles

As **ADMIN**, using `/admin/roles` → Edit roles:

- [ ] **ADULT** → Entrepreneur
- [ ] **BIZ** → Private Sector
- [ ] **TEACHER** → Faculty (already set in 1.6, confirm it shows)

Leave **STUDENT** and **CHAMBER** alone — they get their roles through
verification later, which is the point.

### 4.4 Unknown roles are rejected

In the SQL editor:

```sql
SELECT set_user_roles(
  (SELECT id FROM auth.users WHERE email = 'adult@test.com'),
  ARRAY['not_a_real_role']
);
```

- [ ] Returns `{"ok": false, "reason": "unknown_role", ...}`

---

## Part 5 — Switching between roles

For a user who is both a Faculty member and a business owner, for example.

### 5.1 Give one account two roles

As **ADMIN** in `/admin/roles`, edit **TEACHER** and tick **Private Sector** as
well as Faculty.

- [ ] TEACHER now shows two role pills

### 5.2 The switcher appears

1. Log in as **TEACHER**.
2. Click the avatar in the top-right corner.

- [ ] A section headed **ACTING AS** appears at the top of the menu
- [ ] It lists "All roles", "Faculty", "Private Sector"
- [ ] "All roles" has a tick next to it

### 5.3 Switching changes what you see

1. In that menu, click **Private Sector**.

- [ ] A message confirms "Now acting as Private Sector"
- [ ] **You are not logged out**
- [ ] Go to `/dashboard` — the Research and Mentees tabs are gone
- [ ] A **Business** tab is present

2. Switch back to **Faculty**.

- [ ] Research and Mentees are back
- [ ] Business is gone

3. Switch to **All roles**.

- [ ] Everything is visible again

### 5.4 You cannot switch into a role you do not have

In the browser console, as **TEACHER**:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: { user } } = await supabase.auth.getUser()
console.log(await supabase.from('profiles')
  .update({ active_role: 'super_admin' }).eq('id', user.id))
```

- [ ] Rejected with a message that the role is not held by this account

### 5.5 Single-role accounts see nothing extra

1. Log in as **ADULT** (one role only). Open the avatar menu.

- [ ] There is **no** "Acting as" section
- [ ] There is no stray divider line where it would have been

---

## Part 6 — Schools and student verification

### 6.1 Register a school

As **ADMIN**, in the SQL editor (this is normally done by the school itself,
but seeding one is faster):

```sql
INSERT INTO institutions (slug, name, kind, country_code, email_domains, status, created_by)
VALUES (
  'test-college-dm', 'Test College', 'university', 'DM',
  ARRAY['test.edu.dm'], 'pending',
  (SELECT id FROM auth.users WHERE email = 'teacher@test.com')
);
```

- [ ] Inserted with no error

### 6.2 Verify the school from the admin page

1. As **ADMIN**, go to **/admin/institutions**.
2. Set the status filter to **Pending**.

- [ ] "Test College" is listed, with its country and domain
3. Click **Review**.
- [ ] The email domain box shows `test.edu.dm`
4. Click **Verify institution**.
- [ ] Success message; the status pill turns to "verified"

### 6.3 A verified school must record who verified it

Try to fake a verified record:

```sql
INSERT INTO institutions (slug, name, kind, country_code, status)
VALUES ('fake-dm', 'Fake School', 'school', 'DM', 'verified');
```

- [ ] **Rejected** by the `institutions_verified_has_evidence` constraint

### 6.4 Make TEACHER a member of staff

```sql
INSERT INTO institution_members (institution_id, user_id, role, status, approved_at)
VALUES (
  (SELECT id FROM institutions WHERE slug = 'test-college-dm'),
  (SELECT id FROM auth.users WHERE email = 'teacher@test.com'),
  'educator', 'approved', now()
);
```

- [ ] Inserted

### 6.5 A student asks to be verified

The student's account email must be on the school's domain. Change STUDENT's
email to `student@test.edu.dm` (in Supabase → Authentication → Users → edit), or
create a new account on that domain and use it as STUDENT from here on.

- [ ] STUDENT's email ends in `@test.edu.dm`

1. Log in as **STUDENT**.
2. Go to **Settings → Verification**.

- [ ] A **Student verification** card appears at the top
3. Click **Verify with my school email**.
- [ ] Message: request sent to your institution for approval
- [ ] The card now says "Awaiting approval from your institution" and names Test College

### 6.6 An unrecognised domain is refused

1. Log in as **ADULT** (whose email is not on any school domain).
2. Settings → Verification → **Verify with my school email**.

- [ ] Message says no verified institution owns that domain

### 6.7 The school approves the student

1. As **ADMIN**, go to `/admin/institutions`, filter by **Verified**.
2. Find Test College, click **Roster**.

- [ ] STUDENT appears as a pending request
3. Click **Approve**.
- [ ] Success message

Confirm the role was granted:

```sql
SELECT roles FROM profiles
WHERE id = (SELECT id FROM auth.users WHERE email LIKE 'student@%');
```

- [ ] `student` is now in the array
- [ ] STUDENT gets a notification about the approval
- [ ] STUDENT's Settings → Verification card now says "Verified student" and
      explains the safeguards that apply

### 6.8 Age handling

Since 091 the student record no longer holds its own age. `birth_year` is a
projection of the date of birth the account declared at signup, kept in sync by
trigger, and nothing types it in by hand.

1. As **STUDENT** (signed up with a date of birth that makes them 15), Settings → Verification.

- [ ] There is **no** "year of birth" input — only a note saying the school's staff see the year
2. Confirm the projection:

```sql
SELECT s.birth_year, s.is_minor, EXTRACT(YEAR FROM a.date_of_birth) AS declared_year
FROM student_safeguarding s
JOIN account_age a ON a.user_id = s.user_id
WHERE s.user_id = (SELECT id FROM auth.users WHERE email LIKE 'student@%');
```

- [ ] `birth_year` equals `declared_year` — one age on file, not two
- [ ] `is_minor` is `true`
3. As **STUDENT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('student_safeguarding').update({ birth_year: 1990 }).eq('user_id', '<self>'))
```

- [ ] Refused — the self-UPDATE policy 064 gave them was dropped in 091
4. Have an admin correct the date of birth, then re-run the query in step 2:

```sql
SELECT set_account_date_of_birth('<student uuid>', '2006-03-04');
```

- [ ] `birth_year` follows to 2006 without anyone touching the safeguarding row
- [ ] `is_minor` flips to `false`

### 6.9 Safeguarding records are private

1. Log in as **ADULT**.
2. Console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('student_safeguarding').select('*'))
```

- [ ] Returns an empty list — an unrelated adult cannot read a minor's record

### 6.10 Age declaration at signup (088)

Separate from 6.8: that is the student-only birth *year* on the safeguarding
record. This is the date of birth **every** account created from migration 088
onwards declares. Accounts that existed before it are out of scope and must
never be prompted.

**Email signup**

1. Sign up with a fresh address. Step 1 asks for a **Date of Birth**.

- [ ] Leaving it empty blocks **Next**
- [ ] A date under 13 years ago is rejected with "You must be at least 13"
- [ ] A future date is rejected

2. Complete signup with a date that makes the account 15, confirm the email, sign in.

```sql
SELECT is_minor, requires_age_declaration, age_declared_at IS NOT NULL AS declared
FROM profiles WHERE id = (SELECT id FROM auth.users WHERE email LIKE 'teen@%');

SELECT date_of_birth, source FROM account_age
WHERE user_id = (SELECT id FROM auth.users WHERE email LIKE 'teen@%');
```

- [ ] `is_minor` `t`, `requires_age_declaration` `f`, `declared` `t`
- [ ] `account_age` holds the date, `source = 'signup'`
- [ ] Repeat with an adult date of birth: `is_minor` is `f`

**Google / Microsoft signup** — the path that has no birthday claim at all.

3. Sign up with a fresh Google account.

- [ ] The callback lands on `/onboarding`, not on the dashboard
- [ ] Step 1 shows a required **Date of Birth** field
- [ ] Navigating straight to `/dashboard` before submitting bounces back to `/onboarding`
- [ ] Submitting a date under 13 is refused
4. Submit a date that makes the account 16.

- [ ] `is_minor` `t`, `requires_age_declaration` `f`, `source = 'onboarding'`
- [ ] Signing out and back in goes straight to the dashboard — asked once, not every time

5. Repeat with Microsoft.

**Existing accounts stay out of it**

6. Sign in as **ADULT** (created before the migration).

- [ ] Goes straight to the dashboard, never sees the onboarding form
- [ ] `requires_age_declaration` is `f` and `account_age` has no row

**The declaration is private and write-once**

7. As **ADULT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('account_age').select('*'))          // other people's rows
console.log(await supabase.from('account_age').insert({ user_id: '<self>', date_of_birth: '1990-01-01' }))
console.log(await supabase.from('account_age').update({ date_of_birth: '1990-01-01' }).eq('user_id', '<self>'))
```

- [ ] SELECT returns only their own row, never anyone else's
- [ ] INSERT and UPDATE are both refused — there is no policy for either
8. As the teen account, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('profiles').update({ is_minor: false }).eq('id', '<self>'))
console.log(await supabase.from('profiles').update({ requires_age_declaration: false }).eq('id', '<self>'))
```

- [ ] Both fail with "age status is derived from the declared date of birth"

### 6.11 Adult / minor direct messages (088)

Distinct from Part 7, which covers the **student** role. This applies to any
account under 18, student or not — make the teen account an entrepreneur so the
064 student rule is not what is being observed.

1. As **ADULT**, open the teen's profile from the directory.

- [ ] No **Message** button on their directory card
- [ ] The member panel shows an explanation in place of the button
- [ ] `/u/<teen>` shows no Message button either
2. As the **teen**, open an adult's profile.

- [ ] Same in the other direction, with copy addressed to them
3. Force it from the console as **ADULT**:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: c } = await supabase.from('conversations').insert({ is_group: false, created_by: '<adult>' }).select().single()
await supabase.from('conversation_participants').insert({ conversation_id: c.id, user_id: '<adult>' })
console.log(await supabase.from('conversation_participants').insert({ conversation_id: c.id, user_id: '<teen>' }))
```

- [ ] The second participant insert is refused by RLS
4. Group conversations are unaffected:

- [ ] A group containing both the adult and the teen can be created, and both can post in it
5. Two minors may DM each other:

- [ ] A second under-18 account can open a 1-to-1 thread with the teen

---

## Part 7 — Student messaging restrictions

The core child-safety requirement: **no unmonitored one-to-one contact between
an adult and a student.**

### 7.1 An adult cannot start a DM with a student

1. Log in as **ADULT**.
2. Go to the member directory, find **STUDENT**, click Message.

- [ ] It fails with a clear message about supervised group channels
- [ ] No conversation is created

### 7.2 A student cannot start a DM with an adult

1. Log in as **STUDENT**.
2. Find **ADULT** in the directory, try to message them.

- [ ] Blocked

### 7.3 Even bypassing the interface fails

As **ADULT**, in the console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: { user } } = await supabase.auth.getUser()
const id = crypto.randomUUID()
await supabase.from('conversations').insert({ id, created_by: user.id })
const { error } = await supabase.from('conversation_participants').insert([
  { conversation_id: id, user_id: user.id },
  { conversation_id: id, user_id: 'PASTE-STUDENT-USER-ID' },
])
console.log(error)
```

- [ ] The participant insert is **rejected** by row-level security

### 7.4 A supervised group channel works

1. Log in as **TEACHER**.
2. Create a **group** conversation containing TEACHER, STUDENT and ADULT.

- [ ] The group is created
3. Send a message as TEACHER.
- [ ] Delivered
4. As **STUDENT**, open the group and send a message.
- [ ] Delivered
5. As **ADULT**, send a message in the group.
- [ ] Delivered

Check the channel is marked supervised:

```sql
SELECT name, is_group, is_supervised FROM conversations
ORDER BY created_at DESC LIMIT 1;
```

- [ ] `is_supervised` is `true`

### 7.5 Remove the supervisor and the channel closes

1. As **TEACHER**, leave the group (or remove yourself).
2. As **ADULT**, try to send another message in that group.

- [ ] The message is **rejected** — no designated educator is present any more

```sql
SELECT is_supervised FROM conversations ORDER BY created_at DESC LIMIT 1;
```

- [ ] Now `false`

### 7.6 Adult-to-adult messaging is unaffected

1. As **ADULT**, message **TEACHER** directly (one-to-one).

- [ ] Works exactly as before
- [ ] Both can reply

---

## Part 8 — Student grant applications need a sponsor

### 8.1 A student can look but not apply alone

1. Log in as **STUDENT**.
2. Go to **Grants**, open any active grant.

- [ ] The grant details are fully visible
- [ ] The button reads **Start Application**, not "Apply Now"
- [ ] Text underneath explains a faculty sponsor is required

### 8.2 A student can draft

1. Click **Start Application**, fill in a few fields, let it save.

```sql
SELECT status, sponsor_id, sponsor_approved_at FROM grant_applications
ORDER BY created_at DESC LIMIT 1;
```

- [ ] `status` is `draft`
- [ ] `sponsor_id` is empty

### 8.3 Submitting without a sponsor is refused

As **STUDENT**, in the console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('grant_applications')
  .update({ status: 'pending' }).eq('id', 'PASTE-APPLICATION-ID'))
```

- [ ] Rejected: "a student application requires a faculty or school sponsor"

### 8.4 Nominating a sponsor

1. As **STUDENT**, go back into the application and reach the final **Review** step.

- [ ] A **Faculty sponsor** card appears above the review panel
2. Search for **TEACHER** and click **Nominate**.
- [ ] Confirmation message
- [ ] The card now shows TEACHER with "Awaiting their acceptance"

### 8.5 Submitting with an unaccepted sponsor is still refused

Try 8.3's console snippet again.

- [ ] Rejected: "the nominated sponsor has not accepted this application yet"

### 8.6 The sponsor accepts

1. Log in as **TEACHER**.
2. Go to **Grants → My Applications**.

- [ ] A **Sponsorship requests** panel appears at the top
- [ ] STUDENT's application is listed with Accept / Decline
3. Click **Accept**.
- [ ] Confirmation; STUDENT receives a notification

### 8.7 Now the student can submit

1. As **STUDENT**, reload the application.

- [ ] The sponsor card shows a green "Accepted"
2. Submit the application.
- [ ] It submits successfully
- [ ] It appears under My Applications with status "pending"

### 8.8 A student cannot nominate just anybody

As **STUDENT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('grant_applications')
  .update({ sponsor_id: 'PASTE-ADULT-USER-ID', sponsor_approved_at: new Date().toISOString() })
  .eq('id', 'PASTE-APPLICATION-ID'))
```

Then try to move it to `pending`.

- [ ] Refused: the nominated sponsor is not permitted to sponsor applications
      (ADULT has no `grant:sponsor` permission)

### 8.9 Only the named sponsor can accept

As **ADULT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.rpc('review_grant_sponsorship', {
  p_application: 'PASTE-APPLICATION-ID', p_accept: true, p_note: null,
}))
```

- [ ] Returns `{"ok": false, "reason": "forbidden"}`

### 8.10 Ordinary adults are unaffected

1. As **ADULT**, apply for a grant normally.

- [ ] Button reads "Apply Now"
- [ ] No sponsor card appears
- [ ] The application submits in one go

---

## Part 9 — Chamber of Commerce and SME verification

### 9.1 Set up a chamber

```sql
INSERT INTO institutions (slug, name, kind, country_code, status, verified_at, verified_by)
VALUES (
  'dominica-chamber', 'Dominica Chamber of Commerce', 'chamber', 'DM', 'verified',
  now(), (SELECT id FROM auth.users WHERE email = 'YOUR-ADMIN-EMAIL@example.com')
);

INSERT INTO institution_members (institution_id, user_id, role, status, approved_at)
VALUES (
  (SELECT id FROM institutions WHERE slug = 'dominica-chamber'),
  (SELECT id FROM auth.users WHERE email = 'chamber@test.com'),
  'admin', 'approved', now()
);

UPDATE profiles SET roles = array_append(roles, 'chamber_admin')
WHERE id = (SELECT id FROM auth.users WHERE email = 'chamber@test.com');
```

- [ ] All three ran

Check the jurisdiction:

```sql
SELECT chamber_countries(
  (SELECT id FROM auth.users WHERE email = 'chamber@test.com')
);
```

- [ ] Returns `{DM}`

### 9.2 A business registers itself

1. Log in as **BIZ**.
2. Go to **/sme/verification** (also reachable from the dashboard "Business" tab).

- [ ] A registration form appears
- [ ] The member state dropdown lists OECS countries first
3. Fill it in, choose **Dominica**, submit.
- [ ] Success message
- [ ] The page now shows "Awaiting Chamber review"
- [ ] The details are shown read-only, with an explanation that they cannot be edited

### 9.3 The chamber sees it

1. Log in as **CHAMBER**.
2. Go to **/admin/chamber**.

- [ ] The page shows "Jurisdiction: DM"
- [ ] BIZ's submission is listed under Pending review

### 9.4 The chamber verifies it

1. Click **Review** on BIZ's row.
2. Enter a registry number, add a note.
3. Click **Verify SME**.

- [ ] Success message
- [ ] The status becomes "verified"

Check the effects:

```sql
SELECT verification_status, verification_method, verified_at, verified_by
FROM employers ORDER BY created_at DESC LIMIT 1;

SELECT from_status, to_status, method, actor_id
FROM employer_verification_events ORDER BY created_at DESC LIMIT 1;

SELECT roles FROM profiles
WHERE id = (SELECT id FROM auth.users WHERE email = 'biz@test.com');
```

- [ ] `verification_method` is `chamber_attestation`
- [ ] `verified_at` and `verified_by` are filled in
- [ ] An audit event row exists
- [ ] BIZ now has the `sme` role
- [ ] BIZ received a notification

### 9.5 BIZ gains SME abilities

1. Log in as **BIZ**.

- [ ] `/sme/verification` now shows "Verified SME"
- [ ] BIZ can create projects and appears as available for mentorship

### 9.6 A chamber cannot reach outside its own country

Create a business in another country:

```sql
INSERT INTO employers (slug, legal_name, country_code, contact_email, verification_status, created_by)
VALUES ('other-country-co-lc', 'Other Country Co', 'LC', 'other@test.com', 'pending',
        (SELECT id FROM auth.users WHERE email = 'adult@test.com'));
```

As **CHAMBER**, in the console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.rpc('set_employer_verification_by_chamber', {
  p_employer: 'PASTE-THE-LC-EMPLOYER-ID', p_status: 'verified',
  p_registration_number: null, p_note: null,
}))
```

- [ ] Returns `{"ok": false, "reason": "wrong_country", "country": "LC"}`
- [ ] The St. Lucia business does **not** appear in the CHAMBER's `/admin/chamber` list

### 9.7 A random user cannot verify businesses

As **ADULT**, run the same console snippet against BIZ's employer.

- [ ] Returns `{"ok": false, "reason": "forbidden"}`

### 9.8 A business cannot verify itself

As **BIZ**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('employers')
  .update({ verification_status: 'verified' }).eq('created_by', (await supabase.auth.getUser()).data.user.id))
```

- [ ] Rejected — there is no self-edit path for employers

---

## Part 10 — Reporting content

### 10.1 Report buttons exist

1. Log in as **ADULT**.
2. Open a forum post written by someone else.

- [ ] A small flag icon appears in the page header actions
3. Look at a reply from someone else.
- [ ] A flag icon appears next to the delete area
4. Open a conversation and hover over a message from the other person.
- [ ] A flag icon appears next to their name

### 10.2 You cannot report yourself

1. Look at your own post, your own reply, your own message.

- [ ] No flag icon appears on any of them

### 10.3 Signed-out visitors see no report button

1. Open a forum post in a private window without logging in.

- [ ] No flag icon

### 10.4 The report dialog

1. As **ADULT**, click the flag on someone else's post.

- [ ] A dialog opens with six categories:
      Hate speech or harassment · Bullying · Inappropriate or explicit ·
      Spam or scam · Unsolicited contact or grooming risk · Personal information exposed
- [ ] Text at the top says reports are confidential
- [ ] The Submit button is disabled until a category is chosen
2. Choose **Unsolicited contact or grooming risk**.
- [ ] A red warning appears explaining this is high priority and goes to safety
      admins and the student's school
3. Add an optional note and submit.
- [ ] Confirmation message

### 10.5 Reporting the same thing twice is harmless

1. Report the same post again as **ADULT**.

- [ ] It appears to succeed with no error shown to the user

```sql
SELECT count(*) FROM content_reports
WHERE target_type = 'forum_post' AND target_id = 'PASTE-POST-ID';
```

- [ ] Only **one** report row exists (one per person per item)

### 10.6 The report reaches the moderation queue

1. Log in as **SAFETY**.
2. Go to **/admin/moderation** → **Reports** tab.

- [ ] The report is listed with its category and a snippet of the content
- [ ] Clicking it opens a detail panel showing the content as it was when reported

### 10.7 Ordinary users cannot read the queue

As **ADULT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('content_reports').select('*'))
```

- [ ] Only ADULT's **own** reports come back — not other people's

---

## Part 11 — Automatic quarantine from reports

Default: **3 different people** reporting the same item within **24 hours**.

### 11.1 Lower the threshold for testing

1. As **SAFETY**, go to `/admin/moderation` → **Settings**.

- [ ] "Enable report-driven auto-quarantine" is on
- [ ] "Reports before quarantine" shows 3
- [ ] "Window (minutes)" shows 1440
2. Change the threshold to **2**. Click away from the field.
- [ ] "Threshold saved" message

### 11.2 Trigger it

1. As **ADULT**, post something in a forum. Note the post.
2. As **TEACHER**, report that post.
3. As **CHAMBER**, report the same post.

- [ ] After the second report, the post disappears from the forum for
      everyone except its author and moderators

```sql
SELECT status, quarantined_at FROM forum_posts ORDER BY created_at DESC LIMIT 1;
```

- [ ] `status` is `quarantined`

### 11.3 The author still sees it

1. Log in as **ADULT** (the author).

- [ ] The post is still visible to them

### 11.4 Moderators see it

1. As **SAFETY**, `/admin/moderation`.

- [ ] The item is in the queue with a report count

### 11.5 Restore it

1. As **SAFETY**, open the report and click **Restore**.

- [ ] Success message
- [ ] The post reappears in the forum for everyone

```sql
SELECT action, actor_kind FROM moderation_log ORDER BY created_at DESC LIMIT 3;
```

- [ ] A `restored` entry with `actor_kind = 'admin'` exists

### 11.6 Remove content

1. Repeat 11.2, then click **Remove content** instead.

- [ ] Status becomes `removed`
- [ ] Even the author no longer sees it in the forum listing

### 11.7 Put the threshold back

- [ ] Set "Reports before quarantine" back to **3**

---

## Part 12 — The automated content filter

Runs the moment content is written, before anyone can see it.

### 12.1 Low severity — warn only

1. As **ADULT**, write a forum post containing an email address, e.g.
   `contact me at someone@example.com`.

- [ ] The post **is published** and visible
- [ ] ADULT receives a notification: "Community guidelines reminder"

```sql
SELECT action, severity FROM moderation_log ORDER BY created_at DESC LIMIT 1;
```

- [ ] `flagged` / `low`

### 12.2 Medium severity — quarantined

1. As **ADULT**, write a forum post containing a phone number, e.g.
   `call me on +1 767 555 0199`.

- [ ] The post does **not** appear in the forum for other users
- [ ] The author can still see it

```sql
SELECT status, moderation_severity FROM forum_posts ORDER BY created_at DESC LIMIT 1;
```

- [ ] `quarantined` / `medium`
- [ ] It appears in `/admin/moderation` under **Auto-flagged**

### 12.3 High severity — quarantine, suspend, escalate

1. As **STUDENT**, send a message in the supervised group from 7.4 containing
   `don't tell your parents about this`.

- [ ] The message does not appear for other participants

```sql
SELECT status, moderation_severity FROM messages ORDER BY created_at DESC LIMIT 1;

SELECT is_suspended, suspension_reason FROM profiles
WHERE id = (SELECT id FROM auth.users WHERE email LIKE 'student@%');

SELECT action, severity FROM moderation_log
ORDER BY created_at DESC LIMIT 4;
```

- [ ] Message status is `quarantined`, severity `high`
- [ ] The author is now `is_suspended = true`
- [ ] The log contains `quarantined`, `suspended` and `escalated`
- [ ] **SAFETY** received a notification titled "High-severity content flagged"
- [ ] **TEACHER** (staff at the student's school) received a notification about
      a safety escalation for one of their students

> Test this in the group channel, not a real DM — the point is that even inside
> a supervised channel the filter still runs.

### 12.4 A suspended account cannot post

1. Log in as the suspended account.
2. Try to write a forum post, a reply, a project, or a message.

- [ ] All of them are refused

```sql
SELECT has_permission(
  (SELECT id FROM auth.users WHERE email LIKE 'student@%'), 'forum:post'
);
```

- [ ] Returns `false` — suspension removes every permission at once

### 12.5 Lift the suspension

As **SAFETY** (who has `moderation:escalate`), console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.rpc('set_user_suspension', {
  p_user: 'PASTE-STUDENT-USER-ID', p_suspended: false,
  p_until: null, p_reason: null,
}))
```

- [ ] Returns `{"ok": true}`
- [ ] The student can post again

### 12.6 Ordinary users cannot suspend people

As **ADULT**, run the same snippet against another user.

- [ ] Returns `{"ok": false, "reason": "forbidden"}`

### 12.7 Clean content passes through untouched

1. As **ADULT**, write a completely ordinary forum post.

- [ ] Published immediately, visible to everyone
- [ ] No notification, no log entry

---

## Part 13 — Managing the filter

### 13.1 View the term list

1. As **SAFETY**, `/admin/moderation` → **Filter terms**.

- [ ] Eight seeded patterns are listed (phone, email, address, social links, and
      four grooming-risk patterns)
- [ ] Each shows its kind (term/regex) and severity

### 13.2 Ordinary users cannot read the term list

As **ADULT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
console.log(await supabase.from('moderation_terms').select('*'))
```

- [ ] Returns an empty list — the list is not readable by people who would use
      it to work around the filter

### 13.3 Add a term

1. As **SAFETY**, click **Add term**.
2. Pattern: `bananafish`, Kind: Term, Severity: Medium. Save.

- [ ] The term appears in the list
3. As **ADULT**, post `this is a bananafish post`.
- [ ] Quarantined

### 13.4 Word boundaries are respected

1. As **ADULT**, post `I like bananafishing very much`.

- [ ] Also caught (the word appears inside)
2. Add a term `ass` (severity Low) and post `this is a class assignment`.
- [ ] **Not** flagged — the filter matches whole words, not fragments
3. Post `you are an ass`.
- [ ] Flagged
- [ ] Delete both test terms afterwards

### 13.5 Turning a term off works

1. As **SAFETY**, toggle `bananafish` to inactive.
2. As **ADULT**, post `bananafish again`.

- [ ] Published normally

### 13.6 Remove a term

1. As **SAFETY**, click **Remove** on `bananafish`, confirm.

- [ ] It disappears from the list

---

## Part 14 — Optional AI second opinion

Only works if `OPENAI_API_KEY` is configured. Skip if not.

1. As **SAFETY**, open any queued report.
2. Click **Ask for review**.

- [ ] A severity and a one-line rationale appear
- [ ] The content's visibility does **not** change as a result
- [ ] A `flagged` entry appears in `moderation_log` with `source: llm_review`

If the key is missing:

- [ ] The button returns "Second opinion unavailable" and nothing breaks

---

## Part 15 — Server-side admin routes

The `/api/admin/*` endpoints now check permissions in the database instead of
hard-coding the old admin check.

### 15.1 They still work for admins

1. As **ADMIN**, go to `/admin/users`.
2. Create a user, reset a password, delete the test user.

- [ ] All three work

### 15.2 They reject everyone else

As **ADULT**, console:

```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data: { session } } = await supabase.auth.getSession()
const res = await fetch('/api/admin/delete-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
  body: JSON.stringify({ user_id: 'any-id' }),
})
console.log(res.status, await res.json())
```

- [ ] `403` with a message naming the required permission

### 15.3 They reject unauthenticated calls

```js
const res = await fetch('/api/admin/delete-user', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: 'any-id' }),
})
console.log(res.status)
```

- [ ] `401`

### 15.4 Partner API is unchanged

- [ ] `/admin/partner-api` still lists and issues API keys as before

---

## Part 16 — Nothing else broke

Quick regression sweep. Log in as **ADULT** unless stated.

- [ ] Sign up a brand new account end to end — it works and lands on onboarding
- [ ] Log out and back in
- [ ] Browse forums while **signed out** — public posts are visible
- [ ] Forum board post counts on the boards list are correct and exclude
      quarantined posts
- [ ] Reply counts on posts are correct
- [ ] Create a project, edit it, comment on it
- [ ] Like a project; the like count is right
- [ ] Browse events and register for one
- [ ] Browse grants; apply for one as an adult
- [ ] Send and receive messages with another adult
- [ ] Global search returns results, including the new admin pages when
      searching as an admin
- [ ] Notifications bell still works
- [ ] Whiteboards, documents and code snippets still open and share
- [ ] Member directory loads and profiles open
- [ ] As **ADMIN**, open every page in the admin sidebar in turn — all 21 load

---

## Part 17 — Final health check

Run all of this at once in the SQL editor:

```sql
-- Every permission has a matrix row for every non-legacy role
SELECT count(*) AS should_be_288 FROM role_permissions;

-- No orphaned matrix rows
SELECT count(*) AS should_be_0 FROM role_permissions rp
LEFT JOIN role_definitions rd ON rd.slug = rp.role_slug
WHERE rd.slug IS NULL;

-- Legacy admins still resolve to super_admin
SELECT count(*) AS legacy_admins_ok FROM profiles
WHERE 'oecs' = ANY(roles) AND 'super_admin' = ANY(expand_roles(roles));

-- Safeguards hold for every student on the platform
SELECT count(*) AS should_be_0 FROM profiles p
WHERE 'student' = ANY(p.roles)
  AND (has_permission(p.id, 'dm:initiate') OR has_permission(p.id, 'grant:apply'));

-- No verified institution without evidence of who verified it
SELECT count(*) AS should_be_0 FROM institutions
WHERE status = 'verified' AND (verified_at IS NULL OR verified_by IS NULL);

-- No verified employer without evidence
SELECT count(*) AS should_be_0 FROM employers
WHERE verification_status = 'verified'
  AND (verified_at IS NULL OR verification_method IS NULL);

-- Nobody can write to the audit tables directly
SELECT count(*) AS role_events FROM role_permission_events;
SELECT count(*) AS mod_log FROM moderation_log;
```

- [ ] `should_be_288` = 288
- [ ] Every `should_be_0` = 0
- [ ] `legacy_admins_ok` matches your number of old admin accounts

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Saving a profile now errors | The app was deployed without the matching front-end change, so the form is still sending the roles column | Deploy the app and the migration together |
| Everything is denied for everyone | The account has an empty roles array | Give the account a role via `/admin/roles` |
| An old admin lost access | The `oecs` alias row is missing from `role_definitions` | Re-run migration 063 |
| Toggling the matrix changes nothing | `has_permission()` was not created, or the schema cache is stale | Re-run 063 and run `NOTIFY pgrst, 'reload schema';` |
| A student can still start a DM | 064 did not apply — check the messages insert policy exists | Re-run 064 |
| Quarantined posts are still visible | The old permissive policy is still in place | Re-run 065 — it replaces `"Anyone can view posts"` rather than adding to it |
| Auto-quarantine never fires | The same person filed all the reports | It counts distinct reporters; use different accounts |
| High-severity content is not suspending | The seeded grooming-risk terms were deleted | Check `SELECT * FROM moderation_terms WHERE severity = 'high'` |
| "Ask for review" always says unavailable | `OPENAI_API_KEY` is not set on the server | Set it in the deployment environment |
| A chamber sees no businesses | Their chamber institution is not `verified`, or their membership is not `approved` | Check both, then re-check `chamber_countries()` |

---

## Known unrelated failure

`npx vitest run` reports one failing test:
`src/lib/validation.test.ts > signupSchema > accepts valid signup data`.

This failure exists on the unmodified codebase as well — it is not caused by the
roles work. Everything else passes (226 of 227).
