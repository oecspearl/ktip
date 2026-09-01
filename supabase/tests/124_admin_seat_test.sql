-- ============================================================
-- Hand-run test for migration 124 (the Admin seat and the Super Admin ceiling).
--
-- Same workflow as the 116 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs — nothing is left behind. A failing
-- ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- What is being defended:
--   1. admin holds every permission key, exactly as super_admin does, and
--      is_platform_admin() admits both. That is the "admin is what super_admin
--      is today" half of the change.
--   2. is_super_admin() admits only the top seat, and holds_admin_seat() marks
--      exactly the two seats — a supervisor is NOT a seat.
--   3. An Admin can appoint and re-role a supervisor, but cannot grant or
--      strip a seat, and cannot touch the roles of a seat holder. A Super
--      Admin can.
--   4. The last super_admin cannot be demoted, by anyone.
--   5. An Admin can suspend a supervisor or a member; cannot suspend the other
--      Admin or the Super Admin; a Super Admin can suspend an Admin; nobody can
--      suspend a Super Admin or themselves.
--   6. The bare-UPDATE bypass is closed: an Admin writing is_suspended onto
--      the Super Admin's row is refused by the guard trigger, and so is a
--      supervisor holding moderation:escalate writing onto an Admin's row.
--   7. can_administer_account() answers the same way for the edge routes.
--
-- Requires 063, 090, 110, 116 and 124 to be applied first, and a role that can
-- write auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   boss     super_admin
--   deputy   admin
--   other    admin (a second seat holder — the peer case)
--   marvin   people_supervisor (holds moderation:escalate; NOT a seat)
--   member   entrepreneur
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
  v_other  UUID := '00000000-0000-4000-8000-000000001244';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_boss, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'boss-124@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Boss 124', 'country', 'Saint Lucia')),
    (v_deputy, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'deputy-124@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Deputy 124', 'country', 'Saint Lucia')),
    (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'other-124@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Other 124', 'country', 'Saint Lucia')),
    (v_marvin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marvin-124@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Marvin 124', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-124@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 124', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_boss,   'Boss 124',   ARRAY['super_admin'],       'Saint Lucia'),
    (v_deputy, 'Deputy 124', ARRAY['admin'],             'Saint Lucia'),
    (v_other,  'Other 124',  ARRAY['admin'],             'Saint Lucia'),
    (v_marvin, 'Marvin 124', ARRAY['people_supervisor'], 'Saint Lucia'),
    (v_member, 'Member 124', ARRAY['entrepreneur'],      'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles, is_suspended = FALSE;
END $$;

-- ------------------------------------------------------------
-- 1. The seat landed, and it is full
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
  v_key    TEXT;
  v_missing INT;
BEGIN
  ASSERT (SELECT tier FROM role_definitions WHERE slug = 'admin') = 'admin',
    'admin must be admin tier';
  ASSERT NOT (SELECT is_self_assignable FROM role_definitions WHERE slug = 'admin'),
    'admin must never be self-assignable at signup';

  SELECT COUNT(*) INTO v_missing
  FROM permission_definitions pd
  WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_slug = 'admin' AND rp.permission_key = pd.key AND rp.allowed
  );
  ASSERT v_missing = 0, 'admin is missing ' || v_missing || ' permission cell(s)';

  FOR v_key IN SELECT key FROM permission_definitions LOOP
    ASSERT has_permission(v_deputy, v_key) = has_permission(v_boss, v_key),
      'admin and super_admin disagree on ' || v_key;
  END LOOP;

  ASSERT (SELECT COUNT(*) FROM default_role_permissions() WHERE role_slug = 'admin')
       = (SELECT COUNT(*) FROM permission_definitions),
    'default_role_permissions() must list every key for admin';

  ASSERT is_platform_admin(v_boss),       'super_admin must be a platform admin';
  ASSERT is_platform_admin(v_deputy),     'admin must be a platform admin';
  ASSERT NOT is_platform_admin(v_marvin), 'a supervisor is not a platform admin';
  ASSERT NOT is_platform_admin(v_member), 'a member is not a platform admin';
END $$;

