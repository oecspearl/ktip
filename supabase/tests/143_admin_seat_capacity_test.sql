-- ============================================================
-- Hand-run test for migration 143 (the seat establishment).
--
-- Same workflow as the 124 test: paste into the Supabase SQL editor and run.
-- It seeds fixtures, asserts, and ROLLBACKs -- nothing is left behind. A
-- failing ASSERT aborts with the message shown; silence at the end means every
-- assertion held.
--
-- What is being defended:
--   1. seat_capacity() is one Super Admin and two Admins, and NULL for
--      everything that is not a seat.
--   2. set_user_roles() refuses a seat that has no free chair, with the
--      {ok:false, reason:'seat_limit_reached', role, limit} shape the console
--      maps -- and still allows re-roling a sitting seat holder, because only
--      ADDED seats are counted.
--   3. The trigger refuses the same write coming in as a bare UPDATE, the path
--      a platform admin takes straight past guard_profile_privileged_columns().
--   4. Coming back under the establishment is always possible: removing a seat
--      is never blocked.
--   5. transfer_super_admin() moves the single top seat, is refused to an
--      Admin, and leaves exactly one Super Admin behind.
--
-- READ THIS BEFORE THE FIXTURES. Capacity counts every profile on the
-- database, not just the fixtures, so this file seeds under
-- ktip.bypass_seat_cap and then turns the flag off before asserting. On a live
-- database the fixtures put the establishment OVER its cap, which is exactly
-- the state the negative assertions need. The two assertions that need a FREE
-- chair are guarded and skip with a NOTICE instead of failing.
--
-- Requires 063, 091, 116, 124, 125 and 143 to be applied first, and a role
-- that can write auth.users (the SQL editor's default is fine).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixtures
--
--   boss     super_admin
--   deputy   admin
--   other    admin (the second chair)
--   member   entrepreneur
--   heir     entrepreneur (the account the seat is transferred to)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001430';
  v_deputy UUID := '00000000-0000-4000-8000-000000001431';
  v_other  UUID := '00000000-0000-4000-8000-000000001432';
  v_member UUID := '00000000-0000-4000-8000-000000001433';
  v_heir   UUID := '00000000-0000-4000-8000-000000001434';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_boss, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'boss-143@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Boss 143', 'country', 'Saint Lucia')),
    (v_deputy, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'deputy-143@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Deputy 143', 'country', 'Saint Lucia')),
    (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'other-143@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Other 143', 'country', 'Saint Lucia')),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-143@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Member 143', 'country', 'Saint Lucia')),
    (v_heir, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'heir-143@ktip.test', '', NOW(), NOW(), NOW(),
     '{}'::JSONB, jsonb_build_object('display_name', 'Heir 143', 'country', 'Saint Lucia'))
  ON CONFLICT (id) DO NOTHING;

  -- Seeding a whole establishment on top of the live one is the one thing the
  -- guard exists to stop, so the fixtures opt out of it explicitly. The flag
  -- is transaction-local and goes off again before the first assertion.
  PERFORM set_config('ktip.bypass_seat_cap', 'on', TRUE);

  INSERT INTO profiles (id, display_name, roles, country) VALUES
    (v_boss,   'Boss 143',   ARRAY['super_admin'],  'Saint Lucia'),
    (v_deputy, 'Deputy 143', ARRAY['admin'],        'Saint Lucia'),
    (v_other,  'Other 143',  ARRAY['admin'],        'Saint Lucia'),
    (v_member, 'Member 143', ARRAY['entrepreneur'], 'Saint Lucia'),
    (v_heir,   'Heir 143',   ARRAY['entrepreneur'], 'Saint Lucia')
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles, is_suspended = FALSE;

  PERFORM set_config('ktip.bypass_seat_cap', 'off', TRUE);
END $$;

-- ------------------------------------------------------------
-- 1. The establishment itself
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001430';
  v_member UUID := '00000000-0000-4000-8000-000000001433';
