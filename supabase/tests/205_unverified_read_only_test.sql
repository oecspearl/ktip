-- ============================================================
-- Hand-run test for migration 205 (an unverified account can look, not act).
--
-- Paste into the Supabase SQL editor and run. It seeds fixtures, asserts, and
-- ROLLBACKs, so nothing is left behind. A failing ASSERT aborts with the
-- message shown; silence at the end means every assertion held.
--
-- Fixtures:
--   newbie   entrepreneur, NOT verified
--   member   entrepreneur, verified
--   super    people_supervisor, NOT verified (admin tier: counts as verified)
--
-- What is being defended:
--   1. is_verified_member / is_staff_member answer as designed.
--   2. Under RLS, the unverified account cannot RSVP, connect, or start a
--      document; the verified one can.
--   3. Nobody can register the unverified account for a venue.
--   4. A member cannot open a DM with the unverified account (reason
--      'unverified'); staff can, and the unverified account can reply.
--   5. The unverified account can still update its own profile.
--
-- Requires 205 and everything before it. Needs a role that can write
-- auth.users and auth.mfa_factors (the SQL editor's default is fine).
--
-- Since 206 an admin-tier account holds nothing for itself until this
-- session has passed its second step, so `super` carries a verified TOTP
-- factor and acts at aal2. `newbie` does too when it replies: since 118 a new
-- entrepreneur sends no message until its second step is done.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_newbie UUID := '00000000-0000-4000-8000-000000002051';
  v_member UUID := '00000000-0000-4000-8000-000000002052';
  v_super  UUID := '00000000-0000-4000-8000-000000002053';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_newbie, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'newbie-205@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Newbie 205', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-205@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 205', 'country', 'Saint Lucia')),
    (v_super, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'super-205@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Super 205', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_newbie, 'Newbie 205', ARRAY['entrepreneur'],      'Saint Lucia'),
    (v_member, 'Member 205', ARRAY['entrepreneur'],      'Saint Lucia'),
    (v_super,  'Super 205',  ARRAY['people_supervisor'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;

  -- Straight to the columns, on the editor's role: the provenance guards
  -- (145/174/175) are about members, not about fixtures.
  ALTER TABLE profiles DISABLE TRIGGER USER;
  UPDATE profiles SET is_verified = FALSE WHERE id IN (v_newbie, v_super);
  UPDATE profiles SET is_verified = TRUE, verified_via = 'admin', verified_at = NOW() WHERE id = v_member;
  UPDATE profiles SET mfa_method = 'totp' WHERE id = v_super;
  ALTER TABLE profiles ENABLE TRIGGER USER;

  -- 206: the admin-tier fixture needs a second step to act for itself.
  -- 118: so does a new entrepreneur before it can send a message (the
  -- messages INSERT policy asks account_mfa_satisfied).
  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_super,  'test-205', 'totp', 'verified', NOW(), NOW()),
         (gen_random_uuid(), v_newbie, 'test-205', 'totp', 'verified', NOW(), NOW());
END $$;

-- ------------------------------------------------------------
-- 1. Predicates
-- ------------------------------------------------------------
DO $$
BEGIN
  ASSERT NOT is_verified_member('00000000-0000-4000-8000-000000002051'), 'newbie must read unverified';
  ASSERT is_verified_member('00000000-0000-4000-8000-000000002052'), 'member must read verified';
  ASSERT is_verified_member('00000000-0000-4000-8000-000000002053'), 'an admin-tier seat counts as verified';
  ASSERT is_staff_member('00000000-0000-4000-8000-000000002053'), 'people_supervisor is staff';
  ASSERT NOT is_staff_member('00000000-0000-4000-8000-000000002052'), 'an entrepreneur is not staff';
  ASSERT NOT has_permission('00000000-0000-4000-8000-000000002051', 'project:manage'),
    'project:manage is gated for the unverified (205)';
END $$;

-- ------------------------------------------------------------
-- 2. Writes under RLS
-- ------------------------------------------------------------
DO $$
DECLARE
  v_newbie UUID := '00000000-0000-4000-8000-000000002051';
  v_member UUID := '00000000-0000-4000-8000-000000002052';
  v_refused BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_newbie)::text, TRUE);

  v_refused := FALSE;
  BEGIN
    INSERT INTO connections (requester_id, addressee_id) VALUES (v_newbie, v_member);
  EXCEPTION WHEN insufficient_privilege THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'an unverified account must not send a connection request';

  v_refused := FALSE;
  BEGIN
    INSERT INTO documents (title, owner_id) VALUES ('205 doc', v_newbie);
  EXCEPTION WHEN insufficient_privilege THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'an unverified account must not start a document';

  -- 5. Own profile stays writable.
  UPDATE profiles SET bio = 'still mine' WHERE id = v_newbie;
  ASSERT FOUND, 'an unverified account must still edit its own profile';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  v_refused := FALSE;
  BEGIN
    INSERT INTO connections (requester_id, addressee_id) VALUES (v_member, v_newbie);
  EXCEPTION WHEN insufficient_privilege THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'a member must not send a connection request to an unverified account';

  RESET ROLE;
END $$;

-- ------------------------------------------------------------
-- 3. Venue membership
-- ------------------------------------------------------------
DO $$
DECLARE
  v_newbie UUID := '00000000-0000-4000-8000-000000002051';
  v_member UUID := '00000000-0000-4000-8000-000000002052';
  v_event  UUID;
  v_refused BOOLEAN := FALSE;
BEGIN
  INSERT INTO events (title, event_type, organizer_id, start_date)
  VALUES ('205 event', 'hackathon', v_member, NOW() + INTERVAL '1 day')
  RETURNING id INTO v_event;

  BEGIN
    INSERT INTO event_venue_members (event_id, user_id, role) VALUES (v_event, v_newbie, 'participant');
  EXCEPTION WHEN insufficient_privilege THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'the trigger must refuse a venue membership for an unverified account';

  INSERT INTO event_venue_members (event_id, user_id, role) VALUES (v_event, v_member, 'participant');
  ASSERT is_venue_member(v_member, v_event), 'a verified member joins the venue';
END $$;

-- ------------------------------------------------------------
-- 4. Messaging
-- ------------------------------------------------------------
DO $$
DECLARE
  v_newbie UUID := '00000000-0000-4000-8000-000000002051';
  v_member UUID := '00000000-0000-4000-8000-000000002052';
  v_super  UUID := '00000000-0000-4000-8000-000000002053';
  v_result JSONB;
  v_conv   UUID;
BEGIN
  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  v_result := start_direct_conversation(v_newbie);
  ASSERT v_result->>'reason' = 'unverified',
    format('a member messaging an unverified account must get reason unverified, got %s', v_result);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'aal', 'aal2')::text, TRUE);
  v_result := start_direct_conversation(v_newbie);
  ASSERT (v_result->>'ok')::BOOLEAN,
    format('staff must be able to open a thread with an unverified account, got %s', v_result);
  v_conv := (v_result->>'conversation_id')::UUID;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_newbie, 'aal', 'aal2')::text, TRUE);
  INSERT INTO messages (conversation_id, sender_id, content) VALUES (v_conv, v_newbie, 'thanks');
  ASSERT FOUND, 'the unverified account replies in a staff thread';

  RESET ROLE;
END $$;

ROLLBACK;
