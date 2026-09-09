-- ============================================================
-- Hand-run test for migration 145 (verification by email domain).
--
-- Same workflow as the 124 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- What is being defended:
--   1. Every verified account carries a reason (the 142 backfill).
--   2. A confirmed address at a TRUSTED DOMAIN verifies the account on INSERT
--      into auth.users — no RPC, no click.
--   3. An address at a verified INSTITUTION domain queues a pending student
--      (064's behaviour) until the institution opts in; then the claim RPC
--      approves it with no educator, sets the role, the flag and the reason.
--   4. A ROSTER entry approves on the spot whatever domain the address is on,
--      and the row is marked claimed.
--   5. An unknown domain writes nothing and says so.
--   6. A trusted domain cannot carry an admin seat or a free-mail provider,
--      and cannot be written by anyone without verification:review.
--   7. A proof token, once consumed, runs the same decision.
--   8. A member cannot write their own verified_via.
--   9. Submitting a document notifies the reviewers.
--
-- Requires 064, 125, 139, 143 and 145 to be applied first, and a role that can
-- write auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   boss      super_admin (works the queue, manages roles)
--   igo       address at the trusted domain            -> verified on insert
--   member    address at an unknown domain, entrepreneur
--   student   address at the institution's domain      -> pending, then approved
--   rostered  personal address the institution listed  -> approved on insert
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss     UUID := '00000000-0000-4000-8000-000000001450';
  v_igo      UUID := '00000000-0000-4000-8000-000000001451';
  v_member   UUID := '00000000-0000-4000-8000-000000001452';
  v_student  UUID := '00000000-0000-4000-8000-000000001453';
  v_rostered UUID := '00000000-0000-4000-8000-000000001454';
  v_inst     UUID := '00000000-0000-4000-8000-000000001455';
BEGIN
  -- The admin exists before anything else so it can be the institution's verifier.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (v_boss, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'boss-145@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Boss 145', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('ktip.bypass_seat_cap', 'on', TRUE);
  INSERT INTO profiles (id, display_name, roles, country)
  VALUES (v_boss, 'Boss 145', ARRAY['super_admin'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles, is_suspended = FALSE;

  -- Trusted domain and verified institution, in place BEFORE the members
  -- sign up, so the INSERT trigger has something to match.
  INSERT INTO trusted_email_domains (domain, label, created_by)
  VALUES ('trusted-145.test', 'Test IGO', v_boss)
  ON CONFLICT (domain) DO UPDATE SET is_active = TRUE, grants_role = NULL;

  INSERT INTO institutions (id, slug, name, kind, country_code, email_domains, status,
                            verified_by, verified_at, created_by, auto_approve_students)
  VALUES (v_inst, 'test-college-145', 'Test College 145', 'university', 'LC',
          ARRAY['college-145.test'], 'verified', v_boss, NOW(), v_boss, FALSE)
  ON CONFLICT (id) DO UPDATE SET auto_approve_students = FALSE, status = 'verified';

  INSERT INTO institution_rosters (institution_id, email, role, added_by)
  VALUES (v_inst, 'rostered-145@gmail.com', 'student', v_boss),
         (v_inst, 'spare-145@gmail.com', 'student', v_boss)
  ON CONFLICT (institution_id, email) DO NOTHING;

  -- Now the members. email_confirmed_at is set, so the INSERT trigger fires.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES
    (v_igo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'igo-145@trusted-145.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'IGO 145', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-145@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 145', 'country', 'Saint Lucia')),
    (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'student-145@college-145.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Student 145', 'country', 'Saint Lucia')),
    (v_rostered, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rostered-145@gmail.com', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Rostered 145', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  -- The entrepreneur role for the unknown-domain member; the others keep
  -- whatever the trigger gave them, which is the point of the test.
  UPDATE profiles SET roles = ARRAY['entrepreneur'] WHERE id = v_member;
END $$;

-- ------------------------------------------------------------
-- 1. Provenance: nobody verified is without a reason
-- ------------------------------------------------------------
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM profiles WHERE COALESCE(is_verified, FALSE) AND verified_via IS NULL;
  ASSERT v_n = 0, v_n || ' verified profile(s) carry no verified_via';
END $$;

-- ------------------------------------------------------------
-- 2. Trusted domain: verified on INSERT, no RPC
-- ------------------------------------------------------------
DO $$
DECLARE
  v_igo UUID := '00000000-0000-4000-8000-000000001451';
  p profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = v_igo;
  ASSERT p.is_verified, 'igo must be verified by the auth.users INSERT trigger';
  ASSERT p.verified_via = 'domain', 'igo verified_via must be domain, got ' || COALESCE(p.verified_via, 'NULL');
  ASSERT p.verified_at IS NOT NULL, 'igo verified_at must be set';
  ASSERT is_verified_member(v_igo), 'igo must pass the 139 gate';
  ASSERT EXISTS (SELECT 1 FROM notifications WHERE user_id = v_igo AND type = 'verification_result'),
    'igo must be told';
END $$;

-- ------------------------------------------------------------
-- 3. Institution domain: pending until the institution opts in
-- ------------------------------------------------------------
DO $$
DECLARE
  v_student UUID := '00000000-0000-4000-8000-000000001453';
  v_inst    UUID := '00000000-0000-4000-8000-000000001455';
  v_result  JSONB;
  p profiles%ROWTYPE;
BEGIN
  ASSERT (SELECT status FROM institution_members WHERE user_id = v_student AND institution_id = v_inst) = 'pending',
    'student must be queued pending with the institution';
  ASSERT EXISTS (SELECT 1 FROM student_safeguarding WHERE user_id = v_student AND verified_domain = 'college-145.test'),
    'student safeguarding record must exist';
  SELECT * INTO p FROM profiles WHERE id = v_student;
  ASSERT NOT COALESCE(p.is_verified, FALSE), 'a pending student is not yet verified';
  ASSERT NOT ('student' = ANY(p.roles)), 'a pending student does not hold the role yet';

  -- Claiming again while pending changes nothing.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student)::text, TRUE);
  v_result := claim_email_verification();
  ASSERT v_result->>'outcome' = 'student_pending', 'expected student_pending, got ' || v_result::text;

  -- The institution opts in; the next claim approves with no educator.
  UPDATE institutions SET auto_approve_students = TRUE WHERE id = v_inst;
  v_result := claim_email_verification();
  ASSERT v_result->>'outcome' = 'student_approved', 'expected student_approved, got ' || v_result::text;
  ASSERT v_result->>'granted_role' = 'student', 'granted_role must be student';

  SELECT * INTO p FROM profiles WHERE id = v_student;
  ASSERT 'student' = ANY(p.roles), 'student must now hold the role';
  ASSERT p.is_verified AND p.verified_via = 'institution',
    'student must be verified via institution, got ' || COALESCE(p.verified_via, 'NULL');
  ASSERT (SELECT status FROM institution_members WHERE user_id = v_student AND institution_id = v_inst) = 'approved',
    'membership must read approved';
  ASSERT (SELECT approved_by FROM institution_members WHERE user_id = v_student AND institution_id = v_inst) IS NULL,
    'an automatic approval records no approver';

  -- Idempotent: a third claim is a no-op.
  v_result := claim_email_verification();
  ASSERT v_result->>'outcome' = 'already_member', 'expected already_member, got ' || v_result::text;