BEGIN
  ASSERT seat_capacity('super_admin') = 1, 'the top seat must be capped at one';
  ASSERT seat_capacity('admin') = 2,       'the admin seat must be capped at two';

  -- Nothing under the seats is capped, and asking is not an error.
  ASSERT seat_capacity('safety_admin') IS NULL,        'safety_admin must be uncapped';
  ASSERT seat_capacity('people_supervisor') IS NULL,   'a supervisor must be uncapped';
  ASSERT seat_capacity('entrepreneur') IS NULL,        'a member must be uncapped';

  -- The fixtures are counted, and the exclusion argument works.
  ASSERT seat_holder_count('super_admin') >= 1, 'the fixture boss must be counted';
  ASSERT seat_holder_count('admin') >= 2,       'both fixture admins must be counted';
  ASSERT seat_holder_count('super_admin', v_boss) = seat_holder_count('super_admin') - 1,
    'excluding a holder must drop the count by one';

  -- A breach is reported only for seats the write ADDS.
  ASSERT seat_capacity_breach(v_member, ARRAY['entrepreneur', 'mentor'], ARRAY['entrepreneur']) IS NULL,
    'ordinary roles must never breach the establishment';
  ASSERT seat_capacity_breach(v_member, ARRAY['entrepreneur', 'super_admin'], ARRAY['entrepreneur']) = 'super_admin',
    'a second super_admin must be reported as the breach';
END $$;

-- ------------------------------------------------------------
-- 2. set_user_roles(): the refusal, and what is still allowed
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001430';
  v_deputy UUID := '00000000-0000-4000-8000-000000001431';
  v_member UUID := '00000000-0000-4000-8000-000000001433';
  v_result JSONB;
