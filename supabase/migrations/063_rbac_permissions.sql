-- Migration 063: Role-based access control
--
-- Until now the entire authorization model was one boolean: 'oecs' = ANY(roles).
-- That expression appears inline in ~60 policies, so it could not be changed
-- without touching every one of them, and it could not express anything other
-- than "admin / not admin" — there was no way to say "students may read grants
-- but not apply for them".
--
-- This migration introduces a permission layer *above* profiles.roles without
-- replacing it. profiles.roles stays the identity source of truth; the new
-- role_permissions table maps roles to permission keys, and has_permission()
-- is the single predicate new policies call. The legacy 'oecs' slug is aliased
-- onto 'super_admin' rather than renamed, so every existing policy keeps
-- working untouched.
--
-- Two things are deliberately NOT toggleable:
--   1. Child-safety permissions. has_permission() denies them to students
--      before it reads the matrix, so neither the admin UI nor a direct UPDATE
--      on role_permissions can grant a student unmonitored messaging or the
--      ability to apply for funding independently.
--   2. profiles.roles itself. Until now "Users can update their own profile"
--      had a USING clause and no WITH CHECK, and the settings form already
--      submitted the roles column — every user could make themselves an admin.
--      That is closed here.
--
-- Idempotent — safe to re-run. Re-running does NOT clobber admin edits to the
-- matrix; only reset_role_permissions() restores defaults.

-- ============================================================
-- 1. Role catalog
-- ============================================================

CREATE TABLE IF NOT EXISTS role_definitions (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('admin', 'organization', 'individual')),
  description TEXT,
  -- System roles cannot be deleted from the admin UI.
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  -- May a user add this to themselves during onboarding?
  is_self_assignable BOOLEAN NOT NULL DEFAULT FALSE,
  -- Granted only after institution / chamber / admin review.
  requires_verification BOOLEAN NOT NULL DEFAULT FALSE,
  -- Legacy slug that resolves to another role. Self-reference, so no FK.
  alias_of TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('super_admin', 'Super Admin', 'admin', 'OECS Secretariat. System-wide management, global policy, audit logs, suspensions.', FALSE, TRUE, NULL, 10),
  ('safety_admin', 'Safety Admin', 'admin', 'Content moderator. Owns flagged-content queues, automated moderation logs and escalations.', FALSE, TRUE, NULL, 20),
  ('oecs', 'OECS Admin (legacy)', 'admin', 'Legacy admin slug. Resolves to Super Admin.', FALSE, TRUE, 'super_admin', 25),
  ('investor', 'Investor / Funding Agency', 'organization', 'Posts grant opportunities, views vetted projects, connects with regional innovators.', TRUE, FALSE, NULL, 30),
  ('sme', 'Verified SME', 'organization', 'Business account vetted by its National Chamber of Commerce.', FALSE, TRUE, NULL, 40),
  ('private_sector', 'Private Sector', 'organization', 'Unverified business account. Gains SME capabilities once a Chamber verifies it.', TRUE, FALSE, NULL, 50),
  ('educational_partner', 'Educational Partner', 'organization', 'School or university. Manages domain verification, approves student accounts, oversees submissions.', FALSE, TRUE, NULL, 60),
  ('chamber_admin', 'Chamber of Commerce', 'organization', 'Country-level vetting authority that verifies and onboards local SMEs.', FALSE, TRUE, NULL, 70),
  ('entrepreneur', 'Entrepreneur', 'individual', 'Builds and launches innovations, applies for grants.', TRUE, FALSE, NULL, 80),
  ('faculty', 'Faculty', 'individual', 'Academic staff. May sponsor student grant applications and supervise student channels.', FALSE, TRUE, NULL, 90),
  ('researcher', 'Researcher', 'individual', 'Conducts and publishes research, collaborates on projects.', TRUE, FALSE, NULL, 100),
  ('mentor', 'Mentor', 'individual', 'Guides and supports innovators.', TRUE, FALSE, NULL, 110),
  ('student', 'Student (school-verified)', 'individual', 'Verified via an approved institutional email domain. Read-only on grants, no unmonitored direct messaging.', FALSE, TRUE, NULL, 120)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. Permission catalog
-- ============================================================