END $$;

-- ------------------------------------------------------------
-- 4. Roster: approved on INSERT, whatever the domain
-- ------------------------------------------------------------
DO $$
DECLARE
  v_rostered UUID := '00000000-0000-4000-8000-000000001454';
  v_inst     UUID := '00000000-0000-4000-8000-000000001455';
  p profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = v_rostered;
  ASSERT p.is_verified AND p.verified_via = 'roster',
    'rostered must be verified via roster, got ' || COALESCE(p.verified_via, 'NULL');
  ASSERT 'student' = ANY(p.roles), 'rostered must hold the student role';
  ASSERT (SELECT claimed_by FROM institution_rosters WHERE institution_id = v_inst AND email = 'rostered-145@gmail.com') = v_rostered,
    'the roster row must be marked claimed by the member';
  ASSERT (SELECT claimed_by FROM institution_rosters WHERE institution_id = v_inst AND email = 'spare-145@gmail.com') IS NULL,
    'the other roster row is untouched';
  ASSERT classify_verification_email('spare-145@gmail.com') = 'roster', 'an unclaimed roster address classifies as roster';
  ASSERT classify_verification_email('rostered-145@gmail.com') = 'unknown', 'a claimed roster address on gmail is unknown again';
END $$;

-- ------------------------------------------------------------
-- 5. Unknown domain: nothing written
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001452';
  v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  v_result := claim_email_verification();
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE AND v_result->>'reason' = 'domain_not_recognised',
    'expected domain_not_recognised, got ' || v_result::text;
  ASSERT NOT COALESCE((SELECT is_verified FROM profiles WHERE id = v_member), FALSE), 'member stays unverified';
  ASSERT NOT EXISTS (SELECT 1 FROM institution_members WHERE user_id = v_member), 'no membership row for an unknown domain';
  ASSERT classify_verification_email('member-145@ktip.test') = 'unknown', 'ktip.test is unknown';
  ASSERT classify_verification_email('x@trusted-145.test') = 'trusted', 'the trusted domain classifies as trusted';
  ASSERT classify_verification_email('x@college-145.test') = 'institution', 'the college domain classifies as institution';
