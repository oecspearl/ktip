-- ============================================================
-- Migration 143: how many of each seat there are.
--
-- 124 created the two seats and the ceiling above them, but never said how
-- many accounts may hold one. Nothing counted: a Super Admin could appoint a
-- tenth Admin, or a second Super Admin, and the only thing standing between
-- the platform and that was somebody remembering not to.
--
-- The establishment is now fixed:
--
--   super_admin   1   the top seat, and there is one of it
--   admin         2   two deputies, no more
--
-- Everything below the seats -- supervisors, safety admins, members -- stays
-- uncapped. Capacity is a property of the SEAT, not of the admin tier, exactly
-- as the ceiling is.
--
-- WHERE THE NUMBERS LIVE. In seat_capacity(), a literal CASE, for the same
-- reason seat_roles() is a literal list rather than a tier lookup: a table
-- would be a row the Admin console could edit, and a seat cap an Admin can
-- raise for themselves is not a cap. Changing the establishment is a
-- migration, mirrored in ADMIN_SEAT_LIMITS in src/lib/permissions.ts, and
-- rbac-parity.test.ts fails if the two disagree.
--
-- ONLY ADDITIONS ARE CHECKED. A row already holding a seat can still be
-- re-roled, suspended, renamed. If an over-establishment state ever exists --
-- three Admins granted before this migration -- it stays editable, and every
-- edit that does not ADD a seat goes through. That is what makes coming back
-- under the cap possible: the only way out of an over-cap state is a write.
--
-- TWO PLACES ENFORCE IT.
--
--   1. set_user_roles() pre-checks and returns {ok:false, reason:
--      'seat_limit_reached', role, limit}, in the shape the console already
--      maps to a message.
--   2. guard_admin_seat_capacity(), a trigger on profiles, RAISES. This one is
--      the invariant, not an authorisation test: it does NOT honour
--      ktip.bypass_profile_guard, so the platform-admin bare-UPDATE path that
--      guard_profile_privileged_columns() waves through (091) cannot quietly
--      seat a third Admin either. Its own escape hatch is a separate and
--      deliberate flag, ktip.bypass_seat_cap, which nothing in the application
--      sets -- only test fixtures and transfer_super_admin() below.
--
-- Both take pg_advisory_xact_lock on one key before counting, so two grants
-- racing for the last seat cannot both read "one free".
--
-- THE TRANSFER PROBLEM. With super_admin capped at 1, the two guards that
-- already exist deadlock the seat: 124 refuses to demote the last Super Admin,
-- and this migration refuses to appoint a second one. Handing the platform to
-- a new Super Admin would be impossible in the console. So the swap gets its
-- own entry point, transfer_super_admin(), which does both halves in one
-- transaction under the cap bypass. It is the only supported way to move the
-- top seat.
--
-- Requires 063, 091, 116, 124, 125.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The establishment
-- ------------------------------------------------------------

