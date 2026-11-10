-- ============================================================
-- Hand-run test for migration 204 (secondary email policy).
--
-- Paste into the Supabase SQL editor and run. Seeds fixtures, asserts, and
-- ROLLBACKs. A failing ASSERT aborts with its message; silence means pass.
--
-- What is being defended:
--   1. The academic-shape test: .edu, .edu.xx, .ac.xx, .sch.xx, k12.
--   2. A domain listed on a non-chamber, non-rejected institution is school,
--      subdomains included; a chamber's or a rejected institution's is not.
--   3. Free mail, work and ministry domains are not school.
--   4. my_secondary_email_status(): missing, pending, expired, verified,
--      both-school, and an alias promoted to primary.
--
-- Requires 056, 064 and 204.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school  UUID := '00000000-0000-4000-8000-000000002040';
  v_chamber UUID := '00000000-0000-4000-8000-000000002041';
  v_reject  UUID := '00000000-0000-4000-8000-000000002042';
BEGIN
  INSERT INTO institutions (id, slug, name, kind, country_code, email_domains, status)
  VALUES
    (v_school,  'test-204-school',  'Test 204 School',  'school',  'LC', ARRAY['stjoseph.lc'], 'pending'),
    (v_chamber, 'test-204-chamber', 'Test 204 Chamber', 'chamber', 'LC', ARRAY['chamber204.lc'], 'pending'),
    (v_reject,  'test-204-reject',  'Test 204 Reject',  'school',  'LC', ARRAY['reject204.lc'], 'rejected');
END $$;

-- 1. Shape
DO $$
BEGIN
  ASSERT is_school_email('a@my.uwi.edu'),          'my.uwi.edu is school';
  ASSERT is_school_email('a@salcc.edu.lc'),        'salcc.edu.lc is school';
  ASSERT is_school_email('A@Stmarys.Edu.Gd'),      'case-insensitive';
  ASSERT is_school_email('a@ox.ac.uk'),            '.ac.uk is school';
  ASSERT is_school_email('a@hill.sch.uk'),         '.sch.uk is school';
  ASSERT is_school_email('a@pupils.k12.ny.us'),    'k12 is school';
  ASSERT NOT is_school_email('a@education.gov.lc'),'"education" is not .edu';
  ASSERT NOT is_school_email('a@edu.example.com'), 'edu as a leading label is not school';
END $$;

-- 2. Institutions
DO $$
BEGIN
  ASSERT is_school_email('a@stjoseph.lc'),          'institution domain is school';
  ASSERT is_school_email('a@students.stjoseph.lc'), 'institution subdomain is school';
  ASSERT NOT is_school_email('a@notstjoseph.lc'),   'suffix without a dot is not a subdomain';
  ASSERT NOT is_school_email('a@chamber204.lc'),    'a chamber is not a school';
  ASSERT NOT is_school_email('a@reject204.lc'),     'a rejected institution is not a school';
END $$;

-- 3. Everything else
DO $$
BEGIN
  ASSERT NOT is_school_email('a@gmail.com'), 'gmail';
  ASSERT NOT is_school_email('a@oecs.int'),  'trusted work domain';
  ASSERT NOT is_school_email('a@gov.lc'),    'ministry';
  ASSERT NOT is_school_email(''),            'empty';
  ASSERT NOT is_school_email(NULL),          'null';
END $$;

-- 4. Status
DO $$
DECLARE
  v_user UUID := '00000000-0000-4000-8000-000000002043';
  s JSONB;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'pupil-204@salcc.edu.lc', '', NOW(), NOW(), NOW(),
    '{}'::JSONB, jsonb_build_object('display_name', 'Pupil 204', 'country', 'Saint Lucia')
  );

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::TEXT, TRUE);

  s := my_secondary_email_status();
  ASSERT (s->>'has_secondary')::BOOLEAN = FALSE, 'no alias: has_secondary false';
  ASSERT (s->>'compliant')::BOOLEAN = FALSE,     'no alias: not compliant';
  ASSERT (s->>'primary_school')::BOOLEAN = TRUE, 'primary is school';

  INSERT INTO user_email_aliases (user_id, email, verification_token, token_expires_at)
  VALUES (v_user, 'pupil204@gmail.com', 'tok204', now() + interval '1 day');
  s := my_secondary_email_status();
  ASSERT (s->>'pending_live')::BOOLEAN = TRUE, 'pending alias is live';
  ASSERT (s->>'compliant')::BOOLEAN = TRUE,    'pending personal alias is compliant';

  UPDATE user_email_aliases SET token_expires_at = now() - interval '1 minute' WHERE user_id = v_user;
  s := my_secondary_email_status();
  ASSERT (s->>'compliant')::BOOLEAN = FALSE, 'expired pending alias is not compliant';

  UPDATE user_email_aliases
     SET verified_at = now(), verification_token = NULL, token_expires_at = NULL
   WHERE user_id = v_user;
  s := my_secondary_email_status();
  ASSERT (s->>'verified')::BOOLEAN = TRUE,  'verified';
  ASSERT (s->>'compliant')::BOOLEAN = TRUE, 'verified personal alias is compliant';

  UPDATE user_email_aliases SET email = 'pupil204@my.uwi.edu' WHERE user_id = v_user;
  s := my_secondary_email_status();
  ASSERT (s->>'secondary_school')::BOOLEAN = TRUE, 'secondary is school';
  ASSERT (s->>'compliant')::BOOLEAN = FALSE,       'two school addresses are not compliant';

  UPDATE user_email_aliases SET email = 'pupil-204@salcc.edu.lc' WHERE user_id = v_user;
  s := my_secondary_email_status();
  ASSERT (s->>'has_secondary')::BOOLEAN = FALSE, 'alias equal to primary backs nothing up';
  ASSERT (s->>'compliant')::BOOLEAN = FALSE,     'alias equal to primary is not compliant';
END $$;

ROLLBACK;