CREATE TABLE IF NOT EXISTS permission_definitions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  -- Child-safety permission: denied to students in has_permission() itself,
  -- before the matrix is consulted. The admin UI renders these cells locked.
  is_safeguard BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO permission_definitions (key, label, description, category, is_safeguard, sort_order) VALUES
  ('org:manage', 'Manage platform', 'Global settings, policy and system configuration.', 'platform', FALSE, 10),
  ('members:manage', 'Manage members', 'Create, edit, suspend and delete user accounts.', 'platform', FALSE, 20),
  ('role:manage', 'Manage roles & permissions', 'Assign roles and edit the permission matrix.', 'platform', FALSE, 30),
  ('audit:view', 'View audit logs', 'Read permission-change and moderation audit trails.', 'platform', FALSE, 40),
  ('moderation:view', 'View moderation queue', 'See reported and auto-flagged content, including quarantined items.', 'moderation', TRUE, 50),
  ('moderation:action', 'Action moderation items', 'Quarantine, restore or remove content and issue warnings.', 'moderation', TRUE, 60),
  ('moderation:escalate', 'Escalate & suspend', 'Suspend accounts and escalate to safety admins and school administrators.', 'moderation', TRUE, 70),
  ('grant:view', 'View grants', 'Browse public grant opportunities.', 'grants', FALSE, 80),
  ('grant:apply', 'Apply for grants', 'Submit grant applications. Students are denied — they must be sponsored.', 'grants', TRUE, 90),
  ('grant:sponsor', 'Sponsor student applications', 'Act as the faculty or school sponsor on a student application.', 'grants', TRUE, 100),
  ('grant:post', 'Post grant opportunities', 'Publish funding calls to the platform.', 'grants', FALSE, 110),
  ('grant:manage_funds', 'Manage funds', 'Administer disbursement and award records. Never available to students.', 'grants', TRUE, 120),
  ('project:create', 'Create projects', 'Publish a new project.', 'projects', FALSE, 130),
  ('project:manage', 'Manage own projects', 'Edit, archive and manage collaborators on owned projects.', 'projects', FALSE, 140),
  ('forum:post', 'Create forum posts', 'Start discussions on forum boards.', 'community', FALSE, 150),
  ('forum:comment', 'Reply & comment', 'Reply to forum posts and comment on projects.', 'community', FALSE, 160),
  ('mentorship:offer', 'Offer mentorship', 'Appear in mentor discovery and accept mentorship requests.', 'community', FALSE, 170),
  ('dm:initiate', 'Start direct messages', 'Open a 1-to-1 conversation. Denied to students — they use supervised channels only.', 'messaging', TRUE, 180),
  ('dm:receive', 'Receive messages', 'Participate in conversations they have been added to.', 'messaging', FALSE, 190),
  ('dm:supervise', 'Supervise student channels', 'Counts as the designated educator that makes a student channel monitored.', 'messaging', TRUE, 200),
  ('sme:verify', 'Verify SMEs', 'Chamber of Commerce review of corporate registry data; issues Verified SME status.', 'verification', FALSE, 210),
  ('institution:verify', 'Verify institutions', 'Approve schools and chambers, and the email domains they own.', 'verification', FALSE, 220),
  ('institution:approve_students', 'Approve student accounts', 'Approve students registering on the institution''s verified email domain.', 'verification', TRUE, 230)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_safeguard = EXCLUDED.is_safeguard,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 3. The matrix
-- ============================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  role_slug TEXT NOT NULL REFERENCES role_definitions(slug) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permission_definitions(key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_slug, permission_key)
);

-- has_permission() reads by (role, key) on every policy evaluation.
CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup
  ON role_permissions (role_slug, permission_key) WHERE allowed;

-- Append-only audit of every toggle. Written by trigger only; see the
-- zero-write-policy pattern used by employer_verification_events (058).
CREATE TABLE IF NOT EXISTS role_permission_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_slug TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  from_allowed BOOLEAN,
  to_allowed BOOLEAN NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_permission_events_created
  ON role_permission_events (created_at DESC);

-- ============================================================
-- 4. Default matrix
-- ============================================================

