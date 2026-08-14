-- ============================================================
-- Hand-run test for migration 111 (an organisation decides whether its own
-- people may engage).
--
-- Same workflow as the 098 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- NOTE ON ROLES. Sections 1-3 exercise the predicate and the triggers, which
-- run for any caller. Section 4 exercises RLS, and the SQL editor connects as a
-- BYPASSRLS superuser — so it switches to `authenticated` with SET LOCAL ROLE
-- first. Without that switch the policy assertions would pass vacuously.
--
-- What is being defended:
--   1. The default is untouched. A user in no organisation is allowed
--      everything — that is 99% of the platform and the main regression risk.
--   2. The master switch is platform-wide, not just the org's own postings.
--   3. A per-item override binds only members of the OWNING organisation.
--   4. A per-item FALSE is absolute and binds owners too (conflict of interest).
--   5. A per-item TRUE lifts only that organisation's switch — org A cannot
--      vote away org B's policy.
--   6. Owners and admins are exempt from the master switch.
--   7. Drafting stays open; SUBMITTING is what the gate stops. This is the one
--      that proves the real submit path (an UPDATE, not an INSERT) is gated.
--   8. employer_members is readable at all — 058's policy recursed (42P17),
--      which is why no roster UI has ever existed.
--   9. The last owner cannot be removed, and nobody can publish on behalf of an
--      organisation they do not manage.
--
-- Requires 058, 063, 079, 081, 096, 110 and 111 to be applied first, and a
-- role that can write auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   employer A — master switch ON
--   employer B — master switch OFF
--
--   owner_b      owner of B
--   recr_b       recruiter of B
--   recr_a       recruiter of A
--   recr_ab      recruiter of BOTH
--   loner        in no organisation at all
--
-- 'entrepreneur' is the role throughout: it holds grant:apply and
-- project:create and nothing administrative, so has_permission() never masks
-- what 111 is doing.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_owner_b UUID := '00000000-0000-4000-8000-000000001110';
  v_recr_b  UUID := '00000000-0000-4000-8000-000000001111';
  v_recr_a  UUID := '00000000-0000-4000-8000-000000001112';
  v_recr_ab UUID := '00000000-0000-4000-8000-000000001113';
  v_loner   UUID := '00000000-0000-4000-8000-000000001114';
  v_emp_a   UUID := '00000000-0000-4000-8000-00000000111a';
  v_emp_b   UUID := '00000000-0000-4000-8000-00000000111b';