-- ------------------------------------------------------------
-- 2. The ceiling test admits only the top seat; the seat set is exactly two
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
BEGIN
  ASSERT is_super_admin(v_boss),       'boss must be super admin';
  ASSERT NOT is_super_admin(v_deputy), 'admin must NOT be super admin';
  ASSERT NOT is_super_admin(v_marvin), 'supervisor must NOT be super admin';
  ASSERT NOT is_super_admin(NULL),     'NULL must not be super admin';

  ASSERT holds_admin_seat(v_boss),       'boss holds a seat';
  ASSERT holds_admin_seat(v_deputy),     'deputy holds a seat';
  ASSERT NOT holds_admin_seat(v_marvin), 'a supervisor is NOT a seat — the Admin manages them';
  ASSERT NOT holds_admin_seat(v_member), 'a member holds no seat';

  ASSERT seat_roles(ARRAY['oecs', 'mentor']) = ARRAY['super_admin'],
    'seat_roles must resolve the legacy alias, got ' || seat_roles(ARRAY['oecs', 'mentor'])::TEXT;
  ASSERT seat_roles(ARRAY['safety_admin', 'people_supervisor', 'programme_supervisor']) = ARRAY[]::TEXT[],
    'no admin-tier role other than the two seats may count as a seat';
END $$;

-- ------------------------------------------------------------
-- 3. Role assignment: the Admin manages the roles under the seat, not the seat
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
  v_other  UUID := '00000000-0000-4000-8000-000000001244';
  v_result JSONB;