-- Kept as a function rather than a one-time INSERT so "Reset to defaults" in
-- the admin UI and the seed below share exactly one definition. Mirrors
-- DEFAULT_ROLE_PERMISSIONS in src/lib/permissions.ts.
CREATE OR REPLACE FUNCTION default_role_permissions()
RETURNS TABLE (role_slug TEXT, permission_key TEXT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  -- Super Admin holds everything, including permissions added later.
  SELECT 'super_admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
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
    ('sme', 'forum:post'),
    ('sme', 'forum:comment'),
    ('sme', 'mentorship:offer'),
    ('sme', 'dm:initiate'),
    ('sme', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'dm:initiate'),
    ('private_sector', 'dm:receive'),

    ('educational_partner', 'institution:approve_students'),
    ('educational_partner', 'grant:view'),
    ('educational_partner', 'grant:apply'),
    ('educational_partner', 'grant:sponsor'),
    ('educational_partner', 'project:create'),
    ('educational_partner', 'project:manage'),
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

    ('entrepreneur', 'grant:view'),
    ('entrepreneur', 'grant:apply'),
    ('entrepreneur', 'project:create'),
    ('entrepreneur', 'project:manage'),
    ('entrepreneur', 'forum:post'),
    ('entrepreneur', 'forum:comment'),
    ('entrepreneur', 'dm:initiate'),
    ('entrepreneur', 'dm:receive'),

    ('faculty', 'institution:approve_students'),
    ('faculty', 'grant:view'),
    ('faculty', 'grant:apply'),
    ('faculty', 'grant:sponsor'),
    ('faculty', 'project:create'),
    ('faculty', 'project:manage'),
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
    ('researcher', 'forum:post'),
    ('researcher', 'forum:comment'),
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    ('mentor', 'grant:view'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'forum:post'),
    ('mentor', 'forum:comment'),
    ('mentor', 'mentorship:offer'),
    ('mentor', 'dm:initiate'),
    ('mentor', 'dm:receive'),

    -- Read-only on grants, receives messages but never initiates.
    ('student', 'grant:view'),
    ('student', 'project:create'),
    ('student', 'project:manage'),
    ('student', 'forum:post'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- Seed every (role, permission) pair so the matrix UI has a row for each cell.
-- ON CONFLICT DO NOTHING: re-running the migration never overwrites an edit.
INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug,
       pd.key,
       EXISTS (SELECT 1 FROM default_role_permissions() d WHERE d.role_slug = rd.slug AND d.permission_key = pd.key)
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION reset_role_permissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INTEGER;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the check has to be explicit here.
  IF NOT has_permission(v_actor, 'role:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE role_permissions rp
  SET allowed = (
        SELECT EXISTS (
          SELECT 1 FROM default_role_permissions() d
          WHERE d.role_slug = rp.role_slug AND d.permission_key = rp.permission_key
        )
      ),
      updated_by = v_actor,
      updated_at = now()
  WHERE rp.allowed IS DISTINCT FROM (
        SELECT EXISTS (
          SELECT 1 FROM default_role_permissions() d
          WHERE d.role_slug = rp.role_slug AND d.permission_key = rp.permission_key
        )
      );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION reset_role_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_role_permissions() TO authenticated;

-- ============================================================
-- 5. Profile columns: active context + suspension
-- ============================================================

-- Multi-role users operate in one context at a time. NULL means "all roles",
-- which is the pre-existing behaviour, so no backfill is needed.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_roles ON profiles USING GIN (roles);

-- ============================================================
-- 6. Predicates
-- ============================================================

-- Resolve legacy slugs onto their modern equivalent. 'oecs' -> 'super_admin'.
CREATE OR REPLACE FUNCTION expand_roles(p_roles TEXT[])
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT slug FROM (
      SELECT unnest(p_roles) AS slug
      UNION
      SELECT rd.alias_of FROM role_definitions rd
      WHERE rd.slug = ANY(p_roles) AND rd.alias_of IS NOT NULL
    ) s
    WHERE slug IS NOT NULL
  ), ARRAY[]::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION is_suspended(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_suspended AND (p.suspended_until IS NULL OR p.suspended_until > now())
     FROM profiles p WHERE p.id = p_user),
    FALSE
  );
$$;

-- The helper 012_admin_dashboard_policies.sql documented in a comment but
-- never created. New policies use this; the ~60 legacy inline EXISTS clauses
-- are intentionally left alone.
CREATE OR REPLACE FUNCTION is_platform_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user AND 'super_admin' = ANY(expand_roles(p.roles))
  );
$$;

-- The single authorization predicate. Order matters:
--   1. no user            -> deny
--   2. suspended          -> deny everything
--   3. safeguard denial   -> deny, regardless of what the matrix says
--   4. matrix lookup
CREATE OR REPLACE FUNCTION has_permission(p_user UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
BEGIN
  IF p_user IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT expand_roles(p.roles) INTO v_roles FROM profiles p WHERE p.id = p_user;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  IF is_suspended(p_user) THEN
    RETURN FALSE;
  END IF;

  -- Safeguarding. Hard-coded on purpose: this must survive an admin toggling
  -- the matrix, a bad seed, and a direct UPDATE on role_permissions. A student
  -- who also holds an adult role is still treated as a student.
  IF 'student' = ANY(v_roles) AND p_permission IN (
    'dm:initiate',
    'grant:apply',
    'grant:manage_funds',
    'moderation:action',
    'moderation:escalate'
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_slug = ANY(v_roles)
      AND rp.permission_key = p_permission
      AND rp.allowed
  );
END;
$$;

-- Same check, narrowed to the user's active operating context. Used where
-- switching roles should genuinely change what is available rather than
-- unioning every role the account holds.
CREATE OR REPLACE FUNCTION has_permission_as(p_user UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active TEXT;
BEGIN
  SELECT p.active_role INTO v_active FROM profiles p WHERE p.id = p_user;

  -- No active context selected: fall back to the union of all held roles.
  IF v_active IS NULL THEN
    RETURN has_permission(p_user, p_permission);
  END IF;

  -- Never widen: the active context can only be a subset of what is held.
  IF NOT has_permission(p_user, p_permission) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_slug = ANY(expand_roles(ARRAY[v_active]))
      AND rp.permission_key = p_permission
      AND rp.allowed
  );
END;
$$;

-- Client bootstrap: one round trip for the whole capability set.
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT pd.key FROM permission_definitions pd
    WHERE has_permission(auth.uid(), pd.key)
    ORDER BY pd.sort_order
  ), ARRAY[]::TEXT[]);
