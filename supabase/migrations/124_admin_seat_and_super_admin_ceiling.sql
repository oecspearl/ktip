-- Migration 124: the Admin seat, and the ceiling that keeps Super Admin above it.
--
-- One account has run the platform since 063: super_admin holds every key, and
-- the ~65 policies 090 rewrote onto is_platform_admin() ask for that slug by
-- name. Handing day-to-day operation to a second person meant handing over
-- that slug, at which point the two accounts were indistinguishable — and, in
-- particular, either could suspend, delete or re-password the other.
--
-- This migration splits the seat in two:
--
--   admin        Everything super_admin does today. Every permission key, every
--                is_platform_admin() policy, the whole console — including
--                full control of everyone below the seat: supervisors, safety
--                admins and members. Their roles, passwords, second factors,
--                suspensions, deletion.
--   super_admin  The same, plus the one thing an Admin cannot do: act on an
--                account that holds a SEAT (super_admin or admin). Suspend it,
--                delete it, reset its password, change its roles — and hand a
--                seat to anyone.
--
-- "Seat" is the word for the two slugs the ceiling protects. It is narrower
-- than the admin tier on purpose: people_supervisor, programme_supervisor and
-- safety_admin sit under the Admin and are the Admin's to manage. The Super
-- Admin's reserved power is exactly one thing — stopping an Admin.
--
-- The difference is deliberately NOT in the permission matrix. Both columns are
-- full, and rbac-parity.test.ts asserts that. A matrix key for "may suspend an
-- Admin" would be one toggle at /admin/roles away from being granted to the
-- Admin, by the Admin — the matrix is theirs to edit. The ceiling is a role
-- test, is_super_admin(), and it lives in the functions that do the acting:
--
--   1. set_user_roles()          granting or removing a seat slug, and the
--                                roles of anyone who already holds one, need a
--                                Super Admin. 116's admin-tier ceiling is
--                                narrowed to the seats: an Admin may now make
--                                a supervisor.
--   2. set_user_suspension()     a seat-holding target needs a Super Admin; a
--                                super_admin target is refused outright; nobody
--                                suspends themselves.
--   3. guard_profile_privileged_columns()
--                                the profiles UPDATE policy admits any platform
--                                admin, so the guard fences the privileged
--                                columns of seat-holding rows to the Super
--                                Admin. Without this, 1 and 2 could be bypassed
--                                with a bare UPDATE.
--   4. can_administer_account()  the same question, answered for api/admin/*
--                                (delete, reset password, reset MFA), which act
--                                with the service key and cannot rely on RLS.
--
-- is_platform_admin() IS redefined — the one thing 116 said it would not do —
-- because this is the case 116 was reserving it for: the Admin is meant to be
-- exactly what super_admin is today, and that is the function which says so
-- in ~65 places. It widens from one slug to two and narrows nothing.
--
-- LOCKOUT GUARDS. A super_admin account cannot be suspended through the RPC by
-- anyone, itself included, and the last super_admin cannot have the slug taken
-- away. Both exist because the only screen that could undo either mistake is
-- the one the mistake would have just closed.
--
-- Mirrors src/lib/permissions.ts. Idempotent — safe to re-run. Requires 063,
-- 090, 110 and 116. Restates default_role_permissions() and
-- guard_profile_privileged_columns() in full, for the reason 110 and 116 give:
-- a partial body silently drops whatever it omits. If 115 or 116 is re-run
-- after this file, re-run this file.

-- ============================================================
-- 1. The role
-- ============================================================

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('admin', 'Admin', 'admin', 'Runs the platform day to day. Every permission and every console page. Cannot suspend, delete or re-role another administrator — that stays with the Super Admin.', FALSE, TRUE, NULL, 11)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. Default matrix
--
-- 116's body with the admin column added. Restated in full rather than as a
-- delta — this one function is what both the seed and "Reset to defaults" read.
-- ============================================================

CREATE OR REPLACE FUNCTION default_role_permissions()
RETURNS TABLE (role_slug TEXT, permission_key TEXT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  -- Super Admin holds everything, including permissions added later.
  SELECT 'super_admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  -- Admin holds everything too. The difference between the two seats is not in
  -- this matrix at all — it is the ceiling in section 4 below.
  SELECT 'admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
    -- The two supervisors. Domain keys first, then the ordinary participant
    -- bundle — they are members of the platform as well as administrators of
    -- part of it, and docs/QA-RELAY-SESSION.md needs them to be able to create
    -- a project and apply for a grant like anybody else.
    ('people_supervisor', 'members:view'),
    ('people_supervisor', 'audit:view'),
    ('people_supervisor', 'moderation:view'),
    ('people_supervisor', 'moderation:action'),
    ('people_supervisor', 'moderation:escalate'),
    ('people_supervisor', 'sme:verify'),
    ('people_supervisor', 'institution:verify'),
    ('people_supervisor', 'institution:approve_students'),
    ('people_supervisor', 'verification:review'),
    ('people_supervisor', 'grant:view'),
    ('people_supervisor', 'grant:apply'),
    ('people_supervisor', 'project:create'),
    ('people_supervisor', 'project:manage'),
    ('people_supervisor', 'event:create'),
    ('people_supervisor', 'forum:post'),
    ('people_supervisor', 'forum:comment'),
    ('people_supervisor', 'mentorship:offer'),
    ('people_supervisor', 'dm:initiate'),
    ('people_supervisor', 'dm:receive'),
    ('people_supervisor', 'dm:supervise'),

    -- grant:manage_funds rides with grant:manage: the person deciding an
    -- application is the person recording the award, and splitting those across
    -- two seats would only mean every decision waits on somebody else.
    ('programme_supervisor', 'project:manage_all'),
    ('programme_supervisor', 'grant:manage'),
    ('programme_supervisor', 'grant:post'),
    ('programme_supervisor', 'grant:manage_funds'),
    ('programme_supervisor', 'forum:manage'),
    ('programme_supervisor', 'resource:manage'),
    ('programme_supervisor', 'achievement:manage'),
    ('programme_supervisor', 'employer:manage'),
    ('programme_supervisor', 'grant:view'),
    ('programme_supervisor', 'grant:apply'),
    ('programme_supervisor', 'project:create'),
    ('programme_supervisor', 'project:manage'),
    ('programme_supervisor', 'event:create'),
    ('programme_supervisor', 'forum:post'),
    ('programme_supervisor', 'forum:comment'),
    ('programme_supervisor', 'mentorship:offer'),
    ('programme_supervisor', 'dm:initiate'),
    ('programme_supervisor', 'dm:receive'),

    -- The verification keys are here because a safety admin is the first-line
    -- receipt for every complaint, and a complaint about a body claiming to be
    -- a school or a chamber-verified business is answered by looking at that
    -- claim.
    ('safety_admin', 'audit:view'),
    ('safety_admin', 'moderation:view'),
    ('safety_admin', 'moderation:action'),
    ('safety_admin', 'moderation:escalate'),
    ('safety_admin', 'grant:view'),
    ('safety_admin', 'forum:post'),
    ('safety_admin', 'forum:comment'),
    ('safety_admin', 'dm:initiate'),
    ('safety_admin', 'dm:receive'),
    ('safety_admin', 'dm:supervise'),
    ('safety_admin', 'sme:verify'),
    ('safety_admin', 'institution:verify'),
    ('safety_admin', 'institution:approve_students'),

    ('investor', 'grant:view'),
    ('investor', 'grant:post'),
    ('investor', 'grant:manage_funds'),
    ('investor', 'forum:post'),
    ('investor', 'forum:comment'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('sme', 'grant:view'),
    ('sme', 'grant:apply'),
    ('sme', 'project:create'),
    ('sme', 'project:manage'),
    ('sme', 'event:create'),
    ('sme', 'forum:post'),
    ('sme', 'forum:comment'),
    ('sme', 'mentorship:offer'),
    ('sme', 'dm:initiate'),
    ('sme', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'mentorship:offer'),
    ('private_sector', 'dm:initiate'),
    ('private_sector', 'dm:receive'),

    ('educational_partner', 'institution:approve_students'),
    ('educational_partner', 'grant:view'),
    ('educational_partner', 'grant:apply'),
    ('educational_partner', 'grant:sponsor'),
    ('educational_partner', 'project:create'),
    ('educational_partner', 'project:manage'),
    ('educational_partner', 'event:create'),
    ('educational_partner', 'forum:post'),
    ('educational_partner', 'forum:comment'),
    ('educational_partner', 'dm:initiate'),
    ('educational_partner', 'dm:receive'),
    ('educational_partner', 'dm:supervise'),

    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'dm:initiate'),
    ('chamber_admin', 'dm:receive'),

    -- Delivery organisations. They run the programme rather than fund it, so
    -- they apply for money and never post it.
    ('ngo', 'grant:view'),
    ('ngo', 'grant:apply'),
    ('ngo', 'project:create'),
    ('ngo', 'project:manage'),
    ('ngo', 'event:create'),
    ('ngo', 'forum:post'),
    ('ngo', 'forum:comment'),
    ('ngo', 'mentorship:offer'),
    ('ngo', 'dm:initiate'),
    ('ngo', 'dm:receive'),

    -- ngo's set plus sme:verify. An incubator already knows which of its cohort
    -- are trading businesses — that is the content of its programme — so it is
    -- a competent verifier alongside the chambers.
    ('bso', 'grant:view'),
    ('bso', 'grant:apply'),
    ('bso', 'project:create'),
    ('bso', 'project:manage'),
    ('bso', 'event:create'),
    ('bso', 'forum:post'),
    ('bso', 'forum:comment'),
    ('bso', 'mentorship:offer'),
    ('bso', 'sme:verify'),
    ('bso', 'dm:initiate'),
    ('bso', 'dm:receive'),

    -- educational_partner's set. A research institution takes students on the
    -- same way a university does — under its own domain, sponsoring their
    -- applications and supervising their channels.
    ('research_institution', 'institution:approve_students'),
    ('research_institution', 'grant:view'),
    ('research_institution', 'grant:apply'),
    ('research_institution', 'grant:sponsor'),
    ('research_institution', 'project:create'),
    ('research_institution', 'project:manage'),
    ('research_institution', 'event:create'),
    ('research_institution', 'forum:post'),
    ('research_institution', 'forum:comment'),
    ('research_institution', 'dm:initiate'),
    ('research_institution', 'dm:receive'),
    ('research_institution', 'dm:supervise'),

    -- Funders and programme administrators: investor's grant keys plus the
    -- ability to run projects and events. government verifies both institutions
    -- and businesses because in most member states it is the registry of record.
    ('government', 'grant:view'),
    ('government', 'grant:post'),
    ('government', 'grant:manage_funds'),
    ('government', 'project:create'),
    ('government', 'project:manage'),
    ('government', 'event:create'),
    ('government', 'forum:post'),
    ('government', 'forum:comment'),
    ('government', 'sme:verify'),
    ('government', 'institution:verify'),
    ('government', 'dm:initiate'),
    ('government', 'dm:receive'),

    ('diaspora', 'grant:view'),
    ('diaspora', 'grant:post'),
    ('diaspora', 'grant:manage_funds'),
    ('diaspora', 'project:create'),
    ('diaspora', 'project:manage'),
    ('diaspora', 'event:create'),
    ('diaspora', 'forum:post'),
    ('diaspora', 'forum:comment'),
    ('diaspora', 'mentorship:offer'),
    ('diaspora', 'institution:verify'),
    ('diaspora', 'dm:initiate'),
    ('diaspora', 'dm:receive'),

    -- No audit:view. Reading the platform's moderation and permission trails is
    -- an operator's power, and it is the one key that would collapse igo back
    -- into super_admin.
    ('igo', 'grant:view'),
    ('igo', 'grant:post'),
    ('igo', 'grant:manage_funds'),
    ('igo', 'project:create'),
    ('igo', 'project:manage'),
    ('igo', 'event:create'),
    ('igo', 'forum:post'),
    ('igo', 'forum:comment'),
    ('igo', 'mentorship:offer'),
    ('igo', 'institution:verify'),
    ('igo', 'dm:initiate'),
    ('igo', 'dm:receive'),

    ('entrepreneur', 'grant:view'),
    ('entrepreneur', 'grant:apply'),
    ('entrepreneur', 'project:create'),
    ('entrepreneur', 'project:manage'),
    ('entrepreneur', 'event:create'),
    ('entrepreneur', 'forum:post'),
    ('entrepreneur', 'forum:comment'),
    ('entrepreneur', 'mentorship:offer'),
    ('entrepreneur', 'dm:initiate'),
    ('entrepreneur', 'dm:receive'),

    ('faculty', 'institution:approve_students'),
    ('faculty', 'grant:view'),
    ('faculty', 'grant:apply'),
    ('faculty', 'grant:sponsor'),
    ('faculty', 'project:create'),
    ('faculty', 'project:manage'),
    ('faculty', 'event:create'),
    ('faculty', 'forum:post'),
    ('faculty', 'forum:comment'),
    ('faculty', 'mentorship:offer'),
    ('faculty', 'dm:initiate'),
    ('faculty', 'dm:receive'),
    ('faculty', 'dm:supervise'),

    ('researcher', 'grant:view'),
    ('researcher', 'grant:apply'),
    ('researcher', 'project:create'),
    ('researcher', 'project:manage'),
    ('researcher', 'event:create'),
    ('researcher', 'forum:post'),
    ('researcher', 'forum:comment'),
    ('researcher', 'mentorship:offer'),
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    -- The full grant set. A mentor is frequently the person running a small
    -- fund or a prize alongside the mentoring, and splitting those across two
    -- accounts was the only thing the narrower set achieved.
    ('mentor', 'grant:view'),
    ('mentor', 'grant:apply'),
    ('mentor', 'grant:post'),
    ('mentor', 'grant:manage_funds'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'event:create'),
    ('mentor', 'forum:post'),
    ('mentor', 'forum:comment'),
    ('mentor', 'mentorship:offer'),
    ('mentor', 'dm:initiate'),
    ('mentor', 'dm:receive'),

    -- Applies for its own funding now. Still receives messages and never
    -- initiates them — see the safeguard block in has_permission().
    ('student', 'grant:view'),
    ('student', 'grant:apply'),
    ('student', 'project:create'),
    ('student', 'project:manage'),
    ('student', 'event:create'),
    ('student', 'forum:post'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- ============================================================
-- 3. Seed the matrix
--
-- Adds the admin column. DO NOTHING, so no hand-tuned cell is disturbed.
-- ============================================================

INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug,
       pd.key,
       EXISTS (SELECT 1 FROM default_role_permissions() d WHERE d.role_slug = rd.slug AND d.permission_key = pd.key)
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

-- ============================================================
-- 4. The helpers
-- ============================================================

-- The top seat, and nothing else. This is the ceiling test; every "may act on
-- an administrator" decision below asks this and not is_platform_admin().
CREATE OR REPLACE FUNCTION is_super_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user AND 'super_admin' = ANY(expand_roles(p.roles))
  );
$$;

-- The seat slugs among these roles, aliases resolved. A literal list, not a
-- tier lookup: the whole point of the seat is that it is NARROWER than the
-- admin tier. Adding a third seat is a deliberate edit here, and in
-- ADMIN_SEAT_ROLES in src/lib/permissions.ts.
CREATE OR REPLACE FUNCTION seat_roles(p_roles TEXT[])
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT slug FROM unnest(ARRAY['super_admin', 'admin']::TEXT[]) AS slug
    WHERE slug = ANY(expand_roles(p_roles))
  ), ARRAY[]::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION holds_admin_seat(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user AND array_length(seat_roles(p.roles), 1) > 0
  );
$$;

-- Was: super_admin alone. The Admin is what super_admin was, everywhere this
-- function is asked — and it is asked in ~65 policies, is_oecs_admin(), the
-- document-access resolver and the profile guard. Widened, never narrowed: no
-- existing account loses anything.
CREATE OR REPLACE FUNCTION is_platform_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user
      AND expand_roles(p.roles) && ARRAY['super_admin', 'admin']::TEXT[]
  );
$$;

-- May p_actor take a privileged action (suspend, delete, reset a password or a
-- second factor, change roles) against p_target?
--
--   * A Super Admin may act on anyone but themselves.
--   * Anyone else may act on anyone who holds no seat, themselves excluded.
--     A supervisor or safety admin is a valid target for the Admin. Self-
--     exclusion is the caller's own lockout guard; delete-user already refused
--     it and the rest now agree.
--
-- Answers for api/admin/* — the routes act with the service key, so RLS is not
-- in the path and the question has to be asked explicitly. The second argument
-- defaults to the caller so the edge routes can call it through the caller's
-- own client with one parameter.
CREATE OR REPLACE FUNCTION can_administer_account(p_target UUID, p_actor UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_actor IS NOT NULL
     AND p_target IS NOT NULL
     AND p_actor <> p_target
     AND (is_super_admin(p_actor) OR NOT holds_admin_seat(p_target));
$$;

REVOKE ALL ON FUNCTION is_super_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_super_admin(UUID) TO authenticated;
REVOKE ALL ON FUNCTION holds_admin_seat(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION holds_admin_seat(UUID) TO authenticated;
REVOKE ALL ON FUNCTION can_administer_account(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_administer_account(UUID, UUID) TO authenticated;

-- ============================================================
-- 5. Role assignment — the ceiling, widened
--
-- 116 stopped a role:manage holder from GRANTING any admin-tier slug without
-- being super_admin. Two changes. The tier is narrowed to the two seats, so an
-- Admin can appoint a supervisor or a safety admin — those are the roles under
-- the Admin, and managing them is the job. And REMOVING is now covered too:
-- before, an Admin could call set_user_roles(super_admin_id,
-- ARRAY['entrepreneur']) and the top seat would be gone. Granting or removing a
-- seat, and touching the roles of anyone who holds one, needs a Super Admin;
-- the last super_admin cannot be demoted by anyone.
-- ============================================================

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
  -- one — and an account that holds a seat is off limits to anyone else
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
  -- it back is the one this would close.
  IF 'super_admin' = ANY(expand_roles(v_current))
     AND NOT ('super_admin' = ANY(expand_roles(COALESCE(p_roles, ARRAY[]::TEXT[]))))
     AND NOT EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id <> p_user AND 'super_admin' = ANY(expand_roles(p.roles))
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'last_super_admin');
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

-- ============================================================
-- 6. Suspension — the ceiling
--
-- 063's body with three refusals in front of the write. The reasons are
-- returned, not raised, in the shape the client already maps.
-- ============================================================

CREATE OR REPLACE FUNCTION set_user_suspension(
  p_user UUID,
  p_suspended BOOLEAN,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NOT has_permission(v_actor, 'moderation:escalate') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  -- Suspending yourself is a lockout with extra steps.
  IF p_user = v_actor THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'cannot_suspend_self');
  END IF;

  -- The top seat cannot be suspended through the app at all. If two accounts
  -- ever hold it, this is what stops one from locking out the other.
  IF is_super_admin(p_user) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'super_admin_protected');
  END IF;

  -- An Admin is the Super Admin's to suspend. This is the whole point of the
  -- seat: an Admin runs the platform, and a Super Admin can stop them logging
  -- in. Supervisors and safety admins are not seats — the Admin (or anyone
  -- with moderation:escalate) may suspend them.
  IF holds_admin_seat(p_user) AND NOT is_super_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'seat_requires_super_admin');
  END IF;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);

  UPDATE profiles
  SET is_suspended = p_suspended,
      suspended_until = CASE WHEN p_suspended THEN p_until ELSE NULL END,
      suspension_reason = CASE WHEN p_suspended THEN p_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_user;

  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ============================================================
-- 7. The privileged-column guard
--
-- 116's body, with the blanket is_platform_admin() exemption split in two:
-- is_super_admin() keeps it, and any other platform admin is fenced off the
-- privileged columns of seat-holding rows. Everything else is 116's text
-- unchanged, including its note on why the derived columns go through JSONB.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_added TEXT[];
  v_illegal TEXT[];
  v_new JSONB := to_jsonb(NEW);
  v_old JSONB := to_jsonb(OLD);
BEGIN
  -- service_role has no JWT subject; trusted RPCs opt in explicitly.
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  -- The Super Admin keeps the blanket exemption 063 gave the platform admin.
  IF is_super_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  -- An account holding one of the two SEATS (super_admin, admin) is the Super
  -- Admin's to change, whoever is asking. Without this an Admin could write
  -- is_suspended = TRUE straight onto the Super Admin's row through the
  -- profiles UPDATE policy, and so could a supervisor holding
  -- moderation:escalate — the ceiling in set_user_suspension() would be
  -- decorative. Checked before the platform admin exemption for that reason.
  -- Only the privileged columns are fenced; an Admin can still fix the other
  -- Admin's display name. Supervisors and safety admins are NOT seats: an
  -- Admin administers them freely.
  IF OLD.id <> v_actor
     AND holds_admin_seat(OLD.id)
     AND (NEW.roles IS DISTINCT FROM OLD.roles
          OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
          OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
          OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
          OR NEW.is_verified IS DISTINCT FROM OLD.is_verified) THEN
    RAISE EXCEPTION 'administrator accounts can only be changed by a super admin';
  END IF;

  -- An Admin is a platform admin for every other purpose.
  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
      OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
      OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason)
     AND NOT has_permission(v_actor, 'moderation:escalate') THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT has_permission(v_actor, 'verification:review') THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
  END IF;

  -- Age state is derived from account_age and is never a direct write. Even a
  -- platform admin goes through set_account_date_of_birth() so the declaration
  -- and the flag cannot disagree. (091.)
  IF v_new ->> 'is_minor' IS DISTINCT FROM v_old ->> 'is_minor'
     OR v_new ->> 'requires_age_declaration' IS DISTINCT FROM v_old ->> 'requires_age_declaration'
     OR v_new ->> 'age_declared_at' IS DISTINCT FROM v_old ->> 'age_declared_at' THEN
    RAISE EXCEPTION 'age status is derived from the declared date of birth and cannot be set directly';
  END IF;

  -- Consent state is derived from user_consents the same way, and for a
  -- stronger reason: this flag is the only thing standing between an account
  -- and the content it has not agreed to publish under. (115.)
  IF v_new ->> 'requires_consent' IS DISTINCT FROM v_old ->> 'requires_consent'
     OR v_new ->> 'consent_recorded_at' IS DISTINCT FROM v_old ->> 'consent_recorded_at' THEN
    RAISE EXCEPTION 'consent state is derived from recorded acceptances and cannot be set directly';
  END IF;

  -- Only newly ADDED roles are validated. Removing a role from yourself is
  -- always allowed, and existing rows are never re-checked — which is what
  -- keeps accounts that already hold faculty/student slugs editable.
  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    v_added := ARRAY(
      SELECT unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.roles, ARRAY[]::TEXT[]))
    );

    SELECT ARRAY_AGG(slug) INTO v_illegal
    FROM unnest(v_added) AS slug
    WHERE NOT EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.slug = slug AND rd.is_self_assignable
    );

    IF v_illegal IS NOT NULL AND array_length(v_illegal, 1) > 0 THEN
      RAISE EXCEPTION 'role(s) % require verification or an administrator', array_to_string(v_illegal, ', ');
    END IF;
  END IF;

  -- The active context must be a role the account actually holds.
  IF NEW.active_role IS NOT NULL AND NOT (NEW.active_role = ANY(COALESCE(NEW.roles, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'active_role % is not held by this account', NEW.active_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns_trigger ON profiles;
CREATE TRIGGER guard_profile_privileged_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_privileged_columns();

-- ============================================================
-- 8. Comments
-- ============================================================

COMMENT ON FUNCTION is_super_admin(UUID) IS
  'The top seat only. The ceiling test for acting on a seat-holding account (124).';
COMMENT ON FUNCTION seat_roles(TEXT[]) IS
  'The seat slugs (super_admin, admin) among these roles, aliases resolved. Narrower than the admin tier on purpose (124).';
COMMENT ON FUNCTION holds_admin_seat(UUID) IS
  'True when this account holds super_admin or admin (124). Supervisors and safety admins are not seats.';
COMMENT ON FUNCTION is_platform_admin(UUID) IS
  'super_admin or admin, aliases resolved. What the ~65 admin policies ask (090, widened by 124).';
COMMENT ON FUNCTION can_administer_account(UUID, UUID) IS
  'May the actor suspend, delete, re-password or re-role the target? Never themselves; seat-holding targets (super_admin, admin) need a Super Admin (124).';
COMMENT ON FUNCTION set_user_roles(UUID, TEXT[]) IS
  'Admin-side role assignment. Requires role:manage; granting OR removing a seat slug, or re-roling a seat holder, requires super_admin; the last super_admin cannot be demoted (124).';
COMMENT ON FUNCTION set_user_suspension(UUID, BOOLEAN, TIMESTAMPTZ, TEXT) IS
  'Requires moderation:escalate. Refuses self, refuses a super_admin target, and needs super_admin for an admin target (124).';