END $$;

-- ------------------------------------------------------------
-- 6. The trusted list is guarded
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001450';
  v_member UUID := '00000000-0000-4000-8000-000000001452';
  v_result JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  v_result := set_trusted_email_domain('member-owned.test', 'Nope');
  ASSERT v_result->>'reason' = 'forbidden', 'a member cannot trust a domain, got ' || v_result::text;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);
  v_result := set_trusted_email_domain('gmail.com', 'Everyone');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'gmail.com must be refused, got ' || v_result::text;

  v_result := set_trusted_email_domain('seat-145.test', 'Seat', 'super_admin');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'an admin seat cannot ride on a domain, got ' || v_result::text;

  v_result := set_trusted_email_domain('school-145.test', 'School', 'student');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'student is institution-bound and cannot ride on a domain';

  v_result := set_trusted_email_domain('@Ministry-145.test ', 'Ministry', 'government');
  ASSERT (v_result->>'ok')::BOOLEAN AND v_result->>'domain' = 'ministry-145.test',
    'a government role on a ministry domain is allowed and normalised, got ' || v_result::text;

  -- Pausing stops new verifications; classification follows.
  v_result := set_trusted_email_domain('ministry-145.test', 'Ministry', 'government', FALSE);
  ASSERT classify_verification_email('x@ministry-145.test') = 'unknown', 'a paused domain is unknown';
END $$;

-- ------------------------------------------------------------
-- 7. A proof token runs the same decision, and grants the role
-- ------------------------------------------------------------
DO $$
DECLARE
  v_member UUID := '00000000-0000-4000-8000-000000001452';
  v_boss   UUID := '00000000-0000-4000-8000-000000001450';
  v_token  TEXT := repeat('a', 64);
  v_result JSONB;
  p profiles%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);
  PERFORM set_trusted_email_domain('ministry-145.test', 'Ministry', 'government', TRUE);

  INSERT INTO email_proofs (user_id, email, verification_token, token_expires_at, last_sent_at, send_count)
  VALUES (v_member, 'member-work@ministry-145.test', v_token, now() + interval '1 hour', now(), 1);

  v_result := confirm_email_proof('not-a-real-token');
  ASSERT v_result->>'reason' = 'not_found', 'an unknown token is not_found';

  v_result := confirm_email_proof(v_token);
  ASSERT v_result->>'outcome' = 'verified', 'expected verified, got ' || v_result::text;
  ASSERT v_result->>'email' = 'member-work@ministry-145.test', 'the confirmed email comes back';

  SELECT * INTO p FROM profiles WHERE id = v_member;
  ASSERT p.is_verified AND p.verified_via = 'domain', 'member is verified via domain';
  ASSERT 'government' = ANY(p.roles), 'the domain role was granted';
  ASSERT (SELECT verified_at FROM email_proofs WHERE verification_token IS NULL AND user_id = v_member) IS NOT NULL,
    'the proof is marked verified and the token nulled';

  v_result := confirm_email_proof(v_token);
  ASSERT v_result->>'reason' = 'not_found', 'a consumed token is not_found';
END $$;

-- ------------------------------------------------------------
-- 8. A member cannot write their own reason
-- ------------------------------------------------------------
DO $$
DECLARE
  v_student UUID := '00000000-0000-4000-8000-000000001453';
  v_raised BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student)::text, TRUE);
  BEGIN
    UPDATE profiles SET verified_via = 'admin' WHERE id = v_student;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'a member writing verified_via must be refused';
END $$;

-- ------------------------------------------------------------
-- 9. The queue announces itself
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001450';
  v_member UUID := '00000000-0000-4000-8000-000000001452';
  v_before INT;
  v_after  INT;
BEGIN
  SELECT count(*) INTO v_before FROM notifications WHERE user_id = v_boss AND type = 'verification_request';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member)::text, TRUE);
  INSERT INTO verification_requests (user_id, document_paths) VALUES (v_member, ARRAY['x/y.pdf']);
  SELECT count(*) INTO v_after FROM notifications WHERE user_id = v_boss AND type = 'verification_request';
  ASSERT v_after = v_before + 1, 'the super admin must be notified of a new request';
  ASSERT NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = v_member AND type = 'verification_request'),
    'the submitter is not notified of their own request';
END $$;

ROLLBACK;