$$;

REVOKE ALL ON FUNCTION get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_permissions() TO authenticated;

-- ============================================================
-- 7. Close the privilege-escalation hole on profiles
-- ============================================================

-- Migration 000 created this policy with USING and no WITH CHECK, and
-- ProfileSettingsTab submitted the roles column on an ordinary save, so any
-- user could write 'oecs' to themselves. WITH CHECK alone is not enough —
-- it only re-asserts row ownership — so the column guard is a trigger.
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trusted server-side paths (institution approval, chamber verification)
-- legitimately grant roles while auth.uid() is still the calling user. They
-- set this transaction-local flag rather than being granted a blanket bypass.
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
BEGIN
  -- service_role has no JWT subject; trusted RPCs opt in explicitly.
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
     OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
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

-- Signup metadata is unvalidated user input (see handle_new_user in 044), so
-- the same rule applies at INSERT: a self-assignable role or nothing.
CREATE OR REPLACE FUNCTION guard_profile_insert_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.roles := COALESCE(ARRAY(
    SELECT slug FROM unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[])) AS slug
    WHERE EXISTS (
      SELECT 1 FROM role_definitions rd WHERE rd.slug = slug AND rd.is_self_assignable
    )
  ), ARRAY[]::TEXT[]);

  NEW.is_verified := FALSE;
  NEW.is_suspended := FALSE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert_roles_trigger ON profiles;
CREATE TRIGGER guard_profile_insert_roles_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_insert_roles();

-- Admin-side role assignment. Goes through a function so the audit story is
-- one code path rather than a bare UPDATE from the browser.
CREATE OR REPLACE FUNCTION set_user_roles(p_user UUID, p_roles TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_unknown TEXT[];
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

REVOKE ALL ON FUNCTION set_user_roles(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_user_roles(UUID, TEXT[]) TO authenticated;

-- Account suspension, used by the moderation engine in 065 and by admins.
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

REVOKE ALL ON FUNCTION set_user_suspension(UUID, BOOLEAN, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_user_suspension(UUID, BOOLEAN, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================================
-- 8. Audit trail
-- ============================================================

-- UPDATE only. A BEFORE INSERT trigger fires before ON CONFLICT is evaluated,
-- so auditing inserts would write an event for every skipped seed row each time
-- this migration is re-run — an audit log full of changes that never happened.
CREATE OR REPLACE FUNCTION log_role_permission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.allowed IS NOT DISTINCT FROM OLD.allowed THEN
    RETURN NEW;
  END IF;

  INSERT INTO role_permission_events (role_slug, permission_key, from_allowed, to_allowed, actor_id)
  VALUES (NEW.role_slug, NEW.permission_key, OLD.allowed, NEW.allowed, auth.uid());

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_role_permission_change_trigger ON role_permissions;
CREATE TRIGGER log_role_permission_change_trigger
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION log_role_permission_change();

-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission_events ENABLE ROW LEVEL SECURITY;

-- The catalog is public: the UI labels roles on member cards for signed-out
-- visitors too. Only the matrix and the audit trail are restricted.
DROP POLICY IF EXISTS "Anyone can view role definitions" ON role_definitions;
CREATE POLICY "Anyone can view role definitions"
  ON role_definitions FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can view permission definitions" ON permission_definitions;
CREATE POLICY "Anyone can view permission definitions"
  ON permission_definitions FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Authenticated users can view the matrix" ON role_permissions;
CREATE POLICY "Authenticated users can view the matrix"
  ON role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permission managers can edit the matrix" ON role_permissions;
CREATE POLICY "Permission managers can edit the matrix"
  ON role_permissions FOR UPDATE
  USING (has_permission(auth.uid(), 'role:manage'))
  WITH CHECK (has_permission(auth.uid(), 'role:manage'));

DROP POLICY IF EXISTS "Auditors can view permission history" ON role_permission_events;
CREATE POLICY "Auditors can view permission history"
  ON role_permission_events FOR SELECT
  USING (has_permission(auth.uid(), 'audit:view'));

-- No INSERT/UPDATE/DELETE policies on role_permission_events: it is written
-- only by log_role_permission_change(), which is SECURITY DEFINER.

NOTIFY pgrst, 'reload schema';
