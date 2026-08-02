-- ============================================================
-- Hand-run test for migration 095 (files in a conversation).
--
-- Same workflow as 093's test: paste into the Supabase SQL editor
-- and run. It seeds fixtures, asserts, and ROLLBACKs — nothing is
-- left behind. A failing ASSERT aborts with the message shown;
-- the closing NOTICE means every assertion held.
--
-- What is actually being defended here:
--   1. `attachments` is an array of at most five entries. Every reader
--      in the client indexes it directly; an object or an unbounded
--      list would break the bubble rather than the database.
--   2. A message still has to contain *something*. Attachment-only is
--      legal (a file needs no caption), blank-and-empty is not.
--   3. safe_uuid never raises. The storage policies read a uuid out of
--      an object key, and every object in every bucket is evaluated
--      against them — a raising cast would take out unrelated uploads.
--   4. A file is as private as the message it rides on: a member who is
--      not in the thread cannot see it.
--
-- The storage.objects policies themselves are not exercised here — the
-- SQL editor cannot upload a blob. What it *can* check is the predicate
-- they are built from (safe_uuid + is_conversation_participant), which
-- is where the access decision actually lives.
--
-- Requires 004, 034, 065 and 095 to be applied first. Run it as a role
-- that can write auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_a       UUID := '00000000-0000-4000-8000-000000000951';
  v_b       UUID := '00000000-0000-4000-8000-000000000952';
  v_c       UUID := '00000000-0000-4000-8000-000000000953';
  v_conv    UUID := '00000000-0000-4000-8000-0000000009c1';
  v_file    JSONB := jsonb_build_array(jsonb_build_object(
              'path', '00000000-0000-4000-8000-0000000009c1/00000000-0000-4000-8000-000000000951/1-ab-brief.pdf',
              'name', 'brief.pdf',
              'mime', 'application/pdf',
              'size', 20481));
  v_n       INT;
  v_failed  BOOLEAN;
  v_message TEXT;
BEGIN
  -- profiles.id is a FK to auth.users (000), so the users have to exist first.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'a-095@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member A 095', 'country', 'Saint Lucia')),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'b-095@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member B 095', 'country', 'Saint Lucia')),
    (v_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'c-095@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member C 095', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_a, 'Member A 095', ARRAY[]::TEXT[], 'Saint Lucia'),
         (v_b, 'Member B 095', ARRAY[]::TEXT[], 'Saint Lucia'),
         (v_c, 'Member C 095', ARRAY[]::TEXT[], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  INSERT INTO conversations (id, created_by) VALUES (v_conv, v_a)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conv, v_a), (v_conv, v_b)
  ON CONFLICT DO NOTHING;

  -- ------------------------------------------------------------
  -- 1. A file with a note, and a file on its own
  -- ------------------------------------------------------------
  INSERT INTO messages (conversation_id, sender_id, content, attachments)
  VALUES (v_conv, v_a, 'The brief we discussed', v_file);

  INSERT INTO messages (conversation_id, sender_id, content, attachments)
  VALUES (v_conv, v_a, '', v_file);

  SELECT COUNT(*) INTO v_n
  FROM messages WHERE conversation_id = v_conv AND jsonb_array_length(attachments) = 1;
  ASSERT v_n = 2, 'messages: an attached file was refused (saw ' || v_n || ' of 2)';

  -- An ordinary message still defaults to no files at all.
  INSERT INTO messages (conversation_id, sender_id, content)
  VALUES (v_conv, v_b, 'Got it, reading now');

  SELECT COUNT(*) INTO v_n
  FROM messages WHERE sender_id = v_b AND attachments = '[]'::jsonb;
  ASSERT v_n = 1, 'messages: attachments did not default to an empty array';

  -- ------------------------------------------------------------
  -- 2. A message has to carry something
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO messages (conversation_id, sender_id, content) VALUES (v_conv, v_a, '   ');
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    v_message := SQLERRM;
  END;
  ASSERT v_failed, 'messages: an empty message with no files was accepted';

  -- ------------------------------------------------------------
  -- 3. attachments is an array, of at most five
  -- ------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO messages (conversation_id, sender_id, content, attachments)
    VALUES (v_conv, v_a, 'shaped wrong', '{"path":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'messages: an object was accepted where an array belongs';

  v_failed := FALSE;
  BEGIN
    INSERT INTO messages (conversation_id, sender_id, content, attachments)
    VALUES (v_conv, v_a, 'too many',
            v_file || v_file || v_file || v_file || v_file || v_file);
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'messages: six attachments were accepted';

  -- ------------------------------------------------------------
  -- 4. The predicate the storage policies are built from
  -- ------------------------------------------------------------
  ASSERT safe_uuid('not-a-uuid') IS NULL, 'safe_uuid: junk did not come back NULL';
  ASSERT safe_uuid(NULL) IS NULL, 'safe_uuid: NULL did not come back NULL';
  ASSERT safe_uuid(v_conv::TEXT) = v_conv, 'safe_uuid: a real uuid was mangled';

  ASSERT is_conversation_participant(safe_uuid('00000000-0000-4000-8000-0000000009c1'), v_b),
    'storage predicate: a participant was refused their own thread';
  ASSERT NOT is_conversation_participant(v_conv, v_c),
    'storage predicate: an outsider matched a thread they are not in';
  ASSERT NOT is_conversation_participant(safe_uuid('avatars-are-not-uuids'), v_a),
    'storage predicate: a non-uuid folder matched a conversation';

  RAISE NOTICE 'Migration 095 constraint assertions all held.';
END $$;

-- ------------------------------------------------------------
-- 5. A file is as private as its message
--
-- Outside the DO block so the role really switches — RLS is bypassed by
-- the editor's owner role, so the policy can only be read honestly as
-- `authenticated` with a forged JWT claim.
-- ------------------------------------------------------------

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000952","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
  FROM messages
  WHERE conversation_id = '00000000-0000-4000-8000-0000000009c1'
    AND jsonb_array_length(attachments) > 0;
  ASSERT v_n = 2, 'messages: a participant could not read the files sent to them (saw ' || v_n || ')';
END $$;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000953","role":"authenticated"}';
DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
  FROM messages WHERE conversation_id = '00000000-0000-4000-8000-0000000009c1';
  ASSERT v_n = 0, 'messages: an outsider read a thread they are not in (saw ' || v_n || ')';

  RAISE NOTICE 'Migration 095 RLS assertions all held.';
END $$;

RESET ROLE;

ROLLBACK;
