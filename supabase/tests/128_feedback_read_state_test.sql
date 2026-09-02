-- ============================================================
-- Hand-run test for migration 128 (feedback read state).
--
-- Same workflow as the 127 test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- the closing NOTICEs mean every assertion held.
--
-- What is actually being defended here:
--   1. An admin can stamp and clear read_at / read_by. Both directions
--      matter — Mark unread writes NULL back, and a NOT NULL slipping
--      onto either column would break it in a way the UI cannot show.
--   2. Read state does NOT reach the reporter. my_feedback() was
--      written narrow in 127 and must stay narrow; who on the team
--      opened a report is not the reporter's business.
--   3. The reporter still cannot SELECT the table at all. 127's
--      guarantee, re-asserted because 128 touches the same table and
--      a policy edited by mistake would silently re-open it.
--   4. The partial unread index exists — the list filters on
--      `read_at IS NULL` and nothing else ever queries these columns.
--
-- Requires 002, 017, 036, 037, 063, 090, 093, 124, 127 and 128 to be
-- applied first. Run it as a role that can write auth.users (the SQL
-- editor's default is fine) — profiles.id is a FK to that table.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_admin  UUID := '00000000-0000-4000-8000-000000001281';
  v_member UUID := '00000000-0000-4000-8000-000000001282';
  v_report UUID := '00000000-0000-4000-8000-0000000012f2';
  v_n      INT;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin-128@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Admin 128', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-128@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 128', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_admin,  'Admin 128',  ARRAY['super_admin'], 'Saint Lucia'),
         (v_member, 'Member 128', ARRAY['student'],     'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  ASSERT is_platform_admin(v_admin),
    '128: the admin fixture is not a platform admin — check 124 applied';

  INSERT INTO feedback (id, user_id, category, subject, message, admin_note)
  VALUES (v_report, v_member, 'bug', 'Toggle does nothing',
          'Clicking Fixed leaves the badge unchanged.',
          'cannot reproduce on staging');

  -- A brand new report is unread. If the column ever gained a default this
  -- would be the assertion that caught it.
  SELECT COUNT(*) INTO v_n FROM feedback WHERE id = v_report AND read_at IS NULL;
  ASSERT v_n = 1, '128: a newly filed report did not start unread';

  -- ------------------------------------------------------------
  -- 4. The partial index the list depends on
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_n
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'idx_feedback_unread';
  ASSERT v_n = 1, '128: idx_feedback_unread is missing';

  RAISE NOTICE 'Migration 128 fixture assertions held.';
END $$;

-- ------------------------------------------------------------
-- The RLS half.
--
-- Outside the DO block so the role really switches: the editor's owner role
-- bypasses RLS, and the only honest way to test a policy is to become
-- `authenticated` with a forged JWT claim — which is what auth.uid() reads.
-- ------------------------------------------------------------

SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- 1. An admin can mark read, and mark unread again
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000001281","role":"authenticated"}';
DO $$
DECLARE
  v_report UUID := '00000000-0000-4000-8000-0000000012f2';
  v_admin  UUID := '00000000-0000-4000-8000-000000001281';
  v_n      INT;
BEGIN
  UPDATE feedback SET read_at = now(), read_by = v_admin WHERE id = v_report;

  SELECT COUNT(*) INTO v_n
  FROM feedback WHERE id = v_report AND read_at IS NOT NULL AND read_by = v_admin;
  ASSERT v_n = 1, '128: an admin could not mark a report read';

  -- Mark unread. NULL has to be writable back into both columns.
  UPDATE feedback SET read_at = NULL, read_by = NULL WHERE id = v_report;

  SELECT COUNT(*) INTO v_n
  FROM feedback WHERE id = v_report AND read_at IS NULL AND read_by IS NULL;
  ASSERT v_n = 1, '128: an admin could not mark a report unread again';

  RAISE NOTICE 'Migration 128 admin read/unread assertions held.';
END $$;

-- ------------------------------------------------------------
-- 2/3. The reporter learns nothing about who read their report
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000001282","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  -- 3. 127's guarantee still holds.
  SELECT COUNT(*) INTO v_n FROM feedback;
  ASSERT v_n = 0,
    '128: the reporter can read the feedback table again — 127''s policy was undone (saw ' || v_n || ')';

  -- Their own report is still reachable through the function.
  SELECT COUNT(*) INTO v_n FROM my_feedback();
  ASSERT v_n = 1, '128: my_feedback() stopped returning the reporter''s own report (saw ' || v_n || ')';

  -- 2. …but read state is not in the projection. Asserted against the
  -- catalogue rather than by selecting the column, because selecting a column
  -- a function does not return is a plan-time error, not a failed assertion.
  SELECT COUNT(*) INTO v_n
  FROM information_schema.routines r
  JOIN information_schema.parameters p ON p.specific_name = r.specific_name
  WHERE r.routine_name = 'my_feedback'
    AND p.parameter_name IN ('read_at', 'read_by', 'admin_note');
  ASSERT v_n = 0, '128: my_feedback() projects read state or the internal note';

  RAISE NOTICE 'Migration 128 reporter-access assertions held.';
END $$;

RESET ROLE;

ROLLBACK;
