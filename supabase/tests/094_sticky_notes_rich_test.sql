-- ============================================================
-- Hand-run test for migration 094 (rich notes + folders).
--
-- Paste into the Supabase SQL editor and run. It seeds fixtures,
-- asserts, and ROLLBACKs — nothing is left behind.
--
-- What is actually being defended here:
--   1. The last note leaving a folder takes the folder with it. An
--      empty folder is unreachable in the UI, so it would otherwise
--      accumulate forever as invisible rows.
--   2. Moving a note between folders does not delete the folder it
--      is moving into, and does clear the one it left.
--   3. Colours are hex. The column used to hold names, and a client
--      written against 093 must not be able to put one back.
--   4. Sizes stay inside the range the resize handle allows.
--   5. Folders are private, exactly like the notes in them.
--
-- Requires 002, 093 and 094 to be applied first.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_a       UUID := '00000000-0000-4000-8000-000000000941';
  v_b       UUID := '00000000-0000-4000-8000-000000000942';
  v_folder1 UUID;
  v_folder2 UUID;
  v_note1   UUID;
  v_note2   UUID;
  v_n       INT;
  v_failed  BOOLEAN;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'a-094@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member A 094', 'country', 'Saint Lucia')),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'b-094@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member B 094', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_a, 'Member A 094', ARRAY[]::TEXT[], 'Saint Lucia'),
         (v_b, 'Member B 094', ARRAY[]::TEXT[], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO sticky_note_groups (user_id, title, x, y)
  VALUES (v_a, 'Grant week', 0.3, 0.3) RETURNING id INTO v_folder1;

  INSERT INTO sticky_note_groups (user_id, title, x, y)
  VALUES (v_a, 'Later', 0.6, 0.3) RETURNING id INTO v_folder2;

  INSERT INTO sticky_notes (user_id, title, content, color, x, y, group_id)
  VALUES (v_a, 'Deadline', '<p>Friday</p>', '#fef08a', 0.2, 0.2, v_folder1)
  RETURNING id INTO v_note1;

  INSERT INTO sticky_notes (user_id, title, content, color, x, y, group_id)
  VALUES (v_a, 'Budget', '<p>Ask Marcia</p>', '#bfdbfe', 0.25, 0.25, v_folder1)
  RETURNING id INTO v_note2;

  -- Folder 2 needs a member of its own, or step 2's move would be the only
  -- thing keeping it alive and the assertion would prove nothing.
  INSERT INTO sticky_notes (user_id, title, x, y, group_id)
  VALUES (v_a, 'Someday', 0.7, 0.7, v_folder2);

  -- ------------------------------------------------------------
  -- 1. A folder with notes left in it survives one leaving
  -- ------------------------------------------------------------
  UPDATE sticky_notes SET group_id = NULL WHERE id = v_note1;

  SELECT COUNT(*) INTO v_n FROM sticky_note_groups WHERE id = v_folder1;
  ASSERT v_n = 1, 'folders: a folder was reaped while it still held a note';

  -- ------------------------------------------------------------
  -- 2. Moving the last note out takes the folder with it, and does
  --    not disturb the folder it moved into
  -- ------------------------------------------------------------
  UPDATE sticky_notes SET group_id = v_folder2 WHERE id = v_note2;

  SELECT COUNT(*) INTO v_n FROM sticky_note_groups WHERE id = v_folder1;
  ASSERT v_n = 0, 'folders: an emptied folder was left behind';

  SELECT COUNT(*) INTO v_n FROM sticky_note_groups WHERE id = v_folder2;
  ASSERT v_n = 1, 'folders: the destination folder was reaped by the move';

  SELECT COUNT(*) INTO v_n FROM sticky_notes WHERE group_id = v_folder2;
  ASSERT v_n = 2, 'folders: the moved note did not land in the destination';

  -- ------------------------------------------------------------
  -- 3. Deleting the last note also takes the folder
  -- ------------------------------------------------------------
  DELETE FROM sticky_notes WHERE group_id = v_folder2;

  SELECT COUNT(*) INTO v_n FROM sticky_note_groups WHERE id = v_folder2;
  ASSERT v_n = 0, 'folders: deleting the last note left an empty folder';

  -- ------------------------------------------------------------
  -- 4. Colours are hex, sizes are bounded
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    UPDATE sticky_notes SET color = 'sun' WHERE id = v_note1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'colour: a 093-style colour name was accepted';

  v_failed := FALSE;
  BEGIN
    UPDATE sticky_notes SET width = 60 WHERE id = v_note1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'size: a note narrower than the minimum was accepted';

  -- The ordinary case still works
  UPDATE sticky_notes SET width = 420, height = 380, color = '#e9d5ff' WHERE id = v_note1;
  SELECT width INTO v_n FROM sticky_notes WHERE id = v_note1;
  ASSERT v_n = 420, 'size: a legal resize was refused';

  RAISE NOTICE 'Migration 094 constraint assertions all held.';
END $$;

-- ------------------------------------------------------------
-- 5. Folders are private
-- ------------------------------------------------------------

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000942","role":"authenticated"}';
DO $$
DECLARE
  v_n      INT;
  v_failed BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_n FROM sticky_note_groups;
  ASSERT v_n = 0, 'folders: another member could read a private folder (saw ' || v_n || ')';

  BEGIN
    INSERT INTO sticky_note_groups (user_id, title)
    VALUES ('00000000-0000-4000-8000-000000000941', 'planted');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'folders: a member created a folder owned by someone else';

  RAISE NOTICE 'Migration 094 RLS assertions all held.';
END $$;

RESET ROLE;

ROLLBACK;