BEGIN
  -- Acting as the Admin.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_deputy)::text, TRUE);

  -- Ordinary assignment works: admin holds role:manage.
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to assign ordinary roles: ' || v_result::TEXT;

  -- Appointing a supervisor or a safety admin works too: those roles sit
  -- under the Admin. This is what 116's admin-tier ceiling used to refuse.
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'safety_admin']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to appoint a safety admin: ' || v_result::TEXT;
  v_result := set_user_roles(v_marvin, ARRAY['people_supervisor', 'programme_supervisor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to re-role a supervisor: ' || v_result::TEXT;
  v_result := set_user_roles(v_marvin, ARRAY['people_supervisor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to narrow a supervisor: ' || v_result::TEXT;
  v_result := set_user_roles(v_member, ARRAY['entrepreneur']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to take safety_admin back: ' || v_result::TEXT;

  -- Granting a seat does not.
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'admin']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not grant the admin seat';
  ASSERT v_result->>'reason' = 'seat_requires_super_admin',
    'expected seat_requires_super_admin, got: ' || COALESCE(v_result->>'reason', 'NULL');
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'super_admin']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not grant super_admin';
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'oecs']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not grant the legacy alias of super_admin';

  -- Nor does touching the roles of a seat holder: the boss, or the other Admin.
  v_result := set_user_roles(v_boss, ARRAY['entrepreneur']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not strip super_admin';
  ASSERT v_result->>'reason' = 'seat_requires_super_admin',
    'expected seat_requires_super_admin on strip, got: ' || COALESCE(v_result->>'reason', 'NULL');
  v_result := set_user_roles(v_other, ARRAY['admin', 'mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not re-role the other admin';
  v_result := set_user_roles(v_other, ARRAY['mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not strip the other admin';

  ASSERT 'super_admin' = ANY((SELECT roles FROM profiles WHERE id = v_boss)),
    'the boss must still hold super_admin';
  ASSERT 'admin' = ANY((SELECT roles FROM profiles WHERE id = v_other)),
    'the other admin must still hold admin';

  -- Acting as the Super Admin: all of the above is allowed.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);

  v_result := set_user_roles(v_other, ARRAY['admin', 'mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'super_admin must be able to re-role an admin: ' || v_result::TEXT;
  v_result := set_user_roles(v_other, ARRAY['admin']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'super_admin must be able to narrow an admin: ' || v_result::TEXT;
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'admin']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'super_admin must be able to grant admin: ' || v_result::TEXT;
  v_result := set_user_roles(v_member, ARRAY['entrepreneur']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'super_admin must be able to take admin back: ' || v_result::TEXT;
END $$;

-- ------------------------------------------------------------
-- 4. The last Super Admin keeps the slug
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_result JSONB;
  v_others INT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);

  -- Only meaningful when the fixture boss is the sole super_admin. On a live
  -- database with a real one the demotion is allowed and the check is skipped
  -- rather than failed.
  SELECT COUNT(*) INTO v_others FROM profiles
  WHERE id <> v_boss AND 'super_admin' = ANY(expand_roles(roles));

  IF v_others = 0 THEN
    v_result := set_user_roles(v_boss, ARRAY['admin']);
    ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'the last super_admin must not be demotable';
    ASSERT v_result->>'reason' = 'last_super_admin',
      'expected last_super_admin, got: ' || COALESCE(v_result->>'reason', 'NULL');
  ELSE
    RAISE NOTICE 'section 4 skipped: % other super_admin account(s) exist on this database', v_others;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Suspension: who may stop whom logging in
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
  v_other  UUID := '00000000-0000-4000-8000-000000001244';
  v_result JSONB;
BEGIN
  -- As the Admin: members and supervisors, yes.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_deputy)::text, TRUE);

  v_result := set_user_suspension(v_member, TRUE, NULL, 'test');
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to suspend a member: ' || v_result::TEXT;
  ASSERT is_suspended(v_member), 'member should now be suspended';
  v_result := set_user_suspension(v_member, FALSE);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to lift a suspension: ' || v_result::TEXT;
  ASSERT NOT is_suspended(v_member), 'member should be unsuspended';

  v_result := set_user_suspension(v_marvin, TRUE, NULL, 'test');
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to suspend a supervisor: ' || v_result::TEXT;
  ASSERT is_suspended(v_marvin), 'Marvin should now be suspended';
  v_result := set_user_suspension(v_marvin, FALSE);
  ASSERT (v_result->>'ok')::BOOLEAN, 'admin must be able to reinstate a supervisor: ' || v_result::TEXT;

  -- Seat holders, no.
  v_result := set_user_suspension(v_boss, TRUE, NULL, 'coup');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not suspend the super admin';
  ASSERT v_result->>'reason' = 'super_admin_protected',
    'expected super_admin_protected, got: ' || COALESCE(v_result->>'reason', 'NULL');

  v_result := set_user_suspension(v_other, TRUE, NULL, 'rivalry');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'admin must not suspend the other admin';
  ASSERT v_result->>'reason' = 'seat_requires_super_admin',
    'expected seat_requires_super_admin, got: ' || COALESCE(v_result->>'reason', 'NULL');

  v_result := set_user_suspension(v_deputy, TRUE, NULL, 'oops');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'nobody suspends themselves';
  ASSERT v_result->>'reason' = 'cannot_suspend_self',
    'expected cannot_suspend_self, got: ' || COALESCE(v_result->>'reason', 'NULL');

  ASSERT NOT is_suspended(v_boss),  'the boss must not be suspended';
  ASSERT NOT is_suspended(v_other), 'the other admin must not be suspended';

  -- As the supervisor, who holds moderation:escalate: members yes, seats no.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_marvin)::text, TRUE);
  v_result := set_user_suspension(v_member, TRUE, NULL, 'test');
  ASSERT (v_result->>'ok')::BOOLEAN, 'a supervisor with moderation:escalate suspends members: ' || v_result::TEXT;
  v_result := set_user_suspension(v_member, FALSE);
  v_result := set_user_suspension(v_deputy, TRUE, NULL, 'test');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'a supervisor must not suspend an admin';
  ASSERT v_result->>'reason' = 'seat_requires_super_admin',
    'expected seat_requires_super_admin from supervisor, got: ' || COALESCE(v_result->>'reason', 'NULL');

  -- As the Super Admin: the Admin can be stopped, and the top seat still cannot.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);

  v_result := set_user_suspension(v_deputy, TRUE, NULL, 'stood down');
  ASSERT (v_result->>'ok')::BOOLEAN, 'super_admin must be able to suspend an admin: ' || v_result::TEXT;
  ASSERT is_suspended(v_deputy), 'deputy should now be suspended';
  ASSERT NOT has_permission(v_deputy, 'org:manage'), 'a suspended admin must hold nothing';

  v_result := set_user_suspension(v_deputy, FALSE);
  ASSERT (v_result->>'ok')::BOOLEAN, 'super_admin must be able to reinstate: ' || v_result::TEXT;
  ASSERT has_permission(v_deputy, 'org:manage'), 'a reinstated admin gets everything back';

  v_result := set_user_suspension(v_boss, TRUE, NULL, 'self');
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'the super admin cannot be suspended, even by itself';
END $$;

-- ------------------------------------------------------------
-- 6. The bare-UPDATE bypass is closed
--
-- The RPC refusals above mean nothing if the same write can be made directly:
-- the profiles UPDATE policy admits platform admins and anyone holding
-- members:manage or verification:review. The guard trigger is what stands in
-- the way, and it fires for any caller with a JWT subject.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
  v_other  UUID := '00000000-0000-4000-8000-000000001244';
  v_raised BOOLEAN;
BEGIN
  -- Admin → Super Admin's suspension column: refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_deputy)::text, TRUE);
  v_raised := FALSE;
  BEGIN
    UPDATE profiles SET is_suspended = TRUE WHERE id = v_boss;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%administrator accounts can only be changed by a super admin%',
      'expected the seat guard message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'an admin must not be able to suspend the super admin with a bare UPDATE';

  -- Admin → other Admin's roles: refused.
  v_raised := FALSE;
  BEGIN
    UPDATE profiles SET roles = ARRAY['entrepreneur'] WHERE id = v_other;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'an admin must not be able to re-role the other admin with a bare UPDATE';

  -- Admin → Super Admin's display name: fine. Only the privileged columns are fenced.
  UPDATE profiles SET display_name = 'Boss 124 (renamed)' WHERE id = v_boss;
  ASSERT (SELECT display_name FROM profiles WHERE id = v_boss) = 'Boss 124 (renamed)',
    'an admin should still be able to edit a non-privileged column';

  -- Admin → supervisor's suspension and roles: fine, the supervisor is under the Admin.
  UPDATE profiles SET is_suspended = TRUE WHERE id = v_marvin;
  ASSERT is_suspended(v_marvin), 'an admin can suspend a supervisor directly';
  UPDATE profiles SET is_suspended = FALSE, roles = ARRAY['people_supervisor', 'mentor'] WHERE id = v_marvin;
  UPDATE profiles SET roles = ARRAY['people_supervisor'] WHERE id = v_marvin;

  -- Admin → member's suspension: fine.
  UPDATE profiles SET is_suspended = TRUE WHERE id = v_member;
  ASSERT is_suspended(v_member), 'an admin can suspend a member directly';
  UPDATE profiles SET is_suspended = FALSE WHERE id = v_member;

  -- Supervisor with moderation:escalate → Admin's suspension column: refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_marvin)::text, TRUE);
  v_raised := FALSE;
  BEGIN
    UPDATE profiles SET is_suspended = TRUE WHERE id = v_deputy;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'a supervisor must not be able to suspend an admin with a bare UPDATE';

  -- Super Admin → Admin: allowed.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);
  UPDATE profiles SET is_suspended = TRUE WHERE id = v_deputy;
  ASSERT is_suspended(v_deputy), 'the super admin can suspend an admin directly';
  UPDATE profiles SET is_suspended = FALSE WHERE id = v_deputy;
END $$;

-- ------------------------------------------------------------
-- 7. The edge routes ask the same question
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001240';
  v_deputy UUID := '00000000-0000-4000-8000-000000001241';
  v_marvin UUID := '00000000-0000-4000-8000-000000001242';
  v_member UUID := '00000000-0000-4000-8000-000000001243';
  v_other  UUID := '00000000-0000-4000-8000-000000001244';
BEGIN
  ASSERT can_administer_account(v_member, v_deputy),     'admin may administer a member';
  ASSERT can_administer_account(v_marvin, v_deputy),     'admin may administer a supervisor';
  ASSERT NOT can_administer_account(v_other, v_deputy),  'admin may not administer the other admin';
  ASSERT NOT can_administer_account(v_boss, v_deputy),   'admin may not administer the super admin';
  ASSERT NOT can_administer_account(v_deputy, v_deputy), 'nobody administers themselves';

  ASSERT can_administer_account(v_deputy, v_boss),       'super admin may administer an admin';
  ASSERT can_administer_account(v_marvin, v_boss),       'super admin may administer a supervisor';
  ASSERT NOT can_administer_account(v_boss, v_boss),     'not even the super admin administers themselves';

  ASSERT NOT can_administer_account(v_deputy, v_marvin), 'a supervisor may not administer an admin';
  ASSERT can_administer_account(v_member, v_marvin),     'a supervisor may administer a member (the route keys still apply)';
  ASSERT NOT can_administer_account(v_member, NULL),     'no actor, no answer';

  -- The one-argument form reads auth.uid().
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_deputy)::text, TRUE);
  ASSERT can_administer_account(v_marvin),     'one-arg form: admin may administer a supervisor';
  ASSERT NOT can_administer_account(v_boss),   'one-arg form: admin may not administer the super admin';
END $$;

ROLLBACK;