BEGIN
  -- profiles.id is a FK to auth.users (000), so the users have to exist first.
  -- handle_new_user() then writes the profiles row from raw_user_meta_data;
  -- the INSERT below is what sets `roles`, which the trigger does not.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'owner-b-111@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Owner B 111', 'country', 'Saint Lucia')),
    (v_recr_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recruiter-b-111@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Recruiter B 111', 'country', 'Saint Lucia')),
    (v_recr_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recruiter-a-111@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Recruiter A 111', 'country', 'Saint Lucia')),
    (v_recr_ab, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recruiter-ab-111@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Recruiter AB 111', 'country', 'Saint Lucia')),
    (v_loner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'loner-111@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Loner 111', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_owner_b, 'Owner B 111',    ARRAY['entrepreneur'], 'Saint Lucia'),
    (v_recr_b,  'Recruiter B 111', ARRAY['entrepreneur'], 'Saint Lucia'),
    (v_recr_a,  'Recruiter A 111', ARRAY['entrepreneur'], 'Saint Lucia'),
    (v_recr_ab, 'Recruiter AB 111', ARRAY['entrepreneur'], 'Saint Lucia'),
    (v_loner,   'Loner 111',      ARRAY['entrepreneur'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO employers (id, slug, legal_name, country_code, contact_email, allow_member_engagement)
  VALUES
    (v_emp_a, 'fixture-employer-a-111', 'Fixture Employer A', 'LC', 'a-111@example.com', TRUE),
    (v_emp_b, 'fixture-employer-b-111', 'Fixture Employer B', 'LC', 'b-111@example.com', FALSE)
  ON CONFLICT (id) DO UPDATE SET allow_member_engagement = EXCLUDED.allow_member_engagement;

  -- created_by is left NULL deliberately: the backfill in 111 already ran on
  -- real rows, and leaving it NULL here keeps can_manage_employer honest so
  -- section 5 tests the roster rules rather than the registrant shortcut.
  INSERT INTO employer_members (employer_id, user_id, role) VALUES
    (v_emp_b, v_owner_b, 'owner'),
    (v_emp_b, v_recr_b,  'recruiter'),
    (v_emp_a, v_recr_a,  'recruiter'),
    (v_emp_a, v_recr_ab, 'recruiter'),
    (v_emp_b, v_recr_ab, 'recruiter')
  ON CONFLICT (employer_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $$;

-- ------------------------------------------------------------
-- 1. The rule itself
-- ------------------------------------------------------------
DO $$
DECLARE
  v_owner_b UUID := '00000000-0000-4000-8000-000000001110';
  v_recr_b  UUID := '00000000-0000-4000-8000-000000001111';
  v_recr_a  UUID := '00000000-0000-4000-8000-000000001112';
  v_recr_ab UUID := '00000000-0000-4000-8000-000000001113';
  v_loner   UUID := '00000000-0000-4000-8000-000000001114';
  v_emp_a   UUID := '00000000-0000-4000-8000-00000000111a';
  v_emp_b   UUID := '00000000-0000-4000-8000-00000000111b';
BEGIN
  -- 1. Nobody's employee. Nothing changes for them, ever.
  ASSERT member_engagement_allowed(v_loner, NULL,    NULL) = TRUE,  'loner, no org item';
  ASSERT member_engagement_allowed(v_loner, v_emp_b, NULL) = TRUE,  'loner, B item, inherit';
  ASSERT member_engagement_allowed(v_loner, v_emp_b, FALSE) = TRUE, 'loner is not bound by B''s override';

  -- 2. The master switch reaches items that have nothing to do with the org.
  ASSERT member_engagement_allowed(v_recr_b, NULL, NULL) = FALSE,
    'B''s switch is off, so its recruiter is blocked on unaffiliated items too';

  -- 3. TRUE on B''s own item reopens it to B''s people.
  ASSERT member_engagement_allowed(v_recr_b, v_emp_b, TRUE) = TRUE,
    'B may open its own item to its own staff';

  -- 4. An override binds only the owning org''s members.
  ASSERT member_engagement_allowed(v_recr_a, v_emp_b, FALSE) = TRUE,
    'B''s closed item is an ordinary item to A''s recruiter';

  -- 5. Conflict of interest, with the master switch ON.
  ASSERT member_engagement_allowed(v_recr_a, v_emp_a, FALSE) = FALSE,
    'A closed its own call to its own staff';

  -- 6. Org A cannot override org B.
  ASSERT member_engagement_allowed(v_recr_ab, v_emp_a, TRUE) = FALSE,
    'A''s open item does not lift B''s switch for someone in both';

  -- 7. Owners are exempt from the master switch.
  ASSERT member_engagement_allowed(v_owner_b, NULL, NULL) = TRUE,
    'the owner who flipped the switch is not locked out by it';

  -- 8. ...but not from an explicit FALSE.
  ASSERT member_engagement_allowed(v_owner_b, v_emp_b, FALSE) = FALSE,
    'FALSE is absolute — an owner is the most conflicted person in the room';

  -- Guard: no session, no answer.
  ASSERT member_engagement_allowed(NULL, NULL, NULL) = FALSE, 'null actor must be refused';
END $$;

-- ------------------------------------------------------------
-- 2. Draft is not submit
--
-- saveDraft upserts status='draft'; submitApplication UPDATEs the SAME row to
-- 'pending'. Gating the INSERT alone would gate nothing.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_recr_b UUID := '00000000-0000-4000-8000-000000001111';
  v_emp_b  UUID := '00000000-0000-4000-8000-00000000111b';
  v_grant  UUID := '00000000-0000-4000-8000-0000000011f1';
  v_open   UUID := '00000000-0000-4000-8000-0000000011f2';
  v_app    UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  -- guard_item_employer_claim needs a session: naming an employer on a row is
  -- itself an act that has to be authorised.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-8000-000000001110')::text, TRUE);

  INSERT INTO grants (id, title, description, grant_type, is_active, employer_id)
  VALUES (v_grant, 'Fixture Grant 111', 'Engagement gate test', 'innovation', TRUE, v_emp_b)
  ON CONFLICT (id) DO UPDATE SET employer_id = EXCLUDED.employer_id;

  INSERT INTO grants (id, title, description, grant_type, is_active, employer_id, allow_member_engagement)
  VALUES (v_open, 'Fixture Grant 111 (open)', 'Reopened to staff', 'innovation', TRUE, v_emp_b, TRUE)
  ON CONFLICT (id) DO UPDATE SET allow_member_engagement = EXCLUDED.allow_member_engagement;

  ASSERT can_engage_with_grant(v_grant, v_recr_b) = FALSE, 'inherited grant must be closed to B''s staff';
  ASSERT can_engage_with_grant(v_open,  v_recr_b) = TRUE,  'the reopened grant must be open to B''s staff';

  -- Drafting stays open: 064 split "may prepare" from "may submit" and 111
  -- keeps that line.
  INSERT INTO grant_applications (grant_id, user_id, application_data, status)
  VALUES (v_grant, v_recr_b, '{}'::jsonb, 'draft')
  RETURNING id INTO v_app;

  -- Submitting is what the gate stops, and it says why in words.
  BEGIN
    UPDATE grant_applications SET status = 'pending' WHERE id = v_app;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%organisation has turned off grant applications%',
      'expected the organisation message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'draft -> pending must be refused for a blocked member';

  -- The reopened grant goes through.
  INSERT INTO grant_applications (grant_id, user_id, application_data, status)
  VALUES (v_open, v_recr_b, '{}'::jsonb, 'pending');
END $$;

-- ------------------------------------------------------------
-- 3. Pending decisions are re-checked
--
-- A request filed the day before the switch flipped must not walk through it.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_owner_b UUID := '00000000-0000-4000-8000-000000001110';
  v_recr_b  UUID := '00000000-0000-4000-8000-000000001111';
  v_loner   UUID := '00000000-0000-4000-8000-000000001114';
  v_proj    UUID := '00000000-0000-4000-8000-0000000011c1';
  v_req     UUID;
  v_raised  BOOLEAN := FALSE;
BEGIN
  INSERT INTO projects (id, title, description, category, owner_id, is_public)
  VALUES (v_proj, 'Fixture Project 111', 'Engagement gate test', 'technology', v_loner, TRUE)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

  ASSERT can_engage_with_project(v_proj, v_recr_b) = FALSE, 'B''s recruiter is blocked platform-wide';
  ASSERT can_engage_with_project(v_proj, v_owner_b) = TRUE, 'B''s owner is not';

  -- Seeded directly, as a row that predates the flip would be.
  INSERT INTO project_join_requests (project_id, requester_id, status)
  VALUES (v_proj, v_recr_b, 'pending')
  RETURNING id INTO v_req;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_loner)::text, TRUE);

  BEGIN
    PERFORM decide_project_join_request(v_req, TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%does not permit joining projects%',
      'expected the requester-organisation message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'approving a stale request must be refused';

  -- Denying is still allowed: the switch closes a door, it does not freeze the
  -- owner's inbox.
  PERFORM decide_project_join_request(v_req, FALSE);
  ASSERT (SELECT status FROM project_join_requests WHERE id = v_req) = 'denied',
    'the owner must still be able to deny';
END $$;

-- ------------------------------------------------------------
-- 4. The policies, under a real `authenticated` session
--
-- The SQL editor connects as a BYPASSRLS superuser, so this section switches
-- role. Everything above ran as the owner on purpose (it was seeding and
-- asserting triggers); nothing below can insert fixtures.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_recr_b UUID := '00000000-0000-4000-8000-000000001111';
  v_emp_b  UUID := '00000000-0000-4000-8000-00000000111b';
  v_proj   UUID := '00000000-0000-4000-8000-0000000011c1';
  v_grant  UUID := '00000000-0000-4000-8000-0000000011f1';
  v_n      INT;
  v_raised BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recr_b)::text, TRUE);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 058's policy embedded a self-referencing EXISTS and raised 42P17 here.
  -- This is the regression test for the roster being reachable at all.
  SELECT count(*) INTO v_n FROM employer_members WHERE employer_id = v_emp_b;
  ASSERT v_n >= 2, 'a member must be able to read their own organisation''s roster, got ' || v_n;

  SELECT count(*) INTO v_n FROM employer_roster(v_emp_b);
  ASSERT v_n >= 2, 'employer_roster must return the team, got ' || v_n;

  -- A join request from a blocked member is refused by policy.
  v_raised := FALSE;
  BEGIN
    INSERT INTO project_join_requests (project_id, requester_id, status)
    VALUES (v_proj, v_recr_b, 'pending');
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'project_join_requests INSERT must be refused for a blocked member';

  -- A submitted application cannot be inserted directly either — the INSERT
  -- policy carries the same clause as the UPDATE one.
  v_raised := FALSE;
  BEGIN
    INSERT INTO grant_applications (grant_id, user_id, application_data, status)
    VALUES (v_grant, v_recr_b, '{}'::jsonb, 'pending');
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'a blocked member must not be able to INSERT straight at pending';

  EXECUTE 'RESET ROLE';
END $$;

-- ------------------------------------------------------------
-- 5. Roster invariants and the org claim
-- ------------------------------------------------------------
DO $$
DECLARE
  v_owner_b UUID := '00000000-0000-4000-8000-000000001110';
  v_recr_b  UUID := '00000000-0000-4000-8000-000000001111';
  v_recr_a  UUID := '00000000-0000-4000-8000-000000001112';
  v_loner   UUID := '00000000-0000-4000-8000-000000001114';
  v_emp_a   UUID := '00000000-0000-4000-8000-00000000111a';
  v_emp_b   UUID := '00000000-0000-4000-8000-00000000111b';
  v_proj    UUID := '00000000-0000-4000-8000-0000000011c1';
  v_member  UUID;
  v_raised  BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, TRUE);

  SELECT id INTO v_member FROM employer_members
  WHERE employer_id = v_emp_b AND user_id = v_owner_b;

  v_raised := FALSE;
  BEGIN
    PERFORM remove_employer_member(v_member);
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%at least one owner%',
      'expected the last-owner message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'the last owner must not be removable';

  -- An admin may build a team but may not hand out ownership.
  PERFORM set_employer_member_role(
    (SELECT id FROM employer_members WHERE employer_id = v_emp_b AND user_id = v_recr_b), 'admin');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recr_b)::text, TRUE);

  v_raised := FALSE;
  BEGIN
    PERFORM add_employer_member(v_emp_b, v_loner, 'owner');
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%only an owner can grant ownership%',
      'expected the ownership message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'an admin must not be able to grant ownership';

  PERFORM add_employer_member(v_emp_b, v_loner, 'recruiter');
  ASSERT is_employer_member(v_emp_b, v_loner), 'an admin may add an ordinary member';

  -- Flipping the master switch is a manager act, and only through the RPC.
  PERFORM set_employer_member_engagement(v_emp_b, TRUE);
  ASSERT (SELECT allow_member_engagement FROM employers WHERE id = v_emp_b) = TRUE,
    'the switch must be writable by a manager';
  PERFORM set_employer_member_engagement(v_emp_b, FALSE);

  -- You cannot publish on behalf of an organisation you do not manage.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recr_a)::text, TRUE);
  v_raised := FALSE;
  BEGIN
    UPDATE projects SET employer_id = v_emp_a WHERE id = v_proj;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%on behalf of an organisation you do not manage%',
      'expected the claim-guard message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'a recruiter must not be able to publish under its employer';
END $$;

ROLLBACK;