-- How many accounts may hold this seat. NULL for anything that is not a seat:
-- supervisors, safety admins and members are uncapped, and asking is not an
-- error. Aliases are not listed -- callers pass slugs already resolved through
-- seat_roles() / expand_roles(), and 'oecs' resolves to 'super_admin'.
CREATE OR REPLACE FUNCTION seat_capacity(p_seat TEXT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_seat
    WHEN 'super_admin' THEN 1
    WHEN 'admin'       THEN 2
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION seat_capacity(TEXT) IS
  'How many accounts may hold a seat: super_admin 1, admin 2, NULL for everything that is not a seat (143). Mirrored by ADMIN_SEAT_LIMITS in src/lib/permissions.ts.';

-- How many accounts hold the seat right now, aliases resolved, optionally
-- ignoring one row. The exclusion is what makes "would this write break the
-- cap?" answerable from the proposed row alone.
CREATE OR REPLACE FUNCTION seat_holder_count(p_seat TEXT, p_exclude UUID DEFAULT NULL)
RETURNS INT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM profiles p
  WHERE (p_exclude IS NULL OR p.id <> p_exclude)
    AND p_seat = ANY(expand_roles(p.roles));
$$;

COMMENT ON FUNCTION seat_holder_count(TEXT, UUID) IS
  'Accounts currently holding a seat slug, aliases resolved, optionally excluding one id (143).';

-- The first seat a proposed role set would over-fill, or NULL if it fits.
--
-- Only seats being ADDED are tested: p_current is the row as it stands, and a
-- seat present in both arrays is left alone however many holders there are.
-- Deterministic order so the reason returned to the console is stable when a
-- write adds both seats at once.
CREATE OR REPLACE FUNCTION seat_capacity_breach(
  p_user    UUID,
  p_roles   TEXT[],
  p_current TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT slug
  FROM unnest(seat_roles(COALESCE(p_roles, ARRAY[]::TEXT[]))) AS slug
  WHERE NOT (slug = ANY(seat_roles(COALESCE(p_current, ARRAY[]::TEXT[]))))
    AND seat_capacity(slug) IS NOT NULL
    AND seat_holder_count(slug, p_user) >= seat_capacity(slug)
  ORDER BY slug
  LIMIT 1;
$$;

COMMENT ON FUNCTION seat_capacity_breach(UUID, TEXT[], TEXT[]) IS
  'The first seat the proposed roles would over-fill, NULL if they fit. Only newly added seats are tested, so an over-establishment row stays editable (143).';

REVOKE ALL ON FUNCTION seat_capacity(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION seat_holder_count(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION seat_capacity_breach(UUID, TEXT[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seat_capacity(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION seat_holder_count(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION seat_capacity_breach(UUID, TEXT[], TEXT[]) TO authenticated;

-- ------------------------------------------------------------
-- 2. The invariant: a trigger, not an authorisation test
--
-- guard_profile_privileged_columns() returns early for a platform admin and
-- for anything running under ktip.bypass_profile_guard, because everything it
-- checks is a question of who may write. Capacity is not that question -- an
-- eleventh Admin is wrong no matter who typed it -- so this trigger honours
-- neither. It is the backstop under set_user_roles(), and the only thing
-- standing under a bare service-key UPDATE.
--
-- The escape hatch is its own flag, ktip.bypass_seat_cap, honoured here and by
-- set_user_roles() and by nothing else. Two things set it: the hand-run test
-- fixtures under supabase/tests, which seed an establishment of their own on
-- top of the live one inside a transaction they roll back, and
-- transfer_super_admin() below, which is momentarily two Super Admins by
-- design. No application code path sets it.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_admin_seat_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT[] := CASE WHEN TG_OP = 'UPDATE' THEN OLD.roles ELSE ARRAY[]::TEXT[] END;
  v_added   TEXT[];
  v_seat    TEXT;
BEGIN
  IF current_setting('ktip.bypass_seat_cap', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (NEW.roles IS DISTINCT FROM OLD.roles) THEN
    RETURN NEW;
  END IF;

  -- Nothing to count unless this write hands out a seat the row did not have.
  v_added := ARRAY(
    SELECT slug
    FROM unnest(seat_roles(COALESCE(NEW.roles, ARRAY[]::TEXT[]))) AS slug
    WHERE NOT (slug = ANY(seat_roles(COALESCE(v_current, ARRAY[]::TEXT[]))))
  );

  IF array_length(v_added, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- One key for every seat: two grants racing for the last Admin chair must
  -- not both read "one free". Held to the end of the transaction.
  PERFORM pg_advisory_xact_lock(hashtext('ktip.admin_seat'));

  v_seat := seat_capacity_breach(NEW.id, NEW.roles, v_current);

  IF v_seat IS NOT NULL THEN
    RAISE EXCEPTION 'the % seat is limited to % account(s)', v_seat, seat_capacity(v_seat)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- The NAME is load-bearing. Postgres fires BEFORE triggers in alphabetical
-- order, and 'seat_capacity_guard' sorts after both of 091's
-- 'guard_profile_*' triggers on purpose:
--
--   * guard_profile_insert_roles() SILENTLY STRIPS roles a self-signup may not
--     award itself. Running before it, this trigger would see the unstripped
--     array and raise on a signup that was never going to get the seat --
--     turning a strip into a failed registration.
--   * guard_profile_privileged_columns() answers "may you write this at all?",
--     which is the more useful error when both would fire.
--
-- Capacity is the last question asked, on the roles that survived.
DROP TRIGGER IF EXISTS guard_admin_seat_capacity_trigger ON profiles;
DROP TRIGGER IF EXISTS seat_capacity_guard_trigger ON profiles;
CREATE TRIGGER seat_capacity_guard_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_admin_seat_capacity();

COMMENT ON FUNCTION guard_admin_seat_capacity() IS
  'Refuses any write that hands out a seat beyond seat_capacity(). Does not honour ktip.bypass_profile_guard -- capacity is an invariant, not an authorisation test (143).';

-- ------------------------------------------------------------
-- 3. set_user_roles(), restated from 124 with the capacity check
--
-- Restated in full for the CREATE OR REPLACE reason: the body is 124's, the
-- addition is the block marked below. It returns a reason rather than raising,
-- so the console gets the same {ok:false, reason} shape as every other
-- refusal, and never surfaces the trigger's exception text.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_user_roles(p_user UUID, p_roles TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_unknown TEXT[];
  v_seats TEXT[];
  v_current TEXT[];
  v_is_super BOOLEAN;
  v_breach TEXT;
BEGIN
  IF NOT has_permission(v_actor, 'role:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT ARRAY_AGG(slug) INTO v_unknown
  FROM unnest(COALESCE(p_roles, ARRAY[]::TEXT[])) AS slug
  WHERE NOT EXISTS (SELECT 1 FROM role_definitions rd WHERE rd.slug = slug);

  IF v_unknown IS NOT NULL AND array_length(v_unknown, 1) > 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unknown_role', 'roles', v_unknown);
  END IF;

  SELECT roles INTO v_current FROM profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  v_is_super := is_super_admin(v_actor);

  -- A seat can only be handed out, or taken away, by someone who holds the top
  -- one -- and an account that holds a seat is off limits to anyone else
  -- entirely, so an Admin cannot quietly narrow the other Admin. Everything
  -- else, supervisors included, is the Admin's to assign.
  IF NOT v_is_super THEN
    v_seats := seat_roles(COALESCE(p_roles, ARRAY[]::TEXT[]) || COALESCE(v_current, ARRAY[]::TEXT[]));

    IF array_length(v_seats, 1) > 0 THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'reason', 'seat_requires_super_admin',
        'roles', v_seats
      );
    END IF;
  END IF;

  -- The last Super Admin keeps the slug. Nobody, including that account, can
  -- remove it while no other account holds it: the only screen that could put
  -- it back is the one this would close. Moving the seat to someone else goes
  -- through transfer_super_admin(), which does both halves at once (143).
  IF 'super_admin' = ANY(expand_roles(v_current))
     AND NOT ('super_admin' = ANY(expand_roles(COALESCE(p_roles, ARRAY[]::TEXT[]))))
     AND NOT EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id <> p_user AND 'super_admin' = ANY(expand_roles(p.roles))
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'last_super_admin');
  END IF;

  -- The establishment (143). Only seats this write ADDS are counted, so
  -- re-roling a sitting Admin is untouched. The lock is the same one the
  -- trigger takes, so the count below and the UPDATE beneath it are one
  -- decision even under concurrent grants.
  IF current_setting('ktip.bypass_seat_cap', TRUE) IS DISTINCT FROM 'on'
     AND EXISTS (
       SELECT 1
       FROM unnest(seat_roles(COALESCE(p_roles, ARRAY[]::TEXT[]))) AS slug
       WHERE NOT (slug = ANY(seat_roles(COALESCE(v_current, ARRAY[]::TEXT[]))))
     ) THEN
    PERFORM pg_advisory_xact_lock(hashtext('ktip.admin_seat'));

    v_breach := seat_capacity_breach(p_user, p_roles, v_current);
    IF v_breach IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'reason', 'seat_limit_reached',
        'role', v_breach,
        'limit', seat_capacity(v_breach),
        'held_by', seat_holder_count(v_breach, p_user)
      );
    END IF;
  END IF;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);

  UPDATE profiles
  SET roles = COALESCE(p_roles, ARRAY[]::TEXT[]),
      active_role = CASE
        WHEN active_role = ANY(COALESCE(p_roles, ARRAY[]::TEXT[])) THEN active_role
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_user;

  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ------------------------------------------------------------
-- 4. Moving the top seat
--
-- The one operation the two guards make impossible separately. Both halves in
-- one transaction: the incoming account gains super_admin, the outgoing one
-- loses it, and the cap bypass covers the instant in between when two accounts
-- hold it.
--
-- What the outgoing Super Admin keeps is everything else they held, and
-- nothing more. They are not automatically made an Admin: that seat has two
-- chairs and they may both be occupied, so the decision belongs to the new
-- Super Admin, made deliberately, on the next screen.
--
-- The legacy 'oecs' alias is stripped alongside the slug -- an account still
-- carrying it would pass is_super_admin() through expand_roles() and the seat
-- would not have moved at all.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION transfer_super_admin(p_to UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target_roles TEXT[];
BEGIN
  IF NOT is_super_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_to = v_actor THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_held');
  END IF;

  SELECT roles INTO v_target_roles FROM profiles WHERE id = p_to;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  -- Handing the platform to an account that cannot sign in would close the
  -- seat rather than move it.
  IF is_suspended(p_to) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'target_suspended');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ktip.admin_seat'));

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  PERFORM set_config('ktip.bypass_seat_cap', 'on', TRUE);

  -- The incoming seat. 'admin' comes off: super_admin is a superset of it, and
  -- leaving both on would spend an Admin chair on the Super Admin.
  UPDATE profiles
  SET roles = ARRAY(
        SELECT DISTINCT slug
        FROM unnest(COALESCE(roles, ARRAY[]::TEXT[]) || ARRAY['super_admin']) AS slug
        WHERE slug <> 'admin'
      ),
      updated_at = now()
  WHERE id = p_to;

  -- The outgoing one, alias included.
  UPDATE profiles
  SET roles = ARRAY(
        SELECT slug
        FROM unnest(COALESCE(roles, ARRAY[]::TEXT[])) AS slug
        WHERE slug NOT IN ('super_admin', 'oecs')
      ),
      active_role = CASE
        WHEN active_role IN ('super_admin', 'oecs') THEN NULL
        ELSE active_role
      END,
      updated_at = now()
  WHERE id = v_actor;

  PERFORM set_config('ktip.bypass_seat_cap', 'off', TRUE);
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE, 'from', v_actor, 'to', p_to);
END;
$$;

REVOKE ALL ON FUNCTION transfer_super_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transfer_super_admin(UUID) TO authenticated;

COMMENT ON FUNCTION transfer_super_admin(UUID) IS
  'Moves the single super_admin seat to another account in one transaction. The only path past the last_super_admin guard and the capacity of 1 (143).';
