-- ============================================================
-- Hand-run test for migration 098 (decisions that go against you).
--
-- Same workflow as the 091 test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- silence at the end means every assertion held.
--
-- What is actually being defended here:
--   1. A grant application that is not accepted notifies the applicant.
--      This is the whole point of 098 — before it, the only way to find
--      out was to reopen My Applications and notice the badge.
--   2. Approval notifies too. The same branch was silent, and an
--      applicant should not have to poll for good news either.
--   3. Intermediate states stay quiet. Moving a pile of applications to
--      under_review is triage, not a decision, and must not spam.
--   4. A status write with no session still succeeds. send_notification
--      raises without auth.uid(), and a backfill must not be blocked by
--      a message nobody is waiting for.
--   5. The wording is the softened vocabulary — "not accepted", never
--      "rejected" — while the stored status is still 'rejected'.
--
-- Requires 017, 036, 046 and 098 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_admin   UUID := '00000000-0000-4000-8000-000000000981';
  v_member  UUID := '00000000-0000-4000-8000-000000000982';
  v_grant   UUID := '00000000-0000-4000-8000-0000000009f1';
  v_app     UUID;
  v_n       INT;
  v_before  INT;
  v_title   TEXT;
  v_body    TEXT;
BEGIN
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_admin,  'Admin 098',  ARRAY['oecs'],    'Saint Lucia'),
         (v_member, 'Member 098', ARRAY['student'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO grants (id, title, description, grant_type, is_active)
  VALUES (v_grant, 'Fixture Grant 098', 'Decision notification test', 'innovation', TRUE)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

  -- The reviewer is the one holding the session, exactly as in the admin UI.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, TRUE);

  INSERT INTO grant_applications (grant_id, user_id, application_data, status)
  VALUES (v_grant, v_member, '{}'::jsonb, 'pending')
  RETURNING id INTO v_app;

  DELETE FROM notifications WHERE user_id = v_member;

  -- ------------------------------------------------------------
  -- 1. Triage is not a decision
  -- ------------------------------------------------------------
  UPDATE grant_applications SET status = 'under_review' WHERE id = v_app;

  SELECT COUNT(*) INTO v_n
  FROM notifications WHERE user_id = v_member AND type = 'grant_application_result';
  ASSERT v_n = 0, 'under_review must not notify, got ' || v_n || ' notification(s)';

  -- ------------------------------------------------------------
  -- 2. Not accepting notifies, in the softened wording
  -- ------------------------------------------------------------
  UPDATE grant_applications SET status = 'rejected' WHERE id = v_app;

  SELECT title, body INTO v_title, v_body
  FROM notifications
  WHERE user_id = v_member AND type = 'grant_application_result'
  ORDER BY created_at DESC LIMIT 1;

  ASSERT v_title = 'Application not accepted',
    'a declined application must say "not accepted", got ' || COALESCE(v_title, '<none>');
  ASSERT v_body LIKE '%Fixture Grant 098%',
    'the body must name the grant, got ' || COALESCE(v_body, '<none>');
  ASSERT v_body NOT ILIKE '%reject%',
    'the recipient must never read the word "reject", got ' || v_body;

  -- The stored status is untouched — this was a copy change, not a data one.
  SELECT COUNT(*) INTO v_n
  FROM grant_applications WHERE id = v_app AND status = 'rejected';
  ASSERT v_n = 1, 'the stored status must still be the rejected enum';

  -- ------------------------------------------------------------
  -- 3. Approval notifies as well
  -- ------------------------------------------------------------
  UPDATE grant_applications SET status = 'approved' WHERE id = v_app;

  SELECT title INTO v_title
  FROM notifications
  WHERE user_id = v_member AND type = 'grant_application_result'
  ORDER BY created_at DESC LIMIT 1;
  ASSERT v_title = 'Application approved',
    'approval must notify, got ' || COALESCE(v_title, '<none>');

  -- A repeated write of the same status is not a new decision.
  SELECT COUNT(*) INTO v_before
  FROM notifications WHERE user_id = v_member AND type = 'grant_application_result';
  UPDATE grant_applications SET status = 'approved' WHERE id = v_app;
  SELECT COUNT(*) INTO v_n
  FROM notifications WHERE user_id = v_member AND type = 'grant_application_result';
  ASSERT v_n = v_before, 'rewriting the same status must not notify again';

  -- ------------------------------------------------------------
  -- 4. No session, no message, but the write still lands
  -- ------------------------------------------------------------
  SELECT COUNT(*) INTO v_before
  FROM notifications WHERE user_id = v_member AND type = 'grant_application_result';

  PERFORM set_config('request.jwt.claims', NULL, TRUE);

  UPDATE grant_applications SET status = 'rejected' WHERE id = v_app;

  SELECT COUNT(*) INTO v_n
  FROM grant_applications WHERE id = v_app AND status = 'rejected';
  ASSERT v_n = 1, 'a status write with no session must still succeed';

  SELECT COUNT(*) INTO v_n
  FROM notifications WHERE user_id = v_member AND type = 'grant_application_result';
  ASSERT v_n = v_before, 'an unauthenticated write must not notify';

  RAISE NOTICE '098 decision notifications: all assertions held';
END $$;

ROLLBACK;
