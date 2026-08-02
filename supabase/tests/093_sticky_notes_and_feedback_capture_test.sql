-- ============================================================
-- Hand-run test for migration 093 (sticky notes + feedback capture).
--
-- Same workflow as 092's test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- the closing NOTICE means every assertion held.
--
-- What is actually being defended here:
--   1. A sticky note is private. Member B must not read member A's
--      note — this is the whole security surface of the feature, and
--      a wrong policy here leaks a scratchpad, not a public field.
--   2. Note positions stay inside the viewport. An x or y outside 0..1
--      renders the note unreachable, so the database refuses it rather
--      than trusting the drag handler.
--   3. The widened category list accepts 'praise' and still rejects
--      junk — a CHECK replaced by hand is easy to widen to everything.
--   4. rating is 1-5 or absent.
--
-- Requires 002, 037 and 093 to be applied first. Run it as a role that
-- can write auth.users (the SQL editor's default is fine) — profiles.id
-- is a FK to that table, so the fixtures cannot exist without it.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_a       UUID := '00000000-0000-4000-8000-000000000931';
  v_b       UUID := '00000000-0000-4000-8000-000000000932';
  v_note_a  UUID := '00000000-0000-4000-8000-0000000009f1';
  v_n       INT;
  v_failed  BOOLEAN;
  v_message TEXT;
BEGIN
  -- profiles.id is a FK to auth.users (000), so the users have to exist before
  -- the profiles do. Inserting here also fires on_auth_user_created (091),
  -- which creates the profile row itself. Everything is rolled back at the end.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'a-093@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member A 093', 'country', 'Saint Lucia')),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'b-093@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member B 093', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_a, 'Member A 093', ARRAY[]::TEXT[], 'Saint Lucia'),
         (v_b, 'Member B 093', ARRAY[]::TEXT[], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO sticky_notes (id, user_id, body, color, x, y)
  VALUES (v_note_a, v_a, 'Call the grants desk', 'sun', 0.42, 0.31);

  -- ------------------------------------------------------------
  -- 1. Positions must stay inside the viewport
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    UPDATE sticky_notes SET x = 1.4 WHERE id = v_note_a;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'sticky_notes: an x beyond the right edge was accepted';

  v_failed := FALSE;
  BEGIN
    UPDATE sticky_notes SET y = -0.2 WHERE id = v_note_a;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'sticky_notes: a negative y was accepted';

  v_failed := FALSE;
  BEGIN
    UPDATE sticky_notes SET color = 'chartreuse' WHERE id = v_note_a;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'sticky_notes: an unknown colour was accepted';

  -- ------------------------------------------------------------
  -- 2. The updated_at trigger is wired
  -- ------------------------------------------------------------
  UPDATE sticky_notes SET body = 'Call the grants desk on Tuesday' WHERE id = v_note_a;

  SELECT COUNT(*) INTO v_n
  FROM sticky_notes WHERE id = v_note_a AND updated_at > created_at;
  ASSERT v_n = 1, 'sticky_notes: updated_at did not move on UPDATE';

  -- ------------------------------------------------------------
  -- 3. Category widened to 'praise', but no wider
  -- ------------------------------------------------------------
  INSERT INTO feedback (user_id, category, subject, message, rating, page_path)
  VALUES (v_a, 'praise', 'The venue map', 'Genuinely lovely.', 5, '/venue');

  SELECT COUNT(*) INTO v_n FROM feedback WHERE user_id = v_a AND category = 'praise';
  ASSERT v_n = 1, 'feedback: a praise row was refused';

  v_failed := FALSE;
  BEGIN
    INSERT INTO feedback (user_id, category, subject, message)
    VALUES (v_a, 'rambling', 'x', 'y');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    v_message := SQLERRM;
  END;
  ASSERT v_failed, 'feedback: an unknown category was accepted';
  ASSERT v_message LIKE '%category%',
    'feedback: refused for the wrong reason — ' || COALESCE(v_message, '(none)');

  -- ------------------------------------------------------------
  -- 4. rating is 1-5 or nothing at all
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO feedback (user_id, category, subject, message, rating)
    VALUES (v_a, 'general', 'x', 'y', 9);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'feedback: a rating of 9 was accepted';

  -- A bug report with no stars is the common case and must stay legal
  INSERT INTO feedback (user_id, category, subject, message, page_path)
  VALUES (v_a, 'bug', 'Stepper skips', 'It jumped from 2 to 4.', '/grants/apply');

  SELECT COUNT(*) INTO v_n FROM feedback WHERE user_id = v_a AND rating IS NULL;
  ASSERT v_n = 1, 'feedback: an unrated report was refused';

  RAISE NOTICE 'Migration 093 constraint assertions all held.';
END $$;

-- ------------------------------------------------------------
-- 5. A note is private
--
-- Run outside the DO block so the role really switches: RLS is bypassed
-- by the editor's owner role, so the only honest way to test the policy
-- is to become `authenticated` with a forged JWT claim, which is exactly
-- what auth.uid() reads.
-- ------------------------------------------------------------

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000931","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM sticky_notes;
  ASSERT v_n = 1, 'sticky_notes: the author could not read their own note (saw ' || v_n || ')';
END $$;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000932","role":"authenticated"}';
DO $$
DECLARE
  v_n      INT;
  v_failed BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_n FROM sticky_notes;
  ASSERT v_n = 0, 'sticky_notes: another member could read a private note (saw ' || v_n || ')';

  -- Writing someone else's note has to fail too — a policy that only
  -- filtered SELECT would let B overwrite A's scratchpad blind.
  BEGIN
    INSERT INTO sticky_notes (user_id, body) VALUES
      ('00000000-0000-4000-8000-000000000931', 'planted');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'sticky_notes: a member created a note owned by someone else';

  RAISE NOTICE 'Migration 093 RLS assertions all held.';
END $$;

RESET ROLE;

ROLLBACK;