BEGIN
  -- Acting as the Super Admin: the ceiling is satisfied, so any refusal below
  -- is the establishment talking and nothing else.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);

  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'admin']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'a third admin must be refused';
  ASSERT v_result->>'reason' = 'seat_limit_reached',
    'expected seat_limit_reached, got: ' || COALESCE(v_result->>'reason', 'NULL');
  ASSERT v_result->>'role' = 'admin', 'the refusal must name the seat: ' || v_result::TEXT;
  ASSERT (v_result->>'limit')::INT = 2, 'the refusal must carry the cap: ' || v_result::TEXT;

  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'super_admin']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'a second super_admin must be refused';
  ASSERT v_result->>'role' = 'super_admin', 'the refusal must name the top seat: ' || v_result::TEXT;

  -- The legacy alias is the same seat, not a way around it.
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'oecs']);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'the oecs alias must not open a second top seat';

  -- Nothing changed on the way out.
  ASSERT NOT holds_admin_seat(v_member), 'the member must still hold no seat';

  -- Re-roling a SITTING seat holder is untouched: no seat is being added.
  v_result := set_user_roles(v_deputy, ARRAY['admin', 'mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'a sitting admin must still be re-rolable: ' || v_result::TEXT;
  v_result := set_user_roles(v_deputy, ARRAY['admin']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'narrowing a sitting admin must work: ' || v_result::TEXT;

  -- And an ordinary role is never a seat question.
  v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'ordinary roles must be unaffected: ' || v_result::TEXT;
  v_result := set_user_roles(v_member, ARRAY['entrepreneur']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'taking an ordinary role back must work: ' || v_result::TEXT;
END $$;

-- ------------------------------------------------------------
-- 3. The trigger: the bare-UPDATE path
--
-- guard_profile_privileged_columns() returns early for a platform admin, so
-- before 143 this write went through. Capacity is not an authorisation
-- question and the trigger does not honour that bypass.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001430';
  v_member UUID := '00000000-0000-4000-8000-000000001433';
  v_raised BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);

  BEGIN
    UPDATE profiles SET roles = ARRAY['entrepreneur', 'admin'] WHERE id = v_member;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%admin seat is limited%',
      'expected the capacity message, got: ' || SQLERRM;
  END;
  ASSERT v_raised, 'a bare UPDATE must not be able to seat a third admin';

  -- Same for the profile guard's own bypass: it buys a write, not a chair.
  v_raised := FALSE;
  BEGIN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles SET roles = ARRAY['entrepreneur', 'super_admin'] WHERE id = v_member;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
  ASSERT v_raised, 'ktip.bypass_profile_guard must not lift the establishment';

  ASSERT NOT holds_admin_seat(v_member), 'the member must still hold no seat';
END $$;

-- ------------------------------------------------------------
-- 4. Coming back under the establishment is always possible
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001430';
  v_other  UUID := '00000000-0000-4000-8000-000000001432';
  v_member UUID := '00000000-0000-4000-8000-000000001433';
  v_result JSONB;
  v_free   INT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);

  -- Removing a seat is never refused, whatever the current count is. This is
  -- the only way out of an over-establishment state, so it must not be capped.
  v_result := set_user_roles(v_other, ARRAY['mentor']);
  ASSERT (v_result->>'ok')::BOOLEAN, 'giving up a seat must always be allowed: ' || v_result::TEXT;
  ASSERT NOT holds_admin_seat(v_other), 'the chair must actually be free now';

  -- And the freed chair can be filled again -- but only if the live database
  -- was not already over the cap on its own, which the fixtures cannot undo.
  SELECT seat_capacity('admin') - seat_holder_count('admin', v_member) INTO v_free;

  IF v_free > 0 THEN
    v_result := set_user_roles(v_member, ARRAY['entrepreneur', 'admin']);
    ASSERT (v_result->>'ok')::BOOLEAN, 'a free chair must be fillable: ' || v_result::TEXT;
    v_result := set_user_roles(v_member, ARRAY['entrepreneur']);
    ASSERT (v_result->>'ok')::BOOLEAN, 'and vacated again: ' || v_result::TEXT;
  ELSE
    RAISE NOTICE 'section 4 refill skipped: this database already seats % admin(s)',
      seat_holder_count('admin');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. transfer_super_admin(): the only way to move the top seat
--
-- With the cap at one and 124 refusing to demote the last Super Admin, the
-- two guards deadlock the seat unless something does both halves at once.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_boss   UUID := '00000000-0000-4000-8000-000000001430';
  v_deputy UUID := '00000000-0000-4000-8000-000000001431';
  v_heir   UUID := '00000000-0000-4000-8000-000000001434';
  v_result JSONB;
  v_others INT;
BEGIN
  -- An Admin cannot hand out the top seat.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_deputy)::text, TRUE);
  v_result := transfer_super_admin(v_heir);
  ASSERT (v_result->>'ok')::BOOLEAN = FALSE, 'an admin must not transfer the top seat';
  ASSERT v_result->>'reason' = 'forbidden',
    'expected forbidden, got: ' || COALESCE(v_result->>'reason', 'NULL');

  -- Nor can the Super Admin hand it to themselves, or to nobody.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_boss)::text, TRUE);
  v_result := transfer_super_admin(v_boss);
  ASSERT v_result->>'reason' = 'already_held', 'transferring to yourself must be refused';
  v_result := transfer_super_admin('00000000-0000-4000-8000-000000009999');
  ASSERT v_result->>'reason' = 'not_found', 'transferring to a missing account must be refused';

  -- The real thing.
  v_result := transfer_super_admin(v_heir);
  ASSERT (v_result->>'ok')::BOOLEAN, 'the super admin must be able to move the seat: ' || v_result::TEXT;

  ASSERT is_super_admin(v_heir),     'the heir must now hold the top seat';
  ASSERT NOT is_super_admin(v_boss), 'the outgoing super admin must have given it up';
  ASSERT NOT holds_admin_seat(v_boss),
    'the outgoing super admin is not made an Admin automatically -- that chair may be taken';

  -- Exactly as many top seats as before: the transfer moved one, it did not
  -- mint one. Only meaningful when the fixture boss was the sole holder.
  SELECT COUNT(*) INTO v_others FROM profiles
  WHERE id NOT IN (v_boss, v_heir) AND 'super_admin' = ANY(expand_roles(roles));

  IF v_others = 0 THEN
    ASSERT seat_holder_count('super_admin') = 1,
      'the establishment must be back to exactly one super admin';
  ELSE
    RAISE NOTICE 'section 5 count skipped: % other super_admin account(s) exist on this database', v_others;
  END IF;

  -- And the flag the transfer used did not leak past it.
  ASSERT current_setting('ktip.bypass_seat_cap', TRUE) IS DISTINCT FROM 'on',
    'transfer_super_admin() must leave the capacity guard armed';
END $$;

ROLLBACK;
