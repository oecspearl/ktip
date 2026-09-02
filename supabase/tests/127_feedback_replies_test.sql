-- ============================================================
-- Hand-run test for migration 127 (replying to a feedback report).
--
-- Same workflow as the 093 test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- the closing NOTICE means every assertion held.
--
-- What is actually being defended here:
--   1. The queue stays readable and writable by an admin after the
--      policy rewrite. 127 restates both policies; a slip there would
--      render /admin/feedback as an empty list with no error.
--   2. admin_note does not reach the reporter. RLS is row-level, so
--      the "view own feedback" policy (037, restated by 090) handed them
--      the whole row. 127 takes the reporter's SELECT away entirely.
--   3. my_feedback() gives them their own reports back — the reply
--      included, the internal columns not.
--   4. A member can still FILE a report with no SELECT on the table.
--      This is the trap in 2: PostgREST applies the SELECT policy to
--      RETURNING, so an insert asking for its row back would 42501.
--   5. 'feedback_reply' survives enforce_notification_preferences()
--      with every category switched off. It maps to no column and
--      falls to ELSE TRUE, deliberately (112 says the same of
--      grant_application_result).
--
-- Requires 002, 017, 036, 037, 063, 090, 093, 124 and 127 to be applied
-- first — 127 in particular: the first symptom of a database without it
-- is `column "admin_reply" of relation "feedback" does not exist`. Run it as a role that can write auth.users (the SQL editor's
-- default is fine) — profiles.id is a FK to that table.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_admin    UUID := '00000000-0000-4000-8000-000000001271';
  v_member   UUID := '00000000-0000-4000-8000-000000001272';
  v_report   UUID := '00000000-0000-4000-8000-0000000012f1';
  v_n        INT;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin-127@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Admin 127', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-127@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 127', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  -- super_admin is what is_platform_admin() answers to (124 widened it to the
  -- admin seat as well). The legacy 'oecs' slug is deliberately absent so the
  -- fixture cannot lean on any alias handling.
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_admin,  'Admin 127',  ARRAY['super_admin'], 'Saint Lucia'),
         (v_member, 'Member 127', ARRAY['student'],     'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  ASSERT is_platform_admin(v_admin),
    '127: the admin fixture is not a platform admin — check 124 applied';

  INSERT INTO feedback (id, user_id, category, subject, message, admin_note, page_path)
  VALUES (v_report, v_member, 'bug', 'Download button missing',
          'No button to download resources.',
          'dupe of the 093 thing, ping Andre', '/resources/playbook');

  -- ------------------------------------------------------------
  -- 5. A reply notification cannot be muted
  --
  -- Run inside the DO block, where the editor's owner role bypasses RLS —
  -- this is about the preference trigger, not about policies.
  -- ------------------------------------------------------------
  INSERT INTO notification_preferences (user_id, email, messages, events, projects,
                                        forums, collaboration, connections, achievements)
  VALUES (v_member, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
  ON CONFLICT (user_id) DO UPDATE
    SET email = FALSE, messages = FALSE, events = FALSE, projects = FALSE,
        forums = FALSE, collaboration = FALSE, connections = FALSE, achievements = FALSE;

  DELETE FROM notifications WHERE user_id = v_member;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (v_member, 'feedback_reply', 'We replied to your feedback',
          'Fixed and live now.', '/settings?tab=feedback');

  SELECT COUNT(*) INTO v_n
  FROM notifications WHERE user_id = v_member AND type = 'feedback_reply';
  ASSERT v_n = 1,
    '127: a feedback_reply notification was swallowed by the preference trigger';

  RAISE NOTICE 'Migration 127 fixture and preference assertions held.';
END $$;

-- ------------------------------------------------------------
-- The RLS half.
--
-- Run outside the DO block so the role really switches: the editor's owner
-- role bypasses RLS, and the only honest way to test a policy is to become
-- `authenticated` with a forged JWT claim — which is exactly what auth.uid()
-- reads.
-- ------------------------------------------------------------

SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- 1. The admin can still work the queue
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000001271","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
  FROM feedback WHERE id = '00000000-0000-4000-8000-0000000012f1';
  ASSERT v_n = 1,
    '127: a platform admin could not read the queue (saw ' || v_n || ')';

  UPDATE feedback
  SET status = 'resolved',
      admin_reply = 'Fixed and live now.',
      replied_at = now(),
      replied_by = '00000000-0000-4000-8000-000000001271'
  WHERE id = '00000000-0000-4000-8000-0000000012f1';

  SELECT COUNT(*) INTO v_n
  FROM feedback
  WHERE id = '00000000-0000-4000-8000-0000000012f1' AND admin_reply IS NOT NULL;
  ASSERT v_n = 1, '127: a platform admin could not write a reply';

  RAISE NOTICE 'Migration 127 admin-access assertions held.';
END $$;

-- ------------------------------------------------------------
-- 2/3/4. What the reporter can and cannot do
-- ------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000001272","role":"authenticated"}';
DO $$
DECLARE
  v_n     INT;
  v_reply TEXT;
BEGIN
  -- 2. The internal note is unreachable. The base table answers with nothing
  -- at all now, which is what makes the column split real.
  SELECT COUNT(*) INTO v_n FROM feedback;
  ASSERT v_n = 0,
    '127: the reporter can still read the feedback table, so admin_note leaks (saw ' || v_n || ')';

  -- 3. Their own reports come back through the function, reply included.
  SELECT COUNT(*) INTO v_n FROM my_feedback();
  ASSERT v_n = 1, '127: my_feedback() did not return the reporter''s own report (saw ' || v_n || ')';

  SELECT admin_reply INTO v_reply FROM my_feedback() LIMIT 1;
  ASSERT v_reply = 'Fixed and live now.',
    '127: my_feedback() did not carry the reply through — got ' || COALESCE(v_reply, '(null)');

  -- The projection is narrow by construction: asking for admin_note here is a
  -- compile error, not a runtime one, so assert on the column list instead.
  SELECT COUNT(*) INTO v_n
  FROM information_schema.routines r
  JOIN information_schema.parameters p ON p.specific_name = r.specific_name
  WHERE r.routine_name = 'my_feedback' AND p.parameter_name = 'admin_note';
  ASSERT v_n = 0, '127: my_feedback() projects admin_note';

  -- 4. Filing still works with no SELECT on the table. An INSERT that asked
  -- for its row back would fail here — which is why useCreateFeedback dropped
  -- its .select().
  INSERT INTO feedback (user_id, category, subject, message)
  VALUES ('00000000-0000-4000-8000-000000001272', 'general', 'Second report', 'Still works.');

  SELECT COUNT(*) INTO v_n FROM my_feedback();
  ASSERT v_n = 2, '127: the reporter could not file a second report (sees ' || v_n || ')';

  RAISE NOTICE 'Migration 127 reporter-access assertions held.';
END $$;

RESET ROLE;

ROLLBACK;
