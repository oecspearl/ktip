-- ============================================================================
-- COMBINED MIGRATION: 062 -> 069
--
-- Migrations 062-069 concatenated in order, for pasting into the Supabase
-- SQL editor in one go (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Generated from the individual files in supabase/migrations/. Those remain
-- the source of truth -- regenerate this file rather than editing it.
--
-- SAFE TO RE-RUN. Every statement is idempotent (CREATE ... IF NOT EXISTS,
-- DROP POLICY/TRIGGER IF EXISTS before CREATE, CREATE OR REPLACE FUNCTION,
-- INSERT ... ON CONFLICT DO NOTHING/UPDATE), so applying this over a
-- partially-applied database repairs it instead of failing.
--
-- ORDER MATTERS. 063 creates the role/permission tables that 064's
-- safeguarding policies and 065's moderation policies both call into, and 067
-- seeds rows into tables 066 creates. The BEGIN/COMMIT below keeps the whole
-- set all-or-nothing: a failure anywhere rolls back, so the database can never
-- end up half-applied.
--
-- What this fixes:
--   404 on trophy_assets  -> 066/067 never applied
--   404 on resumes        -> 069 never applied
--   404 on vc_* / SSO     -> 068 never applied
--
-- The per-file `NOTIFY pgrst, 'reload schema'` calls were stripped; a single
-- one runs at the end, inside the transaction, so PostgREST refreshes its
-- schema cache once the whole set commits.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- ############################################################################
-- ## 062_event_challenge.sql
-- ############################################################################

-- Migration 062: Event challenge brief
--
-- Some events (hackathons, demo days, innovation challenges) are not just
-- "show up" — attendees are given a goal to accomplish. The brief is a set of
-- objectives, constraints, deliverables and judging criteria.
--
-- These live as typed ROWS, not as a JSONB blob in events.details, because a
-- later phase attaches submissions and judge scores to individual criteria
-- ("this entry met objective 2", "judge scored 8/10 on criterion 3"). Nothing
-- can reference an item inside a JSONB array.
--
-- One table for all four kinds: same shape, same editor, one enum column.

-- ============================================================
-- 1. Flag + deadline on events
-- ============================================================

-- No new event_type: a hackathon may or may not run a formal challenge, and a
-- workshop may. The flag is what turns the brief on, not the type.
ALTER TABLE events ADD COLUMN IF NOT EXISTS has_challenge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ;

COMMENT ON COLUMN events.has_challenge IS 'Event sets a goal attendees must accomplish; enables the challenge brief';
COMMENT ON COLUMN events.submission_deadline IS 'When entries close; independent of end_date (judging may run past it)';

-- ============================================================
-- 2. The brief
-- ============================================================

CREATE TABLE IF NOT EXISTS event_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('objective', 'constraint', 'deliverable', 'judging_criterion')),
  title TEXT NOT NULL,
  description TEXT,
  -- objective/constraint/deliverable: must an entry satisfy this to qualify?
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  -- judging_criterion only: relative share of the total score.
  weight NUMERIC(5,2) CHECK (weight IS NULL OR weight >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_criteria_event ON event_criteria(event_id, kind, sort_order);

COMMENT ON TABLE event_criteria IS 'Challenge brief for an event: objectives, constraints, deliverables and judging criteria';
COMMENT ON COLUMN event_criteria.is_required IS 'Hard rule vs guidance; ignored for judging_criterion';
COMMENT ON COLUMN event_criteria.weight IS 'Judging criteria only — relative weight, normalised at scoring time';

-- ============================================================
-- 3. RLS — same shape as event_page_sections / event_speakers
-- ============================================================

ALTER TABLE event_criteria ENABLE ROW LEVEL SECURITY;

-- Non-draft, not just published: the brief stays readable after an event
-- completes, so past winners' entries still make sense.
DROP POLICY IF EXISTS "Anyone can view criteria of non-draft events" ON event_criteria;
CREATE POLICY "Anyone can view criteria of non-draft events"
  ON event_criteria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_criteria.event_id
        AND events.status <> 'draft'
    )
  );

DROP POLICY IF EXISTS "Organizers can manage their event criteria" ON event_criteria;
CREATE POLICY "Organizers can manage their event criteria"
  ON event_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_criteria.event_id
        AND events.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "OECS admins can manage all event criteria" ON event_criteria;
CREATE POLICY "OECS admins can manage all event criteria"
  ON event_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

-- ============================================================
-- 4. updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION touch_event_criteria()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_event_criteria_trigger ON event_criteria;
CREATE TRIGGER touch_event_criteria_trigger
  BEFORE UPDATE ON event_criteria
  FOR EACH ROW
  EXECUTE FUNCTION touch_event_criteria();



-- ############################################################################
-- ## 063_rbac_permissions.sql
-- ############################################################################

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



-- ############################################################################
-- ## 064_institutions_safeguarding_chamber.sql
-- ############################################################################

-- Migration 064: Institutions, student safeguarding, Chamber of Commerce
--
-- Three problems this closes, all of them currently wide open:
--
--   1. Anyone can message anyone. conversation_participants lets the creator
--      add any user, and nothing in the messaging policies reads a role. A
--      platform that hosts school-verified minors cannot ship that.
--   2. Anyone can submit a grant application. The gate is
--      WITH CHECK (auth.uid() = user_id) and nothing else, so a student can
--      apply for and be awarded funding with no institutional sponsor.
--   3. "Student" and "SME" are unverified self-declared strings. There is no
--      record of which school owns dsc.edu.dm, and no country-level authority
--      that vets a business.
--
-- Institutions are one table for schools, universities, TVETs and chambers:
-- they differ only in what their membership means, and a chamber's country is
-- the same column as a school's country. institution_members therefore doubles
-- as the chamber-admin mapping.
--
-- Employers are NOT rebuilt. 058 already models a verified company with an
-- append-only verification event log; the chamber is a second review authority
-- writing into the same tables, not a parallel universe.
--
-- Note on enforcement points: `messages` is in the supabase_realtime
-- publication, so a rule applied after insert has already reached the
-- recipient's socket. All messaging rules here are WITH CHECK predicates.
--
-- Idempotent — safe to re-run. Requires 063.

-- ============================================================
-- 1. Institutions
-- ============================================================

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('school', 'university', 'tvet', 'chamber')),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  -- Domains this institution owns. A student email must match one of these
  -- AND the institution must be verified before the student role is granted.
  email_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  contact_email TEXT CHECK (contact_email IS NULL OR contact_email = lower(contact_email)),
  website_url TEXT,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  review_note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same rule as employers_verified_has_evidence (058): a verified record must
  -- name who verified it and when.
  CONSTRAINT institutions_verified_has_evidence CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_institutions_country ON institutions(country_code);
CREATE INDEX IF NOT EXISTS idx_institutions_kind_status ON institutions(kind, status);
CREATE INDEX IF NOT EXISTS idx_institutions_domains ON institutions USING GIN (email_domains);

CREATE TABLE IF NOT EXISTS institution_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'educator', 'student')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_members_user ON institution_members(user_id);
CREATE INDEX IF NOT EXISTS idx_institution_members_pending
  ON institution_members(institution_id) WHERE status = 'pending';

-- Minor-safety record. Only the birth YEAR is stored: enough to decide minor
-- status for COPPA/GDPR handling, without holding a full date of birth for a
-- child. is_minor is derived, so it cannot drift from the year it came from.
CREATE TABLE IF NOT EXISTS student_safeguarding (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  verified_domain TEXT,
  sponsor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  birth_year INTEGER CHECK (birth_year IS NULL OR (birth_year > 1900 AND birth_year <= EXTRACT(YEAR FROM now()))),
  guardian_consent_at TIMESTAMPTZ,
  guardian_consent_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not a GENERATED column: the expression depends on the current year, and
-- generated columns must be immutable. Maintained on write instead, and
-- recomputed whenever the row is touched.
ALTER TABLE student_safeguarding ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION derive_student_minor_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_minor := NEW.birth_year IS NOT NULL
    AND (EXTRACT(YEAR FROM now())::INTEGER - NEW.birth_year) < 18;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS derive_student_minor_status_trigger ON student_safeguarding;
CREATE TRIGGER derive_student_minor_status_trigger
  BEFORE INSERT OR UPDATE ON student_safeguarding
  FOR EACH ROW
  EXECUTE FUNCTION derive_student_minor_status();

-- ============================================================
-- 2. Institution membership helpers
-- ============================================================

CREATE OR REPLACE FUNCTION is_institution_admin(p_institution UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM institution_members im
    WHERE im.institution_id = p_institution
      AND im.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
  );
$$;

-- A chamber admin's authority is bounded by the country of the chamber they
-- belong to. Returns the set of ISO codes this user may act on.
CREATE OR REPLACE FUNCTION chamber_countries(p_user UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT i.country_code
    FROM institution_members im
    JOIN institutions i ON i.id = im.institution_id
    WHERE im.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
      AND i.kind = 'chamber'
      AND i.status = 'verified'
  ), ARRAY[]::TEXT[]);
$$;

-- Self-serve: a user asks to be recognised as a student of the institution
-- that owns their email domain. Grants nothing on its own — an educator still
-- has to approve, which is what actually assigns the student role.
CREATE OR REPLACE FUNCTION request_student_verification()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_domain TEXT;
  v_institution UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_user;
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_email');
  END IF;

  v_domain := split_part(v_email, '@', 2);

  SELECT i.id INTO v_institution
  FROM institutions i
  WHERE i.status = 'verified'
    AND i.kind <> 'chamber'
    AND v_domain = ANY(i.email_domains)
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'domain_not_recognised', 'domain', v_domain);
  END IF;

  INSERT INTO institution_members (institution_id, user_id, role, status)
  VALUES (v_institution, v_user, 'student', 'pending')
  ON CONFLICT (institution_id, user_id) DO UPDATE
    SET status = CASE WHEN institution_members.status = 'rejected' THEN 'pending' ELSE institution_members.status END;

  INSERT INTO student_safeguarding (user_id, institution_id, verified_domain)
  VALUES (v_user, v_institution, v_domain)
  ON CONFLICT (user_id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        verified_domain = EXCLUDED.verified_domain,
        updated_at = now();

  RETURN jsonb_build_object('ok', TRUE, 'institution_id', v_institution, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION request_student_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_student_verification() TO authenticated;

-- Educator approval. This is the only path that grants the student role, which
-- is why it opts into the profile guard bypass from 063 rather than the caller
-- being able to write profiles.roles directly.
CREATE OR REPLACE FUNCTION review_institution_member(
  p_member UUID,
  p_approve BOOLEAN,
  p_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_institution UUID;
  v_user UUID;
  v_role TEXT;
  v_kind TEXT;
  v_grant TEXT;
BEGIN
  SELECT im.institution_id, im.user_id, COALESCE(p_role, im.role), i.kind
    INTO v_institution, v_user, v_role, v_kind
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.id = p_member;

  IF v_institution IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT (is_institution_admin(v_institution, v_actor) OR has_permission(v_actor, 'institution:verify')) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF v_role = 'student' AND NOT has_permission(v_actor, 'institution:approve_students')
     AND NOT is_institution_admin(v_institution, v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  UPDATE institution_members
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      role = v_role,
      approved_by = v_actor,
      approved_at = CASE WHEN p_approve THEN now() ELSE NULL END
  WHERE id = p_member;

  IF p_approve THEN
    v_grant := CASE
      WHEN v_kind = 'chamber' THEN 'chamber_admin'
      WHEN v_role = 'student' THEN 'student'
      WHEN v_role = 'admin' THEN 'educational_partner'
      ELSE 'faculty'
    END;

    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN v_grant = ANY(roles) THEN roles ELSE array_append(roles, v_grant) END,
        updated_at = now()
    WHERE id = v_user;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_user,
      'institution_membership',
      'Institution membership approved',
      'Your account has been approved and now has the ' || v_grant || ' role.',
      '/settings'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'granted_role', v_grant);
END;
$$;

REVOKE ALL ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_institution_member(UUID, BOOLEAN, TEXT) TO authenticated;

-- ============================================================
-- 3. Chamber of Commerce SME verification
-- ============================================================

ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE employers ADD COLUMN IF NOT EXISTS chamber_reviewed_at TIMESTAMPTZ;

-- 058 fixed the method vocabulary before chambers existed.
ALTER TABLE employers DROP CONSTRAINT IF EXISTS employers_verification_method_check;
ALTER TABLE employers ADD CONSTRAINT employers_verification_method_check
  CHECK (verification_method IS NULL OR verification_method IN (
    'document_review', 'registry_lookup', 'manual_attestation', 'chamber_attestation'
  ));

-- Mirrors set_employer_verification (058) but scoped: the caller must be an
-- approved admin of a verified chamber in the SAME country as the employer.
CREATE OR REPLACE FUNCTION set_employer_verification_by_chamber(
  p_employer UUID,
  p_status TEXT,
  p_registration_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_country CHAR(2);
  v_from TEXT;
  v_chamber UUID;
  v_owner UUID;
BEGIN
  IF NOT has_permission(v_actor, 'sme:verify') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_status');
  END IF;

  SELECT e.country_code, e.verification_status, e.created_by
    INTO v_country, v_from, v_owner
  FROM employers e WHERE e.id = p_employer;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT (v_country = ANY(chamber_countries(v_actor))) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'wrong_country', 'country', v_country);
  END IF;

  SELECT i.id INTO v_chamber
  FROM institution_members im
  JOIN institutions i ON i.id = im.institution_id
  WHERE im.user_id = v_actor AND im.status = 'approved'
    AND i.kind = 'chamber' AND i.status = 'verified' AND i.country_code = v_country
  LIMIT 1;

  UPDATE employers
  SET verification_status = p_status,
      verification_method = CASE WHEN p_status = 'verified' THEN 'chamber_attestation' ELSE verification_method END,
      registration_number = COALESCE(p_registration_number, registration_number),
      verified_at = CASE WHEN p_status = 'verified' THEN now() ELSE NULL END,
      verified_by = CASE WHEN p_status = 'verified' THEN v_actor ELSE NULL END,
      verification_note = COALESCE(p_note, verification_note),
      chamber_institution_id = v_chamber,
      chamber_reviewed_by = v_actor,
      chamber_reviewed_at = now(),
      updated_at = now()
  WHERE id = p_employer;

  INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id)
  VALUES (p_employer, v_from, p_status, 'chamber_attestation', p_note, v_actor);

  -- A verified company promotes its owner to the SME role, which is what
  -- unlocks posting industry projects and private-sector grants.
  IF p_status = 'verified' AND v_owner IS NOT NULL THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN 'sme' = ANY(roles) THEN roles ELSE array_append(roles, 'sme') END,
        updated_at = now()
    WHERE id = v_owner;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    PERFORM send_notification(
      v_owner,
      'employer_verified',
      'Your business is verified',
      'Your National Chamber of Commerce has verified your business. SME features are now available.',
      '/settings'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_verification_by_chamber(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 058 let only platform admins create an employer, because there was no
-- reviewer other than the Secretariat. Chambers are that reviewer, so a
-- business can now register itself — unverified, and unable to edit itself
-- afterwards (058 deliberately has no member-facing UPDATE policy, and that
-- stays true: an employer that could edit its own row post-verification would
-- put attacker-controlled data behind a verified badge).
DROP POLICY IF EXISTS "Businesses can register themselves" ON employers;
CREATE POLICY "Businesses can register themselves"
  ON employers FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND verification_status = 'pending'
    AND verified_at IS NULL
    AND verified_by IS NULL
  );

DROP POLICY IF EXISTS "Registrants and chambers can view employers" ON employers;
CREATE POLICY "Registrants and chambers can view employers"
  ON employers FOR SELECT
  USING (
    created_by = auth.uid()
    OR (has_permission(auth.uid(), 'sme:verify') AND country_code = ANY(chamber_countries(auth.uid())))
  );

DROP POLICY IF EXISTS "Chambers can view verification events" ON employer_verification_events;
CREATE POLICY "Chambers can view verification events"
  ON employer_verification_events FOR SELECT
  USING (
    has_permission(auth.uid(), 'sme:verify')
    AND EXISTS (
      SELECT 1 FROM employers e
      WHERE e.id = employer_verification_events.employer_id
        AND e.country_code = ANY(chamber_countries(auth.uid()))
    )
  );

-- ============================================================
-- 4. Messaging safeguards
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_supervised BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION conversation_has_student(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.user_id
    WHERE cp.conversation_id = p_conversation AND 'student' = ANY(p.roles)
  );
$$;

CREATE OR REPLACE FUNCTION conversation_has_supervisor(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation
      AND has_permission(cp.user_id, 'dm:supervise')
  );
$$;

-- The rule: a thread containing a student must be a group thread with at
-- least one designated educator in it. That makes unmonitored 1-on-1 contact
-- between an adult and a minor unrepresentable rather than merely discouraged.
CREATE OR REPLACE FUNCTION can_message(p_sender UUID, p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_group BOOLEAN;
BEGIN
  IF p_sender IS NULL OR p_conversation IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT is_conversation_participant(p_conversation, p_sender) THEN
    RETURN FALSE;
  END IF;

  IF NOT has_permission(p_sender, 'dm:receive') THEN
    RETURN FALSE;
  END IF;

  IF NOT conversation_has_student(p_conversation) THEN
    RETURN TRUE;
  END IF;

  SELECT c.is_group INTO v_is_group FROM conversations c WHERE c.id = p_conversation;

  RETURN COALESCE(v_is_group, FALSE) AND conversation_has_supervisor(p_conversation);
END;
$$;

-- Keeps conversations.is_supervised in step with who is actually in the room,
-- so the UI can label a channel without recomputing the predicate per render.
CREATE OR REPLACE FUNCTION refresh_conversation_supervision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation UUID := COALESCE(NEW.conversation_id, OLD.conversation_id);
BEGIN
  UPDATE conversations
  SET is_supervised = conversation_has_supervisor(v_conversation),
      updated_at = now()
  WHERE id = v_conversation;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_conversation_supervision_trigger ON conversation_participants;
CREATE TRIGGER refresh_conversation_supervision_trigger
  AFTER INSERT OR DELETE ON conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION refresh_conversation_supervision();

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND has_permission(auth.uid(), 'dm:initiate')
  );

-- Blocks a 1-to-1 thread from ever containing a student, in either insert
-- order: the student cannot be added to a direct thread, and nobody can be
-- added to a direct thread that already holds one.
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      OR is_conversation_creator(conversation_id, auth.uid())
      OR is_conversation_admin(conversation_id, auth.uid())
    )
    AND (
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR (
        NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = conversation_participants.user_id AND 'student' = ANY(p.roles))
        AND NOT conversation_has_student(conversation_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can send messages to own conversations" ON messages;
CREATE POLICY "Users can send messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND can_message(auth.uid(), conversation_id)
  );

-- ============================================================
-- 5. Grant application safeguards
-- ============================================================

ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_approved_at TIMESTAMPTZ;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS sponsor_note TEXT;

CREATE INDEX IF NOT EXISTS idx_grant_applications_sponsor
  ON grant_applications(sponsor_id) WHERE sponsor_id IS NOT NULL;

-- Drafting is allowed to anyone who can see grants, so a student can prepare
-- an application; only leaving 'draft' requires the right to apply. Students
-- never hold grant:apply (063 denies it in has_permission), so for them the
-- only route out of draft is an accepted faculty sponsor.
CREATE OR REPLACE FUNCTION enforce_grant_application_sponsor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_student BOOLEAN;
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT 'student' = ANY(p.roles) INTO v_is_student FROM profiles p WHERE p.id = NEW.user_id;

  IF COALESCE(v_is_student, FALSE) THEN
    IF NEW.sponsor_id IS NULL THEN
      RAISE EXCEPTION 'a student application requires a faculty or school sponsor';
    END IF;
    IF NEW.sponsor_approved_at IS NULL THEN
      RAISE EXCEPTION 'the nominated sponsor has not accepted this application yet';
    END IF;
    IF NOT has_permission(NEW.sponsor_id, 'grant:sponsor') THEN
      RAISE EXCEPTION 'the nominated sponsor is not permitted to sponsor applications';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT has_permission(NEW.user_id, 'grant:apply') THEN
    RAISE EXCEPTION 'this account is not permitted to submit grant applications';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_grant_application_sponsor_trigger ON grant_applications;
CREATE TRIGGER enforce_grant_application_sponsor_trigger
  BEFORE INSERT OR UPDATE ON grant_applications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_grant_application_sponsor();

DROP POLICY IF EXISTS "Users can create applications" ON grant_applications;
CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR (status = 'draft' AND has_permission(auth.uid(), 'grant:view'))
    )
  );

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR status = 'draft'
      OR sponsor_approved_at IS NOT NULL
    )
  );

-- The sponsor's side of the handshake. A student nominates; the sponsor
-- accepts here. Without this the student could name any faculty member and
-- submit in their name.
CREATE OR REPLACE FUNCTION review_grant_sponsorship(
  p_application UUID,
  p_accept BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sponsor UUID;
  v_applicant UUID;
BEGIN
  SELECT ga.sponsor_id, ga.user_id INTO v_sponsor, v_applicant
  FROM grant_applications ga WHERE ga.id = p_application;

  IF v_sponsor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_sponsor <> v_actor OR NOT has_permission(v_actor, 'grant:sponsor') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  UPDATE grant_applications
  SET sponsor_approved_at = CASE WHEN p_accept THEN now() ELSE NULL END,
      sponsor_id = CASE WHEN p_accept THEN sponsor_id ELSE NULL END,
      sponsor_note = p_note,
      updated_at = now()
  WHERE id = p_application;

  PERFORM send_notification(
    v_applicant,
    'grant_sponsorship',
    CASE WHEN p_accept THEN 'Sponsor accepted' ELSE 'Sponsor declined' END,
    COALESCE(p_note, CASE WHEN p_accept
      THEN 'Your sponsor accepted. You can now submit this application.'
      ELSE 'Your nominated sponsor declined this application.' END),
    '/grants/my-applications'
  );

  RETURN jsonb_build_object('ok', TRUE, 'accepted', p_accept);
END;
$$;

REVOKE ALL ON FUNCTION review_grant_sponsorship(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_grant_sponsorship(UUID, BOOLEAN, TEXT) TO authenticated;

-- A sponsor has to be able to read what they are being asked to vouch for.
DROP POLICY IF EXISTS "Sponsors can view applications naming them" ON grant_applications;
CREATE POLICY "Sponsors can view applications naming them"
  ON grant_applications FOR SELECT
  USING (sponsor_id = auth.uid());

-- ============================================================
-- 6. Permission gates on content creation
-- ============================================================

-- has_permission() already returns FALSE for a suspended account, so these
-- double as the suspension gate.

DROP POLICY IF EXISTS "Authenticated users can create posts" ON forum_posts;
CREATE POLICY "Authenticated users can create posts"
  ON forum_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id AND has_permission(auth.uid(), 'forum:post'));

DROP POLICY IF EXISTS "Authenticated users can create replies" ON forum_replies;
CREATE POLICY "Authenticated users can create replies"
  ON forum_replies FOR INSERT
  WITH CHECK (auth.uid() = author_id AND has_permission(auth.uid(), 'forum:comment'));

DROP POLICY IF EXISTS "Authenticated users can comment" ON project_comments;
CREATE POLICY "Authenticated users can comment"
  ON project_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND has_permission(auth.uid(), 'forum:comment')
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
CREATE POLICY "Authenticated users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND has_permission(auth.uid(), 'project:create'));

-- 003 left grants writable by ANY authenticated user, including UPDATE and
-- DELETE of rows they did not create, with a comment deferring the fix. The
-- grant:post permission is that fix.
DROP POLICY IF EXISTS "Authenticated users can create grants" ON grants;
CREATE POLICY "Authenticated users can create grants"
  ON grants FOR INSERT
  WITH CHECK (has_permission(auth.uid(), 'grant:post'));

DROP POLICY IF EXISTS "Users can update grants they created" ON grants;
CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE
  USING (has_permission(auth.uid(), 'grant:post'));

DROP POLICY IF EXISTS "Users can delete grants they created" ON grants;
CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE
  USING (has_permission(auth.uid(), 'grant:post'));

-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_safeguarding ENABLE ROW LEVEL SECURITY;

-- Verified institutions are public: the signup screen has to tell a student
-- whether their school is recognised before they try.
DROP POLICY IF EXISTS "Verified institutions are public" ON institutions;
CREATE POLICY "Verified institutions are public"
  ON institutions FOR SELECT
  USING (
    status = 'verified'
    OR created_by = auth.uid()
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Authenticated users can register an institution" ON institutions;
CREATE POLICY "Authenticated users can register an institution"
  ON institutions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Institution verifiers can review" ON institutions;
CREATE POLICY "Institution verifiers can review"
  ON institutions FOR UPDATE
  USING (has_permission(auth.uid(), 'institution:verify') OR is_institution_admin(id, auth.uid()))
  WITH CHECK (has_permission(auth.uid(), 'institution:verify') OR is_institution_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Members can view their institution roster" ON institution_members;
CREATE POLICY "Members can view their institution roster"
  ON institution_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'institution:verify')
  );

DROP POLICY IF EXISTS "Users can request membership" ON institution_members;
CREATE POLICY "Users can request membership"
  ON institution_members FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Institution admins can manage the roster" ON institution_members;
CREATE POLICY "Institution admins can manage the roster"
  ON institution_members FOR UPDATE
  USING (is_institution_admin(institution_id, auth.uid()) OR has_permission(auth.uid(), 'institution:verify'));

-- Safeguarding records describe a minor. Readable by the student, their
-- institution's staff, and safety admins — nobody else, including other
-- platform admins without the moderation permission.
DROP POLICY IF EXISTS "Safeguarding records are restricted" ON student_safeguarding;
CREATE POLICY "Safeguarding records are restricted"
  ON student_safeguarding FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_institution_admin(institution_id, auth.uid())
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Students can maintain their own safeguarding record" ON student_safeguarding;
CREATE POLICY "Students can maintain their own safeguarding record"
  ON student_safeguarding FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());



-- ############################################################################
-- ## 065_moderation.sql
-- ############################################################################

-- Migration 065: Content reporting and automated moderation
--
-- What exists today: grievances (018), which reports a PERSON. There is no way
-- to report a post, a reply, a comment or a message, and no way to hide one —
-- forum_posts has is_pinned and nothing else, and its SELECT policy is
-- USING (TRUE), so content is world-readable the instant it is written.
--
-- Two design points worth stating up front.
--
-- Enforcement is at INSERT, not after. `messages` is in the supabase_realtime
-- publication (004): the client is subscribed to INSERT events, so a row that
-- is written and then hidden has already been delivered to the recipient's
-- open socket. Anything that must never be seen has to be classified before
-- the row lands, which is why scan_content() is a deterministic BEFORE INSERT
-- trigger rather than a call out to a model. api/moderate.ts adds an LLM
-- second opinion afterwards, for triage only — it never gates delivery.
--
-- The SELECT policies here REPLACE the permissive ones. RLS ORs policies
-- together, so adding a status-aware policy alongside USING (TRUE) would hide
-- nothing at all.
--
-- Idempotent — safe to re-run. Requires 063 and 064.

-- ============================================================
-- 1. Content status
-- ============================================================

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE forum_posts DROP CONSTRAINT IF EXISTS forum_posts_status_check;
ALTER TABLE forum_posts ADD CONSTRAINT forum_posts_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE forum_replies DROP CONSTRAINT IF EXISTS forum_replies_status_check;
ALTER TABLE forum_replies ADD CONSTRAINT forum_replies_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE project_comments DROP CONSTRAINT IF EXISTS project_comments_status_check;
ALTER TABLE project_comments ADD CONSTRAINT project_comments_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS moderation_severity TEXT;

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_forum_posts_status ON forum_posts(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_forum_replies_status ON forum_replies(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_project_comments_status ON project_comments(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status <> 'active';

-- ============================================================
-- 2. Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS moderation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- N distinct reporters within X minutes auto-quarantines the target.
  report_threshold INTEGER NOT NULL DEFAULT 3 CHECK (report_threshold > 0),
  report_window_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (report_window_minutes > 0),
  auto_quarantine_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  low_action TEXT NOT NULL DEFAULT 'warned',
  medium_action TEXT NOT NULL DEFAULT 'quarantined',
  high_action TEXT NOT NULL DEFAULT 'suspended',
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO moderation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Term list. country_code scopes a regional slur to the one member state where
-- it is a slur, so a word that is innocuous in Dominica is not flagged there
-- because it is offensive elsewhere.
CREATE TABLE IF NOT EXISTS moderation_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'term' CHECK (kind IN ('term', 'regex')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  category TEXT CHECK (category IS NULL OR category IN (
    'hate_harassment', 'bullying', 'nsfw', 'spam_scam', 'grooming_risk', 'pii_leak'
  )),
  country_code CHAR(2) REFERENCES countries(code),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expression index rather than a table constraint: a global rule and a
-- country-scoped rule may share a pattern, but two global ones may not.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_terms_unique
  ON moderation_terms (pattern, COALESCE(country_code, 'ZZ'));

CREATE INDEX IF NOT EXISTS idx_moderation_terms_active ON moderation_terms(severity) WHERE is_active;

-- Seed: PII and grooming patterns only. Slur lists are intentionally NOT
-- shipped in source control — they are regional, they change, and they belong
-- to the safety team. Admins add them from /admin/moderation.
INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('(\+?\d[\d\s().-]{7,}\d)', 'regex', 'medium', 'pii_leak', 'Phone number'),
  ('([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'regex', 'low', 'pii_leak', 'Email address'),
  ('(\d{1,5}\s+[A-Za-z0-9.\s]{3,40}\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr))', 'regex', 'medium', 'pii_leak', 'Street address'),
  ('((instagram|snapchat|tiktok|telegram|whatsapp|wa\.me)\.?(com)?/[A-Za-z0-9_.]+)', 'regex', 'medium', 'pii_leak', 'Personal social link'),
  ('(don''?t tell (your |any)?(parents|mum|mom|dad|teacher))', 'regex', 'high', 'grooming_risk', 'Secrecy request'),
  ('(keep this (a )?secret between us)', 'regex', 'high', 'grooming_risk', 'Secrecy request'),
  ('(how old are you|what''?s your age).{0,40}(send|pic|photo|alone)', 'regex', 'high', 'grooming_risk', 'Age probing plus solicitation'),
  ('(meet me|come over).{0,30}(alone|without)', 'regex', 'high', 'grooming_risk', 'Isolation request')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. Reports
-- ============================================================

CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'forum_post', 'forum_reply', 'project', 'project_comment', 'message', 'profile', 'grant'
  )),
  target_id UUID NOT NULL,
  target_author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'hate_harassment', 'bullying', 'nsfw', 'spam_scam', 'grooming_risk', 'pii_leak'
  )),
  detail TEXT,
  -- Frozen at report time so triage survives the author editing or deleting.
  content_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One report per person per item: the auto-quarantine threshold counts
  -- reporters, so it must not be gameable by one user filing repeatedly.
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_open ON content_reports(created_at DESC) WHERE status = 'open';

-- Append-only. Written by SECURITY DEFINER functions only — no write policies,
-- the pattern 059 uses for api_access_log.
CREATE TABLE IF NOT EXISTS moderation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('system', 'admin', 'reporter')),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id UUID,
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  action TEXT NOT NULL CHECK (action IN (
    'flagged', 'warned', 'quarantined', 'restored', 'removed', 'suspended', 'escalated'
  )),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_user ON moderation_log(user_id);

-- ============================================================
-- 4. Scanner
-- ============================================================

CREATE OR REPLACE FUNCTION scan_content(p_text TEXT, p_country CHAR(2) DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_matches JSONB := '[]'::JSONB;
  v_rank INTEGER := 0;  -- 0 none, 1 low, 2 medium, 3 high
  v_hit BOOLEAN;
BEGIN
  IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
    RETURN jsonb_build_object('severity', NULL, 'matches', v_matches);
  END IF;

  -- Ordered high-first so matches[0] names the worst rule, which is what the
  -- quarantine record uses as its category.

  FOR v_rule IN
    SELECT id, pattern, kind, severity, category
    FROM moderation_terms
    WHERE is_active
      AND (country_code IS NULL OR country_code = p_country)
    ORDER BY CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
  LOOP
    IF v_rule.kind = 'regex' THEN
      v_hit := p_text ~* v_rule.pattern;
    ELSE
      -- Word-boundary match so "class" does not trip a rule for "ass".
      v_hit := p_text ~* ('\m' || regexp_replace(v_rule.pattern, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M');
    END IF;

    IF v_hit THEN
      v_matches := v_matches || jsonb_build_object(
        'rule_id', v_rule.id,
        'severity', v_rule.severity,
        'category', v_rule.category
      );

      -- Highest severity across all matched rules wins.
      v_rank := GREATEST(v_rank, CASE v_rule.severity
        WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'severity', CASE v_rank WHEN 3 THEN 'high' WHEN 2 THEN 'medium' WHEN 1 THEN 'low' ELSE NULL END,
    'matches', v_matches
  );
END;
$$;

REVOKE ALL ON FUNCTION scan_content(TEXT, CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scan_content(TEXT, CHAR) TO authenticated;

-- ============================================================
-- 5. Insert-time moderation
-- ============================================================

-- One trigger for all four content tables. The column holding the text and
-- the column holding the author differ per table, so both are passed as
-- trigger arguments rather than branching on TG_TABLE_NAME.
--   TG_ARGV[0] = text column, TG_ARGV[1] = author column
CREATE OR REPLACE FUNCTION moderate_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT;
  v_author UUID;
  v_country CHAR(2);
  v_scan JSONB;
  v_severity TEXT;
  v_settings moderation_settings%ROWTYPE;
  v_row JSONB := to_jsonb(NEW);
  v_target TEXT;
BEGIN
  v_text := v_row ->> TG_ARGV[0];
  v_author := (v_row ->> TG_ARGV[1])::UUID;

  -- content_reports.target_type is singular; TG_TABLE_NAME is the plural table.
  v_target := CASE TG_TABLE_NAME
    WHEN 'forum_posts' THEN 'forum_post'
    WHEN 'forum_replies' THEN 'forum_reply'
    WHEN 'project_comments' THEN 'project_comment'
    WHEN 'messages' THEN 'message'
    ELSE TG_TABLE_NAME
  END;

  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  SELECT upper(left(COALESCE(p.country, ''), 2)) INTO v_country FROM profiles p WHERE p.id = v_author;

  v_scan := scan_content(v_text, NULLIF(v_country, ''));
  v_severity := v_scan ->> 'severity';

  IF v_severity IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.moderation_severity := v_severity;

  IF v_severity = 'low' THEN
    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'low', 'flagged', v_scan);

    PERFORM send_notification(
      v_author,
      'moderation_warning',
      'Community guidelines reminder',
      'Something you posted was flagged by our automated filter. Please review the community guidelines.',
      '/help'
    );

    RETURN NEW;
  END IF;

  -- medium and high are both withheld from view immediately.
  NEW.status := 'quarantined';
  NEW.quarantined_at := now();

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
  VALUES ('system', v_author, v_target, NEW.id, v_severity, 'quarantined', v_scan);

  -- Enters the same queue a human report would, so moderators triage one list.
  -- reporter_id = author is what marks the row as machine-generated.
  INSERT INTO content_reports (reporter_id, target_type, target_id, target_author_id, category, detail, content_snapshot, severity, status)
  VALUES (
    v_author,
    v_target,
    NEW.id,
    v_author,
    COALESCE((v_scan -> 'matches' -> 0 ->> 'category'), 'hate_harassment'),
    'Automatically flagged by the content filter.',
    left(v_text, 2000),
    v_severity,
    'open'
  )
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;

  IF v_severity = 'high' THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_suspended = TRUE,
        suspension_reason = 'Automated safety escalation pending review',
        updated_at = now()
    WHERE id = v_author;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'high', 'suspended', v_scan);

    PERFORM escalate_to_safety(v_author, v_target, NEW.id, v_severity);
  END IF;

  RETURN NEW;
END;
$$;

-- High-severity events reach the safety team AND, when the author is a
-- school-verified student, the staff of their institution. That second hop is
-- the safeguarding requirement — a school has to know.
CREATE OR REPLACE FUNCTION escalate_to_safety(
  p_user UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_severity TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
BEGIN
  FOR v_admin IN
    SELECT p.id FROM profiles p
    WHERE has_permission(p.id, 'moderation:escalate') AND p.id <> p_user
  LOOP
    PERFORM send_notification(
      v_admin.id,
      'moderation_escalation',
      'High-severity content flagged',
      'Automated moderation quarantined a ' || p_target_type || ' and suspended the author pending review.',
      '/admin/moderation'
    );
  END LOOP;

  FOR v_admin IN
    SELECT im.user_id FROM institution_members im
    JOIN student_safeguarding ss ON ss.institution_id = im.institution_id
    WHERE ss.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
  LOOP
    PERFORM send_notification(
      v_admin.user_id,
      'moderation_escalation',
      'Safety escalation for one of your students',
      'A student registered to your institution triggered a high-severity safety flag. The safety team has been notified.',
      '/institutions'
    );
  END LOOP;

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action)
  VALUES ('system', p_user, p_target_type, p_target_id, p_severity, 'escalated');
END;
$$;

DROP TRIGGER IF EXISTS moderate_forum_posts_trigger ON forum_posts;
CREATE TRIGGER moderate_forum_posts_trigger
  BEFORE INSERT ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_forum_replies_trigger ON forum_replies;
CREATE TRIGGER moderate_forum_replies_trigger
  BEFORE INSERT ON forum_replies
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_project_comments_trigger ON project_comments;
CREATE TRIGGER moderate_project_comments_trigger
  BEFORE INSERT ON project_comments
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'user_id');

DROP TRIGGER IF EXISTS moderate_messages_trigger ON messages;
CREATE TRIGGER moderate_messages_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'sender_id');

-- ============================================================
-- 6. Report-driven auto-quarantine
-- ============================================================

CREATE OR REPLACE FUNCTION set_content_status(
  p_target_type TEXT,
  p_target_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_type = 'forum_post' OR p_target_type = 'forum_posts' THEN
    UPDATE forum_posts SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'forum_reply' OR p_target_type = 'forum_replies' THEN
    UPDATE forum_replies SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'project_comment' OR p_target_type = 'project_comments' THEN
    UPDATE project_comments SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'message' OR p_target_type = 'messages' THEN
    UPDATE messages SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION apply_report_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings moderation_settings%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  IF NOT v_settings.auto_quarantine_enabled THEN
    RETURN NEW;
  END IF;

  -- Distinct reporters, not distinct reports: the UNIQUE constraint on
  -- (reporter, target) already makes those the same thing, but counting
  -- reporters states the intent.
  SELECT COUNT(DISTINCT cr.reporter_id) INTO v_count
  FROM content_reports cr
  WHERE cr.target_type = NEW.target_type
    AND cr.target_id = NEW.target_id
    AND cr.created_at > now() - make_interval(mins => v_settings.report_window_minutes);

  IF v_count >= v_settings.report_threshold THEN
    PERFORM set_content_status(NEW.target_type, NEW.target_id, 'quarantined');

    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('reporter', NEW.target_author_id, NEW.target_type, NEW.target_id, NEW.severity, 'quarantined',
            jsonb_build_object('reports', v_count, 'threshold', v_settings.report_threshold));

    IF NEW.category = 'grooming_risk' AND NEW.target_author_id IS NOT NULL THEN
      PERFORM escalate_to_safety(NEW.target_author_id, NEW.target_type, NEW.target_id, 'high');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_report_threshold_trigger ON content_reports;
CREATE TRIGGER apply_report_threshold_trigger
  AFTER INSERT ON content_reports
  FOR EACH ROW
  EXECUTE FUNCTION apply_report_threshold();

-- Admin action from the moderation queue.
CREATE OR REPLACE FUNCTION moderate_report(
  p_report UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_report content_reports%ROWTYPE;
BEGIN
  IF NOT has_permission(v_actor, 'moderation:action') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_action NOT IN ('restore', 'quarantine', 'remove', 'dismiss') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_action');
  END IF;

  SELECT * INTO v_report FROM content_reports WHERE id = p_report;
  IF v_report.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF p_action = 'restore' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'active');
  ELSIF p_action = 'quarantine' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'quarantined');
  ELSIF p_action = 'remove' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'removed');
  END IF;

  UPDATE content_reports
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
      admin_notes = COALESCE(p_notes, admin_notes),
      resolved_by = v_actor,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_report;

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, severity, action, detail)
  VALUES ('admin', v_actor, v_report.target_author_id, v_report.target_type, v_report.target_id, v_report.severity,
          CASE p_action
            WHEN 'restore' THEN 'restored'
            WHEN 'quarantine' THEN 'quarantined'
            WHEN 'remove' THEN 'removed'
            ELSE 'flagged'
          END,
          jsonb_build_object('report_id', p_report, 'notes', p_notes));

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION moderate_report(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moderate_report(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7. Visibility — these REPLACE the permissive policies
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view posts" ON forum_posts;
CREATE POLICY "Anyone can view posts"
  ON forum_posts FOR SELECT
  USING (
    status = 'active'
    OR author_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Anyone can view replies" ON forum_replies;
CREATE POLICY "Anyone can view replies"
  ON forum_replies FOR SELECT
  USING (
    status = 'active'
    OR author_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Comments on public projects are viewable" ON project_comments;
CREATE POLICY "Comments on public projects are viewable"
  ON project_comments FOR SELECT
  USING (
    (status = 'active' OR user_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON messages;
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    (status = 'active' OR sender_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );

-- Counts have to agree with what the policies show, the same way 045 patched
-- get_grant_application_count to stop counting drafts.
CREATE OR REPLACE FUNCTION get_board_post_count(board_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_posts WHERE board_id = board_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_post_reply_count(post_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_replies WHERE post_id = post_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_board_latest_post(board_uuid UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
  SELECT MAX(created_at) FROM forum_posts WHERE board_id = board_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_project_comment_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_comments WHERE project_id = project_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 8. Queue
-- ============================================================

-- security_invoker: the view must be filtered by the caller's RLS on
-- content_reports, not by the (superuser) view owner's.
CREATE OR REPLACE VIEW moderation_queue WITH (security_invoker = true) AS
SELECT
  cr.id,
  CASE WHEN cr.reporter_id = cr.target_author_id THEN 'automated' ELSE 'report' END AS source,
  cr.target_type,
  cr.target_id,
  cr.target_author_id,
  cr.category,
  cr.severity,
  cr.status,
  cr.content_snapshot,
  cr.created_at,
  (SELECT COUNT(*)::INTEGER FROM content_reports x
   WHERE x.target_type = cr.target_type AND x.target_id = cr.target_id) AS report_count
FROM content_reports cr;

-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reports" ON content_reports;
CREATE POLICY "Users can view their own reports"
  ON content_reports FOR SELECT
  USING (reporter_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Authenticated users can report content" ON content_reports;
CREATE POLICY "Authenticated users can report content"
  ON content_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND status = 'open');

DROP POLICY IF EXISTS "Moderators can triage reports" ON content_reports;
CREATE POLICY "Moderators can triage reports"
  ON content_reports FOR UPDATE
  USING (has_permission(auth.uid(), 'moderation:action'));

-- The term list is a map of what the filter looks for. Restricted to
-- moderators so it cannot be read for evasion.
DROP POLICY IF EXISTS "Moderators can view terms" ON moderation_terms;
CREATE POLICY "Moderators can view terms"
  ON moderation_terms FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Moderators can manage terms" ON moderation_terms;
CREATE POLICY "Moderators can manage terms"
  ON moderation_terms FOR ALL
  USING (has_permission(auth.uid(), 'moderation:action'))
  WITH CHECK (has_permission(auth.uid(), 'moderation:action'));

DROP POLICY IF EXISTS "Moderators can view settings" ON moderation_settings;
CREATE POLICY "Moderators can view settings"
  ON moderation_settings FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Moderators can change settings" ON moderation_settings;
CREATE POLICY "Moderators can change settings"
  ON moderation_settings FOR UPDATE
  USING (has_permission(auth.uid(), 'moderation:action'))
  WITH CHECK (has_permission(auth.uid(), 'moderation:action'));

DROP POLICY IF EXISTS "Auditors can view the moderation log" ON moderation_log;
CREATE POLICY "Auditors can view the moderation log"
  ON moderation_log FOR SELECT
  USING (has_permission(auth.uid(), 'audit:view') OR has_permission(auth.uid(), 'moderation:view'));

-- No write policies on moderation_log: it is written only by the SECURITY
-- DEFINER functions above.



-- ############################################################################
-- ## 066_achievements_engine.sql
-- ############################################################################

-- ============================================================
-- Migration 066: Gamification engine — points, ranks, tiers,
-- streaks, showcase, leaderboards, trophy artwork
--
-- Extends the badge system from 039 rather than replacing it.
-- 039's six award triggers stay: they fire instantly on the hot
-- paths so the unlock popup feels immediate. Everything else is
-- derived by the "pull" engine below.
--
-- WHY PULL INSTEAD OF PUSH
-- The alternative — one trigger per achievement — would mean ~40
-- triggers on a dozen hot tables, each of which has to be written,
-- backfilled and kept in sync with its definition. Instead
-- check_achievements_for() re-derives every count from tables that
-- already exist and awards anything whose threshold is met. That is:
--   idempotent   INSERT ... ON CONFLICT DO NOTHING, awards never repeat
--   self-healing a missed call is caught by the next one, or the
--                client's 2-minute fallback poll
--   retroactive  adding a definition in a later migration awards it
--                to everyone who already qualifies, with no backfill
--
-- SECURITY
-- Same posture as 039/046/051 and the personalization functions in
-- 061: derived tables have public SELECT and *no* client INSERT or
-- UPDATE policy, so nothing here is self-awardable. The client entry
-- point check_my_achievements() takes no user argument and derives
-- the caller from auth.uid(), so it cannot be used as an oracle to
-- read another member's activity. check_achievements_for(uuid) is
-- REVOKEd from clients precisely because it does take one.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. BADGE DEFINITION COLUMNS
-- Additive: the six rows seeded by 039 keep working on defaults
-- until 067 updates them in place.
-- ============================================================

ALTER TABLE badges ADD COLUMN IF NOT EXISTS category    TEXT NOT NULL DEFAULT 'community';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS rarity      TEXT NOT NULL DEFAULT 'common';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS points      INT  NOT NULL DEFAULT 10;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS tier        TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS tier_group  TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS check_key   TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS check_value INT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS is_hidden   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS sort_order  INT NOT NULL DEFAULT 0;
-- trophy_type + tier resolve to shared artwork in trophy_assets;
-- image_url is the per-badge override for one-off legendary art.
ALTER TABLE badges ADD COLUMN IF NOT EXISTS trophy_type TEXT;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS image_url   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'badges_rarity_check') THEN
    ALTER TABLE badges ADD CONSTRAINT badges_rarity_check
      CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'badges_tier_check') THEN
    ALTER TABLE badges ADD CONSTRAINT badges_tier_check
      CHECK (tier IS NULL OR tier IN ('bronze', 'silver', 'gold', 'diamond'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_badges_check_key ON badges(check_key) WHERE check_key IS NOT NULL;

-- Rarity is the single source of truth for points; nothing sets
-- points by hand. Kept as a function so 067 and the admin RPC agree.
CREATE OR REPLACE FUNCTION rarity_points(p_rarity TEXT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE p_rarity
    WHEN 'common'    THEN 10
    WHEN 'uncommon'  THEN 25
    WHEN 'rare'      THEN 50
    WHEN 'epic'      THEN 100
    WHEN 'legendary' THEN 200
    ELSE 10
  END;
$$;

-- ============================================================
-- 2. NEW TABLES
-- All read-public, none client-writable.
-- ============================================================

-- Themed sets ("complete all five project badges").
CREATE TABLE IF NOT EXISTS achievement_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'award',
  badge_slugs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per member per active day. This IS the streak tracker —
-- check_achievements_for() writes today's row on every call, so
-- streaks accrue from ordinary app use with no separate heartbeat
-- and no scheduled job.
CREATE TABLE IF NOT EXISTS user_activity_days (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_days_user
  ON user_activity_days(user_id, activity_date DESC);

-- Up to five trophies a member pins to their public profile.
CREATE TABLE IF NOT EXISTS user_showcase (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, position),
  UNIQUE (user_id, badge_id)
);

-- Signals the database cannot derive on its own (e.g. "opened the
-- leaderboard"). Written only through track_my_flag(), which
-- allowlists the keys.
CREATE TABLE IF NOT EXISTS user_flags (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  flag_value INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag_key)
);

-- Shared trophy artwork: ~13 types x 4 tiers, reused across every
-- badge. Uploading one gold rocket updates every gold project badge.
CREATE TABLE IF NOT EXISTS trophy_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
  image_url TEXT,
  -- A trophy is meaningful content, not decoration; alt text is not optional.
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, tier)
);

-- Leaderboard opt-out. Mirrors profiles.connection_count_visibility
-- from 049 — members already asked not to have network size exposed,
-- and a public score is the same class of thing.
-- guard_profile_privileged_columns() (063) guards by denylist, so
-- this column is self-editable without any change there.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS leaderboard_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_leaderboard_visibility_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_leaderboard_visibility_check
      CHECK (leaderboard_visibility IN ('public', 'private'));
  END IF;
END $$;

-- Monthly board sorts on award time across all members.
CREATE INDEX IF NOT EXISTS idx_user_badges_awarded_at ON user_badges(awarded_at DESC);

-- ============================================================
-- 3. RLS
-- Definitions and awards are public. Writes go through the
-- SECURITY DEFINER functions below, so there are deliberately no
-- INSERT/UPDATE/DELETE policies on any of these.
-- ============================================================

ALTER TABLE achievement_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_days      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_showcase           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophy_assets           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Collections are viewable by everyone" ON achievement_collections;
CREATE POLICY "Collections are viewable by everyone"
  ON achievement_collections FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Trophy assets are viewable by everyone" ON trophy_assets;
CREATE POLICY "Trophy assets are viewable by everyone"
  ON trophy_assets FOR SELECT USING (TRUE);

-- Showcase pins are shown on public profiles.
DROP POLICY IF EXISTS "Showcase is viewable by everyone" ON user_showcase;
CREATE POLICY "Showcase is viewable by everyone"
  ON user_showcase FOR SELECT USING (TRUE);

-- Activity days and flags are behavioural detail; own rows only.
DROP POLICY IF EXISTS "Members can view own activity days" ON user_activity_days;
CREATE POLICY "Members can view own activity days"
  ON user_activity_days FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can view own flags" ON user_flags;
CREATE POLICY "Members can view own flags"
  ON user_flags FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 4. TROPHY ARTWORK BUCKET
-- Follows 027_storage_buckets.sql, but gates writes on the 063
-- permission matrix rather than 027's hard-coded 'oecs' literal.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trophy-assets',
  'trophy-assets',
  TRUE,
  10485760, -- 10MB, matching the other image buckets
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view trophy assets" ON storage.objects;
CREATE POLICY "Anyone can view trophy assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trophy-assets');

DROP POLICY IF EXISTS "Admins can upload trophy assets" ON storage.objects;
CREATE POLICY "Admins can upload trophy assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can update trophy assets" ON storage.objects;
CREATE POLICY "Admins can update trophy assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can delete trophy assets" ON storage.objects;
CREATE POLICY "Admins can delete trophy assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 5. RANKS
-- Thresholds are on earned COUNT, not points: a member who has
-- collected many small achievements has engaged more broadly than
-- one who happened to unlock a single legendary.
-- ============================================================

CREATE OR REPLACE FUNCTION member_rank(p_earned INT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ranks CONSTANT JSONB := '[
    {"level": 1, "name": "Newcomer",         "required": 0},
    {"level": 2, "name": "Contributor",      "required": 5},
    {"level": 3, "name": "Collaborator",     "required": 12},
    {"level": 4, "name": "Innovator",        "required": 22},
    {"level": 5, "name": "Regional Builder", "required": 33},
    {"level": 6, "name": "Ecosystem Leader", "required": 45},
    {"level": 7, "name": "KTIP Champion",    "required": 55}
  ]'::JSONB;
  v_current JSONB;
  v_next JSONB;
  v_row JSONB;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_ranks) LOOP
    IF COALESCE(p_earned, 0) >= (v_row->>'required')::INT THEN
      v_current := v_row;
    ELSIF v_next IS NULL THEN
      v_next := v_row;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'level',     (v_current->>'level')::INT,
    'name',      v_current->>'name',
    'earned',    COALESCE(p_earned, 0),
    'next_name', v_next->>'name',
    -- NULL at max rank; the client renders "highest rank reached".
    'next_required', CASE WHEN v_next IS NULL THEN NULL ELSE (v_next->>'required')::INT END
  );
END;
$$;

-- ============================================================
-- 6. STREAK
-- Gaps-and-islands over user_activity_days. A streak stays alive
-- while the member was active today or yesterday — a run that ended
-- last week is history, not a current streak.
-- ============================================================

CREATE OR REPLACE FUNCTION current_streak(p_user UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last DATE;
  v_streak INT;
BEGIN
  SELECT MAX(activity_date) INTO v_last FROM user_activity_days WHERE user_id = p_user;

  IF v_last IS NULL OR v_last < CURRENT_DATE - 1 THEN
    RETURN 0;
  END IF;

  WITH islands AS (
    SELECT activity_date,
           activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date))::INT AS island
    FROM user_activity_days
    WHERE user_id = p_user
  )
  SELECT COUNT(*) INTO v_streak
  FROM islands
  WHERE island = (SELECT island FROM islands ORDER BY activity_date DESC LIMIT 1);

  RETURN COALESCE(v_streak, 0);
END;
$$;

-- ============================================================
-- 7. COUNT COLLECTOR
-- Every metric any achievement can key off, derived from tables
-- that already exist. This is the one function to extend when a new
-- kind of achievement is wanted.
--
-- Every count COALESCEs to 0 so a brand-new account returns a full
-- payload of zeros rather than erroring — the client calls this on
-- first paint.
--
-- Content removed by moderation is excluded: posting rubbish and
-- getting actioned must not leave points behind.
-- ============================================================

CREATE OR REPLACE FUNCTION achievement_counts(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
  v_flags JSONB;
BEGIN
  IF p_user IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  SELECT jsonb_build_object(
    -- ---------- Projects ----------
    'projects_created', (
      SELECT COUNT(*) FROM projects WHERE owner_id = p_user
    ),
    'projects_launched', (
      SELECT COUNT(*) FROM projects WHERE owner_id = p_user AND phase = 'launch'
    ),
    -- Self-likes excluded: the cheapest possible way to farm a badge.
    'project_likes_received', (
      SELECT COUNT(*) FROM project_likes pl
      JOIN projects p ON p.id = pl.project_id
      WHERE p.owner_id = p_user AND pl.user_id <> p_user
    ),
    -- Likes on the single best-performing project, kept separate from
    -- the lifetime total so 039's "one project reached 25 likes" rule
    -- keeps its exact meaning instead of quietly becoming easier.
    'top_project_likes', (
      SELECT COALESCE(MAX(cnt), 0) FROM (
        SELECT COUNT(*) AS cnt
        FROM project_likes pl
        JOIN projects p ON p.id = pl.project_id
        WHERE p.owner_id = p_user AND pl.user_id <> p_user
        GROUP BY pl.project_id
      ) t
    ),
    'project_followers', (
      SELECT COUNT(*) FROM project_follows pf
      JOIN projects p ON p.id = pf.project_id
      WHERE p.owner_id = p_user AND pf.user_id <> p_user
    ),
    'project_views', (
      SELECT COALESCE(SUM(COALESCE(view_count, 0)), 0) FROM projects WHERE owner_id = p_user
    ),
    'project_comments_made', (
      SELECT COUNT(*) FROM project_comments pc
      WHERE pc.user_id = p_user
        AND NOT EXISTS (
          SELECT 1 FROM content_reports cr
          WHERE cr.target_type = 'project_comment'
            AND cr.target_id = pc.id
            AND cr.status = 'actioned'
        )
    ),
    'project_collaborations', (
      SELECT COUNT(*) FROM project_members
      WHERE user_id = p_user AND status = 'accepted'
    ),

    -- ---------- Grants ----------
    'grant_applications', (
      SELECT COUNT(*) FROM grant_applications WHERE user_id = p_user
    ),
    'grants_approved', (
      SELECT COUNT(*) FROM grant_applications WHERE user_id = p_user AND status = 'approved'
    ),
    -- Faculty sponsoring a student application (064). Two-sided:
    -- the student earns on apply, the sponsor earns on sponsoring.
    'sponsorships_given', (
      SELECT COUNT(*) FROM grant_applications WHERE sponsor_id = p_user
    ),

    -- ---------- Events ----------
    'events_rsvpd', (
      SELECT COUNT(*) FROM event_rsvps WHERE user_id = p_user AND status <> 'cancelled'
    ),
    -- Turning up is worth more than signing up. 'checked_in' has been
    -- modelled since 007 and nothing has used it until now.
    'events_attended', (
      SELECT COUNT(*) FROM event_rsvps WHERE user_id = p_user AND status = 'checked_in'
    ),
    'events_organized', (
      SELECT COUNT(*) FROM events WHERE organizer_id = p_user
    ),

    -- ---------- Forums ----------
    'forum_posts', (
      SELECT COUNT(*) FROM forum_posts fp
      WHERE fp.author_id = p_user
        AND NOT EXISTS (
          SELECT 1 FROM content_reports cr
          WHERE cr.target_type = 'forum_post' AND cr.target_id = fp.id AND cr.status = 'actioned'
        )
    ),
    'forum_replies', (
      SELECT COUNT(*) FROM forum_replies fr
      WHERE fr.author_id = p_user
        AND NOT EXISTS (
          SELECT 1 FROM content_reports cr
          WHERE cr.target_type = 'forum_reply' AND cr.target_id = fr.id AND cr.status = 'actioned'
        )
    ),

    -- ---------- Network ----------
    'connections_accepted', (
      SELECT COUNT(*) FROM connections
      WHERE status = 'accepted' AND (requester_id = p_user OR addressee_id = p_user)
    ),
    'messages_sent', (
      SELECT COUNT(*) FROM messages WHERE sender_id = p_user
    ),
    'distinct_conversations', (
      SELECT COUNT(DISTINCT conversation_id) FROM conversation_participants WHERE user_id = p_user
    ),

    -- ---------- Collaborate ----------
    'documents_created',  (SELECT COUNT(*) FROM documents  WHERE owner_id = p_user),
    'whiteboards_created',(SELECT COUNT(*) FROM whiteboards WHERE owner_id = p_user),
    'snippets_created',   (SELECT COUNT(*) FROM snippets   WHERE owner_id = p_user),
    'collab_shares', (
      (SELECT COUNT(*) FROM document_shares  WHERE shared_by = p_user)
      + (SELECT COUNT(*) FROM whiteboard_shares WHERE shared_by = p_user)
      + (SELECT COUNT(*) FROM snippet_shares  WHERE shared_by = p_user)
    ),
    'resources_published', (
      SELECT COUNT(*) FROM resources WHERE author_id = p_user AND is_published = TRUE
    ),

    -- ---------- Profile ----------
    'is_verified', (
      SELECT CASE WHEN COALESCE(is_verified, FALSE) THEN 1 ELSE 0 END FROM profiles WHERE id = p_user
    ),
    -- All five fields filled. Deliberately strict: a half-filled
    -- profile is the thing this is meant to push members past.
    'profile_complete', (
      SELECT CASE WHEN COALESCE(NULLIF(TRIM(bio), ''), NULL) IS NOT NULL
                   AND COALESCE(NULLIF(TRIM(avatar_url), ''), NULL) IS NOT NULL
                   AND COALESCE(NULLIF(TRIM(country), ''), NULL) IS NOT NULL
                   AND COALESCE(array_length(skills, 1), 0) > 0
                   AND COALESCE(array_length(interests, 1), 0) > 0
             THEN 1 ELSE 0 END
      FROM profiles WHERE id = p_user
    ),
    'roles_held', (
      SELECT COALESCE(array_length(roles, 1), 0) FROM profiles WHERE id = p_user
    ),

    -- ---------- Dedication ----------
    'streak_days', current_streak(p_user),
    'total_active_days', (
      SELECT COUNT(*) FROM user_activity_days WHERE user_id = p_user
    )
  ) INTO v;

  -- Combined forum activity, matching 039's existing community_voice rule.
  v := v || jsonb_build_object(
    'forum_activity', (v->>'forum_posts')::INT + (v->>'forum_replies')::INT
  );

  -- Frontend-reported signals merge in last so a flag can shadow
  -- nothing above it by accident.
  SELECT COALESCE(jsonb_object_agg(flag_key, flag_value), '{}'::JSONB)
  INTO v_flags FROM user_flags WHERE user_id = p_user;

  RETURN v || v_flags;
END;
$$;

-- ============================================================
-- 8. THE CHECK
-- Takes a user id, so it is NOT granted to clients — see the
-- REVOKE below. check_my_achievements() is the client entry point.
--
-- p_notify FALSE is used by bulk/backfill passes so nobody wakes up
-- to thirty notifications at once (039 took the same care).
-- ============================================================

CREATE OR REPLACE FUNCTION check_achievements_for(p_user UUID, p_notify BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts JSONB;
  v_new JSONB := '[]'::JSONB;
  v_badge RECORD;
  v_points INT;
  v_earned_count INT;
  v_hidden_count INT;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('newly_earned', '[]'::JSONB);
  END IF;

  -- Any check marks today active. This is the whole streak mechanism:
  -- no heartbeat endpoint, no scheduled job.
  INSERT INTO user_activity_days (user_id, activity_date)
  VALUES (p_user, CURRENT_DATE)
  ON CONFLICT DO NOTHING;

  v_counts := achievement_counts(p_user);

  -- ---------- First pass: threshold achievements ----------
  FOR v_badge IN
    SELECT b.* FROM badges b
    WHERE b.check_key IS NOT NULL
      AND b.check_value IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id
      )
      AND COALESCE((v_counts->>b.check_key)::INT, 0) >= b.check_value
    ORDER BY b.sort_order, b.slug
  LOOP
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (p_user, v_badge.id)
    ON CONFLICT (user_id, badge_id) DO NOTHING;

    v_new := v_new || jsonb_build_object(
      'slug', v_badge.slug, 'name', v_badge.name, 'description', v_badge.description,
      'icon', v_badge.icon, 'color', v_badge.color, 'rarity', v_badge.rarity,
      'tier', v_badge.tier, 'points', v_badge.points, 'category', v_badge.category,
      'trophy_type', v_badge.trophy_type, 'image_url', v_badge.image_url
    );
  END LOOP;

  -- ---------- Second pass: meta achievements ----------
  -- Points- and count-threshold definitions are re-checked against
  -- the totals the first pass just produced, so "earn 500 points"
  -- fires in the same call that crossed 500 rather than one call late.
  SELECT COALESCE(SUM(b.points), 0), COUNT(*),
         COUNT(*) FILTER (WHERE b.is_hidden)
  INTO v_points, v_earned_count, v_hidden_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  v_counts := v_counts || jsonb_build_object(
    'total_points', v_points,
    'badges_earned', v_earned_count,
    'hidden_earned', v_hidden_count
  );

  FOR v_badge IN
    SELECT b.* FROM badges b
    WHERE b.check_key IN ('total_points', 'badges_earned', 'hidden_earned')
      AND b.check_value IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id
      )
      AND COALESCE((v_counts->>b.check_key)::INT, 0) >= b.check_value
    ORDER BY b.sort_order, b.slug
  LOOP
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (p_user, v_badge.id)
    ON CONFLICT (user_id, badge_id) DO NOTHING;

    v_new := v_new || jsonb_build_object(
      'slug', v_badge.slug, 'name', v_badge.name, 'description', v_badge.description,
      'icon', v_badge.icon, 'color', v_badge.color, 'rarity', v_badge.rarity,
      'tier', v_badge.tier, 'points', v_badge.points, 'category', v_badge.category,
      'trophy_type', v_badge.trophy_type, 'image_url', v_badge.image_url
    );
  END LOOP;

  -- Recompute after the second pass so the returned stats are final.
  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_earned_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  -- ---------- Notifications ----------
  IF p_notify AND jsonb_array_length(v_new) > 0 THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT p_user, 'badge_awarded',
           'Achievement unlocked: ' || (n->>'name'),
           n->>'description',
           '/achievements'
    FROM jsonb_array_elements(v_new) AS n;
  END IF;

  RETURN jsonb_build_object(
    'newly_earned', v_new,
    'stats', jsonb_build_object(
      'points', v_points,
      'earned', v_earned_count,
      'total_available', (SELECT COUNT(*) FROM badges),
      'streak_days', COALESCE((v_counts->>'streak_days')::INT, 0),
      'total_active_days', COALESCE((v_counts->>'total_active_days')::INT, 0),
      'rank', member_rank(v_earned_count),
      'by_category', (
        SELECT COALESCE(jsonb_object_agg(cat, cnt), '{}'::JSONB)
        FROM (
          SELECT b.category AS cat, COUNT(*) AS cnt
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
          WHERE ub.user_id = p_user
          GROUP BY b.category
        ) c
      )
    ),
    -- Progress toward everything not yet earned, so the gallery can
    -- render "7 / 10" bars without a second round trip. Hidden
    -- achievements are represented but not described.
    'progress', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', b.slug,
        'current', LEAST(COALESCE((v_counts->>b.check_key)::INT, 0), b.check_value),
        'target', b.check_value
      ) ORDER BY b.sort_order, b.slug), '[]'::JSONB)
      FROM badges b
      WHERE b.check_key IS NOT NULL AND b.check_value IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id
        )
    ),
    'collections', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'name', c.name, 'description', c.description, 'icon', c.icon,
        'total', COALESCE(array_length(c.badge_slugs, 1), 0),
        'earned', (
          SELECT COUNT(*) FROM user_badges ub
          JOIN badges b ON b.id = ub.badge_id
          WHERE ub.user_id = p_user AND b.slug = ANY(c.badge_slugs)
        )
      ) ORDER BY c.sort_order), '[]'::JSONB)
      FROM achievement_collections c
    )
  );
END;
$$;

-- Client entry point. No user argument by design: it cannot be
-- pointed at anyone else, so it is not an activity oracle.
CREATE OR REPLACE FUNCTION check_my_achievements()
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_achievements_for(auth.uid(), TRUE);
$$;

-- ============================================================
-- 9. LEADERBOARD
-- The engagement tables this reads are RLS-scoped to their owner,
-- so a client cannot aggregate them; these functions are the only
-- read path, exactly like get_connection_counts() in 049.
--
-- Exclusions, in order of importance:
--   students   safeguarding (064). A minor-facing persona is never
--              ranked publicly, and this is not admin-toggleable.
--   private    the member opted out.
--   suspended  an account under moderation is not showcased.
-- ============================================================

CREATE OR REPLACE FUNCTION get_leaderboard(
  p_scope TEXT DEFAULT 'global',
  p_value TEXT DEFAULT NULL,
  p_window TEXT DEFAULT 'all',
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  country TEXT,
  roles TEXT[],
  is_verified BOOLEAN,
  points BIGINT,
  badge_count BIGINT,
  level INT,
  rank_name TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.country,
      p.roles,
      p.is_verified,
      COALESCE(SUM(b.points) FILTER (WHERE w.included), 0) AS pts,
      COUNT(b.id)        FILTER (WHERE w.included)         AS cnt,
      -- All-time count drives the rank badge even on the monthly
      -- board: a level is a property of the member, not the window.
      COUNT(b.id)                                          AS lifetime_cnt,
      MIN(ub.awarded_at) FILTER (WHERE w.included)         AS first_award
    FROM profiles p
    LEFT JOIN user_badges ub ON ub.user_id = p.id
    LEFT JOIN badges b ON b.id = ub.badge_id
    LEFT JOIN LATERAL (
      SELECT (p_window <> 'month' OR ub.awarded_at >= date_trunc('month', now())) AS included
    ) w ON TRUE
    WHERE COALESCE(p.leaderboard_visibility, 'public') = 'public'
      AND COALESCE(p.is_suspended, FALSE) = FALSE
      AND NOT ('student' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
      AND (p_scope <> 'country' OR p.country = p_value)
      AND (p_scope <> 'role'    OR p_value = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
    GROUP BY p.id, p.display_name, p.avatar_url, p.country, p.roles, p.is_verified
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY s.pts DESC, s.first_award ASC NULLS LAST, s.id),
    s.id,
    s.display_name,
    s.avatar_url,
    s.country,
    s.roles,
    s.is_verified,
    s.pts,
    s.cnt,
    (member_rank(s.lifetime_cnt::INT)->>'level')::INT,
    member_rank(s.lifetime_cnt::INT)->>'name'
  FROM scored s
  -- Zero-point members are not "last place", they are simply not
  -- on the board yet.
  WHERE s.pts > 0
  ORDER BY s.pts DESC, s.first_award ASC NULLS LAST, s.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

-- Own standing, returned even when outside the top N and even when
-- opted out — you can always see yourself. Powers the sticky row.
CREATE OR REPLACE FUNCTION get_my_leaderboard_rank(
  p_scope TEXT DEFAULT 'global',
  p_value TEXT DEFAULT NULL,
  p_window TEXT DEFAULT 'all'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_points BIGINT;
  v_count BIGINT;
  v_rank BIGINT;
  v_total BIGINT;
  v_listed BOOLEAN;
BEGIN
  IF v_me IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_me
    AND (p_window <> 'month' OR ub.awarded_at >= date_trunc('month', now()));

  -- Counted against the whole eligible population, not against
  -- get_leaderboard()'s top-100 slice — otherwise everyone below
  -- 100th place would report rank 101.
  WITH scored AS (
    SELECT p.id, COALESCE(SUM(b.points), 0) AS pts
    FROM profiles p
    LEFT JOIN user_badges ub ON ub.user_id = p.id
      AND (p_window <> 'month' OR ub.awarded_at >= date_trunc('month', now()))
    LEFT JOIN badges b ON b.id = ub.badge_id
    WHERE COALESCE(p.leaderboard_visibility, 'public') = 'public'
      AND COALESCE(p.is_suspended, FALSE) = FALSE
      AND NOT ('student' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
      AND (p_scope <> 'country' OR p.country = p_value)
      AND (p_scope <> 'role'    OR p_value = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
    GROUP BY p.id
  )
  SELECT COUNT(*) FILTER (WHERE pts > v_points) + 1,
         COUNT(*) FILTER (WHERE pts > 0)
  INTO v_rank, v_total
  FROM scored;

  SELECT COALESCE(leaderboard_visibility, 'public') = 'public'
         AND COALESCE(is_suspended, FALSE) = FALSE
         AND NOT ('student' = ANY(COALESCE(roles, ARRAY[]::TEXT[])))
  INTO v_listed FROM profiles WHERE id = v_me;

  RETURN jsonb_build_object(
    'rank', v_rank,
    'points', v_points,
    'badge_count', v_count,
    'board_size', v_total,
    -- FALSE means "this is your score, but nobody else can see it".
    'listed', COALESCE(v_listed, FALSE)
  );
END;
$$;

-- ============================================================
-- 10. PUBLIC PROFILE STATS
-- Anonymous-readable: /u/:id must render for a signed-out visitor
-- following a shared link.
-- ============================================================

CREATE OR REPLACE FUNCTION get_profile_stats(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INT;
  v_count INT;
  v_suspended BOOLEAN;
BEGIN
  SELECT COALESCE(is_suspended, FALSE) INTO v_suspended FROM profiles WHERE id = p_user;
  IF v_suspended IS NULL OR v_suspended THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  RETURN jsonb_build_object(
    'user_id', p_user,
    'points', v_points,
    'badge_count', v_count,
    'rank', member_rank(v_count),
    -- Streak is shown on your own profile only; on someone else's it
    -- reads as surveillance rather than achievement.
    'streak_days', CASE WHEN auth.uid() = p_user THEN current_streak(p_user) ELSE NULL END,
    'showcase', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'position', us.position,
        'badge', to_jsonb(b)
      ) ORDER BY us.position), '[]'::JSONB)
      FROM user_showcase us JOIN badges b ON b.id = us.badge_id
      WHERE us.user_id = p_user
    )
  );
END;
$$;

-- Batch variant for the directory and leaderboard rows. 200-id cap
-- matches get_connection_counts() in 049.
CREATE OR REPLACE FUNCTION get_profile_stats_batch(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, points BIGINT, badge_count BIGINT, level INT, rank_name TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(SUM(b.points), 0),
    COUNT(b.id),
    (member_rank(COUNT(b.id)::INT)->>'level')::INT,
    member_rank(COUNT(b.id)::INT)->>'name'
  FROM profiles p
  LEFT JOIN user_badges ub ON ub.user_id = p.id
  LEFT JOIN badges b ON b.id = ub.badge_id
  WHERE p.id = ANY(p_user_ids[1:200])
    AND COALESCE(p.is_suspended, FALSE) = FALSE
  GROUP BY p.id;
$$;

-- ============================================================
-- 11. MEMBER WRITES
-- The only two things a member may change about their own
-- gamification state. Neither can award anything.
-- ============================================================

CREATE OR REPLACE FUNCTION set_my_showcase(p_badge_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM user_showcase WHERE user_id = v_me;

  -- Truncation is server-side; a client sending six ids gets five
  -- pins, not an error. Unearned badges are filtered out rather than
  -- rejected, so you cannot pin a trophy you have not won.
  INSERT INTO user_showcase (user_id, badge_id, position)
  SELECT v_me, x.badge_id, x.pos
  FROM (
    SELECT id AS badge_id, ROW_NUMBER() OVER () AS pos
    FROM unnest(p_badge_ids[1:5]) AS id
  ) x
  WHERE EXISTS (
    SELECT 1 FROM user_badges ub WHERE ub.user_id = v_me AND ub.badge_id = x.badge_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION track_my_flag(p_key TEXT, p_mode TEXT DEFAULT 'increment', p_value INT DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  -- Allowlisted so the flags table cannot become an arbitrary
  -- client-writable key-value store attached to achievements.
  v_allowed CONSTANT TEXT[] := ARRAY[
    'leaderboard_views', 'achievements_views', 'directory_views',
    'search_uses', 'ai_assistant_uses'
  ];
BEGIN
  IF v_me IS NULL OR NOT (p_key = ANY(v_allowed)) THEN
    RETURN;
  END IF;

  INSERT INTO user_flags (user_id, flag_key, flag_value, updated_at)
  VALUES (v_me, p_key, GREATEST(COALESCE(p_value, 1), 0), now())
  ON CONFLICT (user_id, flag_key) DO UPDATE
  SET flag_value = CASE
        WHEN p_mode = 'set' THEN GREATEST(COALESCE(p_value, 0), 0)
        ELSE user_flags.flag_value + GREATEST(COALESCE(p_value, 1), 0)
      END,
      updated_at = now();
END;
$$;

-- ============================================================
-- 12. ADMIN WRITES
-- Definitions and artwork are runtime-editable so a coordinator can
-- add a badge or swap trophy art without a deploy. The tables stay
-- client-write-free; these RPCs are the only door and they check the
-- 063 permission matrix.
--
-- NOTE: lowering a check_value awards more members on their next
-- check; RAISING ONE REVOKES NOTHING. Earned is permanent — nothing
-- in this engine ever deletes a user_badges row. The admin UI says so.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_upsert_badge(
  p_slug TEXT,
  p_name TEXT,
  p_description TEXT,
  p_icon TEXT,
  p_color TEXT,
  p_category TEXT,
  p_rarity TEXT,
  p_tier TEXT,
  p_tier_group TEXT,
  p_check_key TEXT,
  p_check_value INT,
  p_is_hidden BOOLEAN,
  p_sort_order INT,
  p_trophy_type TEXT,
  p_image_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO badges (
    slug, name, description, icon, color, category, rarity, points,
    tier, tier_group, check_key, check_value, is_hidden, sort_order,
    trophy_type, image_url
  )
  VALUES (
    p_slug, p_name, p_description, COALESCE(p_icon, 'award'), COALESCE(p_color, 'ocean'),
    COALESCE(p_category, 'community'), COALESCE(p_rarity, 'common'), rarity_points(p_rarity),
    p_tier, p_tier_group, p_check_key, p_check_value, COALESCE(p_is_hidden, FALSE),
    COALESCE(p_sort_order, 0), p_trophy_type, p_image_url
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
    color = EXCLUDED.color, category = EXCLUDED.category, rarity = EXCLUDED.rarity,
    points = EXCLUDED.points, tier = EXCLUDED.tier, tier_group = EXCLUDED.tier_group,
    check_key = EXCLUDED.check_key, check_value = EXCLUDED.check_value,
    is_hidden = EXCLUDED.is_hidden, sort_order = EXCLUDED.sort_order,
    trophy_type = EXCLUDED.trophy_type, image_url = EXCLUDED.image_url
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_upsert_trophy_asset(
  p_type TEXT,
  p_tier TEXT,
  p_image_url TEXT,
  p_alt_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO trophy_assets (type, tier, image_url, alt_text, updated_at)
  VALUES (p_type, p_tier, p_image_url, COALESCE(p_alt_text, ''), now())
  ON CONFLICT (type, tier) DO UPDATE
  SET image_url = EXCLUDED.image_url,
      alt_text = EXCLUDED.alt_text,
      updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- 13. GRANTS
-- Postgres grants EXECUTE to PUBLIC by default, so the functions
-- that take a user id must be revoked explicitly — otherwise
-- check_achievements_for(<anyone>) would be callable from the client
-- and the auth.uid() design above would be pointless.
-- ============================================================

REVOKE EXECUTE ON FUNCTION check_achievements_for(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION achievement_counts(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION current_streak(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION check_my_achievements() TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_showcase(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION track_my_flag(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_leaderboard_rank(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_upsert_badge(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN, INT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_upsert_trophy_asset(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Public surfaces: a shared /u/:id link and the leaderboard must
-- render for signed-out visitors.
GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, TEXT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_stats(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_stats_batch(UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION member_rank(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rarity_points(TEXT) TO anon, authenticated;

-- ============================================================
-- 14. NOTIFICATION CATEGORY
-- 036's enforce_notification_preferences() maps a notification type
-- to a preference column; 'badge_awarded' was never in the CASE, so
-- it fell to ELSE TRUE and could not be turned off. With points and
-- streaks now generating far more of them, give it a real toggle.
-- ============================================================

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS achievements BOOLEAN NOT NULL DEFAULT TRUE;

-- Verbatim copy of 036's mapping with one arm added. The existing
-- type strings are load-bearing — they are what live senders emit —
-- so nothing above 'badge_awarded' changes.
CREATE OR REPLACE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder', 'event_update') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    WHEN NEW.type IN ('badge_awarded') THEN achievements
    ELSE TRUE
  END
  INTO category_enabled
  FROM notification_preferences
  WHERE user_id = NEW.user_id;

  IF category_enabled = FALSE THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 039 links badge notifications at /profile/me, which has redirected
-- to the dashboard since the profile page was removed. The gallery is
-- the right destination now.
CREATE OR REPLACE FUNCTION award_badge(p_user_id UUID, p_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge badges%ROWTYPE;
  v_inserted UUID;
BEGIN
  SELECT * INTO v_badge FROM badges WHERE slug = p_slug;
  IF v_badge.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_badges (user_id, badge_id)
  VALUES (p_user_id, v_badge.id)
  ON CONFLICT (user_id, badge_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      p_user_id,
      'badge_awarded',
      'Achievement unlocked: ' || v_badge.name,
      v_badge.description,
      '/achievements'
    );
  END IF;
END;
$$;


-- ############################################################################
-- ## 067_achievement_definitions.sql
-- ############################################################################

-- ============================================================
-- Migration 067: Achievement definitions, collections, trophy slots
--
-- Data only — the engine lives in 066. Split deliberately: tuning a
-- threshold or adding a badge should never mean re-reading engine SQL,
-- and the admin screen writes the same rows through admin_upsert_badge().
--
-- Every INSERT is ON CONFLICT DO UPDATE, so re-running this file
-- re-syncs definitions to whatever is written here. That means it will
-- overwrite admin edits made through /admin/achievements — intentional,
-- this file is the source of truth for the shipped set.
--
-- The six badges seeded by 039 are updated in place rather than
-- replaced, so existing user_badges rows keep pointing at them.
-- Their meanings are preserved exactly: popular_project still means
-- "one project reached 25 likes" (top_project_likes), not a lifetime
-- total, and community_voice still counts posts + replies combined.
--
-- Points are never written by hand — rarity_points(rarity) derives
-- them, so the rarity/points relationship cannot drift.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. TROPHY SLOTS
-- 13 types x 4 tiers = 52 rows seeded with no image. The admin grid
-- renders one cell per row, so an empty grid is visibly complete
-- rather than looking broken, and each cell has somewhere to upload
-- into. Badges with no trophy_type fall back to the 'star' type.
-- ============================================================

INSERT INTO trophy_assets (type, tier, image_url, alt_text, sort_order)
SELECT t.type, tier.tier, NULL, '', t.ord
FROM (VALUES
  ('rocket',    1),  -- projects
  ('seedling',  2),  -- grants and funding
  ('podium',    3),  -- events
  ('megaphone', 4),  -- forums and community
  ('handshake', 5),  -- connections and messaging
  ('scroll',    6),  -- collaboration: docs, whiteboards, snippets
  ('compass',   7),  -- profile and onboarding
  ('flame',     8),  -- streaks and dedication
  ('beaker',    9),  -- research and published resources
  ('anchor',   10),  -- identity, verification, regional standing
  ('crown',    11),  -- points, rank, meta
  ('key',      12),  -- hidden achievements
  ('star',     13)   -- generic fallback for anything unmapped
) AS t(type, ord)
CROSS JOIN (VALUES ('bronze'), ('silver'), ('gold'), ('diamond')) AS tier(tier)
ON CONFLICT (type, tier) DO NOTHING;

-- ============================================================
-- 2. BADGE DEFINITIONS
--
-- Columns, in order:
--   slug, name, description, icon, color, category, rarity,
--   tier, tier_group, check_key, check_value, is_hidden,
--   sort_order, trophy_type
--
-- `color` maps to a pill style in AchievementBadge.tsx. 039 used
-- 'ocean' | 'tropical' | 'sand'; 'sun' is added here for the highest
-- tiers, and the component gains the matching entry. All four are
-- existing OECS primitives — no new colour is invented, and the
-- shades chosen respect the contrast rule in index.css (green and
-- yellow need 700+ to be legible as text on white).
-- ============================================================

INSERT INTO badges (
  slug, name, description, icon, color, category, rarity, points,
  tier, tier_group, check_key, check_value, is_hidden, sort_order, trophy_type
)
SELECT
  d.slug, d.name, d.description, d.icon, d.color, d.category, d.rarity,
  rarity_points(d.rarity),
  d.tier, d.tier_group, d.check_key, d.check_value, d.is_hidden, d.sort_order, d.trophy_type
FROM (VALUES
  -- ---------- Projects ----------
  ('first_project',      'Innovator',          'Created your first project',                          'rocket',         'ocean',    'projects', 'common',    'bronze',  'projects',      'projects_created',       1,   FALSE, 10,  'rocket'),
  ('project_builder',    'Project Builder',    'Created 5 projects',                                  'rocket',         'ocean',    'projects', 'uncommon',  'silver',  'projects',      'projects_created',       5,   FALSE, 11,  'rocket'),
  ('serial_innovator',   'Serial Innovator',   'Created 15 projects',                                 'rocket',         'ocean',    'projects', 'rare',      'gold',    'projects',      'projects_created',       15,  FALSE, 12,  'rocket'),
  ('project_luminary',   'Project Luminary',   'Created 40 projects',                                 'rocket',         'ocean',    'projects', 'epic',      'diamond', 'projects',      'projects_created',       40,  FALSE, 13,  'rocket'),
  ('first_spark',        'First Spark',        'Your projects earned their first 5 likes',            'heart',          'tropical', 'projects', 'common',    'bronze',  'project_likes', 'project_likes_received', 5,   FALSE, 14,  'rocket'),
  -- Unchanged rule from 039: 25 likes on a single project.
  ('popular_project',    'Crowd Favourite',    'One of your projects reached 25 likes',               'heart',          'tropical', 'projects', 'uncommon',  'silver',  'project_likes', 'top_project_likes',      25,  FALSE, 15,  'rocket'),
  ('viral_project',      'Runaway Success',    'One of your projects reached 100 likes',              'heart',          'tropical', 'projects', 'rare',      'gold',    'project_likes', 'top_project_likes',      100, FALSE, 16,  'rocket'),
  ('project_launched',   'Launch Day',         'Took a project all the way to launch',                'rocket',         'sand',     'projects', 'rare',      NULL,      NULL,            'projects_launched',      1,   FALSE, 17,  'rocket'),
  ('wide_reach',         'Wide Reach',         'Your projects have been viewed 1,000 times',          'eye',            'sand',     'projects', 'rare',      NULL,      NULL,            'project_views',          1000,FALSE, 18,  'rocket'),
  ('team_player',        'Team Player',        'Joined 3 project teams',                              'users',          'ocean',    'projects', 'uncommon',  NULL,      NULL,            'project_collaborations', 3,   FALSE, 19,  'rocket'),

  -- ---------- Grants and funding ----------
  ('first_application',  'First Ask',          'Submitted your first grant application',              'file-text',      'sand',     'grants',   'common',    'bronze',  'grants',        'grant_applications',     1,   FALSE, 20,  'seedling'),
  ('persistent_applicant','Persistent',        'Submitted 5 grant applications',                      'file-text',      'sand',     'grants',   'uncommon',  'silver',  'grants',        'grant_applications',     5,   FALSE, 21,  'seedling'),
  ('funded',             'Funded',             'Had a grant application approved',                    'wallet',         'tropical', 'grants',   'epic',      'gold',    'grants',        'grants_approved',        1,   FALSE, 22,  'seedling'),
  ('multi_funded',       'Multi-Funded',       'Had 3 grant applications approved',                   'wallet',         'tropical', 'grants',   'legendary', 'diamond', 'grants',        'grants_approved',        3,   FALSE, 23,  'seedling'),
  ('sponsor',            'Sponsor',            'Sponsored a student grant application',               'graduation-cap', 'ocean',    'grants',   'rare',      NULL,      NULL,            'sponsorships_given',     1,   FALSE, 24,  'seedling'),
  ('student_champion',   'Champion of Students','Sponsored 5 student grant applications',             'graduation-cap', 'ocean',    'grants',   'epic',      NULL,      NULL,            'sponsorships_given',     5,   FALSE, 25,  'seedling'),

  -- ---------- Events ----------
  ('event_goer',         'Event Goer',         'RSVP''d to your first event',                         'calendar',       'sand',     'events',   'common',    'bronze',  'events',        'events_rsvpd',           1,   FALSE, 30,  'podium'),
  ('regular_attendee',   'Regular',            'RSVP''d to 5 events',                                 'calendar',       'sand',     'events',   'uncommon',  'silver',  'events',        'events_rsvpd',           5,   FALSE, 31,  'podium'),
  -- Turning up counts for more than signing up.
  ('showed_up',          'Showed Up',          'Checked in at an event',                              'check-circle',   'tropical', 'events',   'uncommon',  NULL,      NULL,            'events_attended',        1,   FALSE, 32,  'podium'),
  ('front_row',          'Front Row',          'Checked in at 5 events',                              'check-circle',   'tropical', 'events',   'rare',      'gold',    'events',        'events_attended',        5,   FALSE, 33,  'podium'),
  ('event_host',         'Host',               'Organized an event',                                  'megaphone',      'ocean',    'events',   'rare',      NULL,      NULL,            'events_organized',       1,   FALSE, 34,  'podium'),
  ('convener',           'Convener',           'Organized 5 events',                                  'megaphone',      'ocean',    'events',   'epic',      'diamond', 'events',        'events_organized',       5,   FALSE, 35,  'podium'),

  -- ---------- Community ----------
  ('first_post',         'First Word',         'Made your first forum post or reply',                 'message-square', 'sand',     'community','common',    'bronze',  'forums',        'forum_activity',         1,   FALSE, 40,  'megaphone'),
  ('community_voice',    'Community Voice',    'Posted 10 times in the forums',                       'message-square', 'sand',     'community','uncommon',  'silver',  'forums',        'forum_activity',         10,  FALSE, 41,  'megaphone'),
  ('forum_pillar',       'Forum Pillar',       'Posted 50 times in the forums',                       'message-square', 'sand',     'community','rare',      'gold',    'forums',        'forum_activity',         50,  FALSE, 42,  'megaphone'),
  ('forum_legend',       'Forum Legend',       'Posted 200 times in the forums',                      'message-square', 'sand',     'community','epic',      'diamond', 'forums',        'forum_activity',         200, FALSE, 43,  'megaphone'),
  ('commentator',        'Commentator',        'Left 10 comments on projects',                        'message-circle', 'sand',     'community','uncommon',  NULL,      NULL,            'project_comments_made',  10,  FALSE, 44,  'megaphone'),

  -- ---------- Network ----------
  ('first_connection',   'Networker',          'Made your first connection',                          'users',          'ocean',    'network',  'common',    'bronze',  'network',       'connections_accepted',   1,   FALSE, 50,  'handshake'),
  ('well_connected',     'Well Connected',     'Made 10 connections',                                 'users',          'ocean',    'network',  'uncommon',  'silver',  'network',       'connections_accepted',   10,  FALSE, 51,  'handshake'),
  ('super_connector',    'Super Connector',    'Made 50 connections',                                 'users',          'ocean',    'network',  'rare',      'gold',    'network',       'connections_accepted',   50,  FALSE, 52,  'handshake'),
  ('conversationalist',  'Conversationalist',  'Sent 50 messages',                                    'send',           'ocean',    'network',  'uncommon',  NULL,      NULL,            'messages_sent',          50,  FALSE, 53,  'handshake'),
  ('open_line',          'Open Line',          'Held conversations with 10 different members',        'send',           'ocean',    'network',  'uncommon',  NULL,      NULL,            'distinct_conversations', 10,  FALSE, 54,  'handshake'),

  -- ---------- Collaboration ----------
  ('drafter',            'Drafter',            'Created your first document',                         'file-text',      'sand',     'collaboration','common',   'bronze','collaboration','documents_created',      1,   FALSE, 60,  'scroll'),
  ('whiteboarder',       'Whiteboarder',       'Created your first whiteboard',                       'pen-tool',       'sand',     'collaboration','common',   NULL,    NULL,           'whiteboards_created',    1,   FALSE, 61,  'scroll'),
  ('code_slinger',       'Code Slinger',       'Created your first code snippet',                     'code',           'sand',     'collaboration','common',   NULL,    NULL,           'snippets_created',       1,   FALSE, 62,  'scroll'),
  ('sharer',             'Sharer',             'Shared collaborative work 5 times',                   'share-2',        'tropical', 'collaboration','uncommon', 'silver','collaboration','collab_shares',          5,   FALSE, 63,  'scroll'),
  ('collab_hub',         'Collaboration Hub',  'Shared collaborative work 25 times',                  'share-2',        'tropical', 'collaboration','rare',     'gold',  'collaboration','collab_shares',          25,  FALSE, 64,  'scroll'),

  -- ---------- Knowledge ----------
  ('published',          'Published',          'Published a resource to the library',                 'book-open',      'ocean',    'knowledge','rare',      NULL,      NULL,            'resources_published',    1,   FALSE, 70,  'beaker'),
  ('prolific_author',    'Prolific Author',    'Published 10 resources to the library',               'book-open',      'ocean',    'knowledge','epic',      NULL,      NULL,            'resources_published',    10,  FALSE, 71,  'beaker'),

  -- ---------- Profile ----------
  ('verified_member',    'Verified Member',    'Completed identity verification',                     'shield-check',   'tropical', 'profile',  'uncommon',  NULL,      NULL,            'is_verified',            1,   FALSE, 80,  'anchor'),
  ('all_filled_in',      'All Filled In',      'Completed every part of your profile',                'user-check',     'ocean',    'profile',  'common',    NULL,      NULL,            'profile_complete',       1,   FALSE, 81,  'compass'),
  ('many_hats',          'Many Hats',          'Hold more than one role on the platform',             'layers',         'sand',     'profile',  'uncommon',  NULL,      NULL,            'roles_held',             2,   FALSE, 82,  'compass'),

  -- ---------- Dedication ----------
  ('streak_3',           'Warming Up',         'Active 3 days in a row',                              'flame',          'sand',     'dedication','common',   'bronze',  'streak',        'streak_days',            3,   FALSE, 90,  'flame'),
  ('streak_7',           'On a Roll',          'Active 7 days in a row',                              'flame',          'sand',     'dedication','uncommon', 'silver',  'streak',        'streak_days',            7,   FALSE, 91,  'flame'),
  ('streak_30',          'Unstoppable',        'Active 30 days in a row',                             'flame',          'sun',      'dedication','rare',     'gold',    'streak',        'streak_days',            30,  FALSE, 92,  'flame'),
  ('streak_100',         'Century',            'Active 100 days in a row',                            'flame',          'sun',      'dedication','legendary','diamond', 'streak',        'streak_days',            100, FALSE, 93,  'flame'),
  ('regular_visitor',    'Regular Visitor',    'Active on 30 separate days',                          'calendar-check', 'sand',     'dedication','uncommon', NULL,      NULL,            'total_active_days',      30,  FALSE, 94,  'flame'),

  -- ---------- Meta ----------
  -- These key off totals injected on the engine's second pass, so
  -- crossing a threshold fires in the same call, not the next one.
  ('points_100',         'Rising',             'Earned 100 achievement points',                       'trending-up',    'ocean',    'meta',     'uncommon',  'bronze',  'points',        'total_points',           100, FALSE, 100, 'crown'),
  ('points_500',         'Established',        'Earned 500 achievement points',                       'trending-up',    'ocean',    'meta',     'rare',      'silver',  'points',        'total_points',           500, FALSE, 101, 'crown'),
  ('points_1000',        'Distinguished',      'Earned 1,000 achievement points',                     'trending-up',    'sun',      'meta',     'epic',      'gold',    'points',        'total_points',           1000,FALSE, 102, 'crown'),
  ('collector',          'Collector',          'Earned 25 achievements',                              'award',          'sun',      'meta',     'epic',      'diamond', 'points',        'badges_earned',          25,  FALSE, 103, 'crown'),

  -- ---------- Hidden ----------
  -- Masked in the gallery until earned; the client shows only a count.
  ('curious',            'Curious',            'Opened the achievements gallery 10 times',            'eye',            'sand',     'hidden',   'common',    NULL,      NULL,            'achievements_views',     10,  TRUE,  110, 'key'),
  ('scoreboard_watcher', 'Scoreboard Watcher', 'Checked the leaderboard 10 times',                    'eye',            'sand',     'hidden',   'common',    NULL,      NULL,            'leaderboard_views',      10,  TRUE,  111, 'key'),
  ('explorer',           'Explorer',           'Browsed 20 member profiles',                          'compass',        'ocean',    'hidden',   'uncommon',  NULL,      NULL,            'directory_views',        20,  TRUE,  112, 'key'),
  ('secret_hunter',      'Secret Hunter',      'Found 3 hidden achievements',                         'key',            'sun',      'hidden',   'legendary', NULL,      NULL,            'hidden_earned',          3,   TRUE,  113, 'key')
) AS d(
  slug, name, description, icon, color, category, rarity,
  tier, tier_group, check_key, check_value, is_hidden, sort_order, trophy_type
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  color       = EXCLUDED.color,
  category    = EXCLUDED.category,
  rarity      = EXCLUDED.rarity,
  points      = EXCLUDED.points,
  tier        = EXCLUDED.tier,
  tier_group  = EXCLUDED.tier_group,
  check_key   = EXCLUDED.check_key,
  check_value = EXCLUDED.check_value,
  is_hidden   = EXCLUDED.is_hidden,
  sort_order  = EXCLUDED.sort_order,
  trophy_type = EXCLUDED.trophy_type;

-- ============================================================
-- 3. COLLECTIONS
-- Themed sets. Progress is computed by the engine from badge_slugs,
-- so a collection needs no schema of its own beyond the list.
-- ============================================================

INSERT INTO achievement_collections (slug, name, description, icon, badge_slugs, sort_order)
VALUES
  ('innovators_path', 'Innovator''s Path', 'Build and grow projects on KTIP', 'rocket',
   ARRAY['first_project','project_builder','serial_innovator','project_luminary','project_launched'], 1),
  ('funding_journey', 'Funding Journey', 'Apply for, win, and sponsor funding', 'wallet',
   ARRAY['first_application','persistent_applicant','funded','multi_funded','sponsor'], 2),
  ('event_circuit', 'Event Circuit', 'Attend and run events across the region', 'calendar',
   ARRAY['event_goer','regular_attendee','showed_up','front_row','event_host'], 3),
  ('community_builder', 'Community Builder', 'Show up for the conversation', 'message-square',
   ARRAY['first_post','community_voice','forum_pillar','forum_legend','commentator'], 4),
  ('the_connector', 'The Connector', 'Build a regional network', 'users',
   ARRAY['first_connection','well_connected','super_connector','conversationalist','open_line'], 5),
  ('co_creator', 'Co-Creator', 'Work with others in shared tools', 'share-2',
   ARRAY['drafter','whiteboarder','code_slinger','sharer','collab_hub'], 6),
  ('the_regular', 'The Regular', 'Keep coming back', 'flame',
   ARRAY['streak_3','streak_7','streak_30','streak_100','regular_visitor'], 7)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  badge_slugs = EXCLUDED.badge_slugs,
  sort_order  = EXCLUDED.sort_order;

-- ============================================================
-- 4. BACKFILL
--
-- The pull engine is retroactive, so a member's first check would
-- award everything they already qualify for anyway. Running it here
-- with p_notify = FALSE matters because of what it prevents: without
-- this pass, a long-standing member opens the app after deploy and
-- receives thirty notifications at once. 039 took the same care.
--
-- Suspended accounts are skipped — nothing about this should reach them.
-- ============================================================

DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT id FROM profiles WHERE COALESCE(is_suspended, FALSE) = FALSE
  LOOP
    -- One bad row must not abort the whole deploy; the member's next
    -- check picks them up regardless.
    BEGIN
      PERFORM check_achievements_for(v_user.id, FALSE);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'achievement backfill skipped for %: %', v_user.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- The backfill marks today active for every member it touches, which
-- would hand everyone a free day-one streak. Clear those rows: streaks
-- should start from real usage, not from the deploy.
DELETE FROM user_activity_days WHERE activity_date = CURRENT_DATE;


-- ############################################################################
-- ## 068_vc_sso.sql
-- ############################################################################

-- Migration 068: OECS Virtual Campus single sign-on
--
-- A learner on the OECS Virtual Campus (oecscampus.org / mypd.oecscampus.org)
-- presses "Go to KTIP" and arrives at
--
--   https://oecsinnovation.org/auth/vc/callback?vc_token=<jwt>
--
-- The JWT is ES256, signed by the key published at
-- https://oecscampus.org/api/auth/oidc/jwks (kid vc-oidc-1). Signature
-- verification happens in api/auth/vc/callback.ts — it is an edge concern, not
-- a database one. What lives here is everything that must not be expressible
-- from the client:
--
--   1. vc_identities      — which VC account maps to which KTIP account
--   2. vc_replay_guard    — a vc_token is single-use
--   3. vc_handoff_tickets — the Supabase session never travels in a URL
--   4. vc_provision_identity() — the only path that grants `student` from SSO
--
-- Why a bespoke provisioning function rather than the existing helpers:
--
--   * set_user_roles() checks has_permission(auth.uid(), 'role:manage'). The
--     service role has auth.uid() = NULL, so has_permission returns FALSE at
--     step 1 and the call would silently no-op. It cannot be reused here.
--   * review_institution_member() is the human-approval path and requires an
--     actor. SSO has no actor — the VC's signature IS the approval.
--
-- So this follows review_institution_member's *shape* (SECURITY DEFINER +
-- ktip.bypass_profile_guard) without its authorisation model, and it is granted
-- to service_role ONLY. An authenticated user must never be able to call it:
-- it would be a self-service `student` grant, and `student` carries the
-- safeguarding denials that the rest of the platform relies on.
--
-- Note on the student role: it is deliberately restrictive, not a privilege.
-- has_permission() hard-denies dm:initiate, grant:apply, grant:manage_funds,
-- moderation:action and moderation:escalate for anyone holding it, above the
-- matrix. Granting it to a verified minor arriving from a school LMS is the
-- correct and intended outcome.
--
-- Idempotent — safe to re-run. Requires 063 and 064.

-- ============================================================
-- 1. Identity link
-- ============================================================

CREATE TABLE IF NOT EXISTS vc_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Issuer is part of the key, not decoration: `sub` is only unique within an
  -- issuer, and a second OECS property could later mint tokens of its own.
  issuer TEXT NOT NULL,
  vc_sub TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT,
  -- The full verified claim set, kept verbatim. The VC's exact claim names are
  -- not contractually fixed, so the mapper in api/_lib/vc-oidc.ts reads through
  -- an alias table and this column is what lets that table be corrected from
  -- real traffic instead of guesswork. Never contains the raw JWT.
  raw_claims JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, vc_sub)
);

CREATE INDEX IF NOT EXISTS idx_vc_identities_user ON vc_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_vc_identities_email ON vc_identities(lower(email));

ALTER TABLE vc_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own VC link" ON vc_identities;
CREATE POLICY "Owner can view own VC link"
  ON vc_identities FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy on purpose. Every write is service_role, from
-- the callback route. A user who could edit this row could point somebody
-- else's VC account at their own KTIP account.

-- ============================================================
-- 2. Replay guard
-- ============================================================

-- A handoff token is bearer credential in a URL: it lands in browser history,
-- and on a shared machine that is enough to sign in again. Single-use closes
-- that. Keyed on jti when the token carries one, otherwise on a hash of the
-- token itself (see api/_lib/vc-oidc.ts).
CREATE TABLE IF NOT EXISTS vc_replay_guard (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_replay_expires ON vc_replay_guard(expires_at);

ALTER TABLE vc_replay_guard ENABLE ROW LEVEL SECURITY;
-- Zero policies: service_role only, same reasoning as auth_rate_limits (056).

-- Claims a jti. Returns TRUE on first use, FALSE if it has been seen.
-- The INSERT ... ON CONFLICT DO NOTHING is the whole mechanism: two concurrent
-- replays of the same token race on the primary key and exactly one wins.
CREATE OR REPLACE FUNCTION vc_claim_jti(p_jti TEXT, p_expires_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
BEGIN
  -- Opportunistic housekeeping; this project has no pg_cron.
  IF random() < 0.02 THEN
    DELETE FROM vc_replay_guard WHERE expires_at < now() - interval '1 day';
  END IF;

  INSERT INTO vc_replay_guard (jti, expires_at)
  VALUES (p_jti, p_expires_at)
  ON CONFLICT (jti) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

REVOKE ALL ON FUNCTION vc_claim_jti(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_claim_jti(TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_claim_jti(TEXT, TIMESTAMPTZ) TO service_role;

-- ============================================================
-- 3. Handoff tickets
-- ============================================================

-- The callback runs server-side and ends up holding a real Supabase session,
-- but supabase-js keeps its session in localStorage, so the browser has to
-- install it. Passing the tokens through the URL (query or fragment) would put
-- a live session in history. Instead the callback stores the pair here and
-- redirects with a short opaque ticket, which the SPA exchanges once over POST.
--
-- Only the SHA-256 of the ticket is stored, so a database leak does not hand
-- over usable sessions — same posture as auth_rate_limits' hashed buckets.
-- The same one-shot mechanism also carries the PKCE code_verifier for the
-- KTIP-initiated flow (api/auth/vc/start.ts), which is why user_id is nullable:
-- at the moment a sign-in *starts* there is no user yet. Both uses want exactly
-- the same properties — short-lived, hashed key, redeemable once — so they share
-- one table rather than duplicating the redemption logic.
CREATE TABLE IF NOT EXISTS vc_handoff_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_tickets_expires ON vc_handoff_tickets(expires_at);

ALTER TABLE vc_handoff_tickets ENABLE ROW LEVEL SECURITY;
-- Zero policies: service_role only.

-- Redeems a ticket. Single statement so the "mark consumed" and the "return
-- payload" cannot be separated by a concurrent second redemption — the UPDATE
-- takes the row lock, and the WHERE clause is what makes it one-shot.
CREATE OR REPLACE FUNCTION vc_claim_handoff_ticket(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF random() < 0.05 THEN
    DELETE FROM vc_handoff_tickets WHERE expires_at < now() - interval '1 hour';
  END IF;

  UPDATE vc_handoff_tickets
  SET consumed_at = now()
  WHERE token_hash = p_token_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING payload INTO v_payload;

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION vc_claim_handoff_ticket(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_claim_handoff_ticket(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_claim_handoff_ticket(TEXT) TO service_role;

-- ============================================================
-- 4. Email resolution across primary + verified alias
-- ============================================================

-- resolve_email_alias() (056) covers only the alias half and is shaped around
-- the password-login flow. SSO needs the plain question: "does any account own
-- this address?" — checking auth.users first, because a primary always beats an
-- alias (the same precedence primary_conflict encodes in 056).
--
-- service_role ONLY. Exposing this to authenticated would be an email
-- enumeration oracle over the whole user table.
CREATE OR REPLACE FUNCTION vc_resolve_user_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object('user_id', u.id, 'matched', 'primary')
      FROM auth.users u
      WHERE lower(u.email) = lower(p_email)
      LIMIT 1
    ),
    (
      -- Unverified aliases are ignored: an unverified alias is a claim, not a
      -- fact, and linking on one would let anyone attach an address they do not
      -- control and then have SSO hand them that account.
      SELECT jsonb_build_object('user_id', a.user_id, 'matched', 'alias')
      FROM user_email_aliases a
      WHERE lower(a.email) = lower(p_email)
        AND a.verified_at IS NOT NULL
      LIMIT 1
    ),
    jsonb_build_object('user_id', NULL, 'matched', 'none')
  );
$$;

REVOKE ALL ON FUNCTION vc_resolve_user_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_resolve_user_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_resolve_user_by_email(TEXT) TO service_role;

-- ============================================================
-- 5. The Virtual Campus as an institution
-- ============================================================

-- email_domains stays EMPTY, and that is deliberate. VC learners sign up with
-- whatever address they have — school, ministry, gmail — so there is no domain
-- that identifies them. Trust here comes from the ES256 signature on the
-- handoff token, not from the right-hand side of an email address. Leaving the
-- array empty also keeps request_student_verification() from matching this row
-- and handing out self-service student membership.
INSERT INTO institutions (slug, name, kind, country_code, website_url, contact_email, status, verified_at, verified_by, review_note)
SELECT
  'oecs-virtual-campus',
  'OECS Virtual Campus',
  'university',
  'LC',
  'https://oecscampus.org',
  NULL,
  -- The institutions_verified_has_evidence CHECK requires both verified_at and
  -- verified_by on a verified row. On a fresh database with no admin seeded yet
  -- there is nobody to name, so the row lands as 'pending' with instructions
  -- rather than failing the migration. An admin verifying it in
  -- /admin/institutions is all that is then needed.
  CASE WHEN a.admin_id IS NULL THEN 'pending' ELSE 'verified' END,
  CASE WHEN a.admin_id IS NULL THEN NULL ELSE now() END,
  a.admin_id,
  CASE WHEN a.admin_id IS NULL
    THEN 'Seeded by migration 068. No platform admin existed at migration time, so this row could not satisfy institutions_verified_has_evidence. Verify it before enabling Virtual Campus SSO — vc_provision_identity() will not grant the student role while it is pending.'
    ELSE 'Seeded and auto-verified by migration 068 (OECS Virtual Campus SSO).'
  END
-- Scalar subquery, so this always produces exactly one row to insert even when
-- no admin exists yet. A plain FROM over profiles would produce zero rows and
-- silently skip the seed on a fresh database.
FROM (
  SELECT (
    SELECT p.id
    FROM profiles p
    WHERE 'super_admin' = ANY(p.roles) OR 'oecs' = ANY(p.roles)
    ORDER BY p.created_at
    LIMIT 1
  ) AS admin_id
) a
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 6. SSO provisioning
-- ============================================================

-- Called by api/auth/vc/callback.ts once the token signature, issuer, audience,
-- expiry, replay status and email_verified flag have all passed. The auth user
-- already exists at this point — the edge function either resolved it via
-- vc_resolve_user_by_email or created it with the admin API — so this function
-- is purely about linking and role state.
--
-- Everything it does is idempotent: the same learner pressing the button twice
-- a minute apart must end up in exactly the state they were already in.
CREATE OR REPLACE FUNCTION vc_provision_identity(
  p_user UUID,
  p_issuer TEXT,
  p_vc_sub TEXT,
  p_email TEXT,
  p_claims JSONB DEFAULT '{}'::jsonb,
  p_birth_year INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution UUID;
  v_inst_status TEXT;
  v_existing UUID;
  v_granted BOOLEAN := FALSE;
BEGIN
  IF p_user IS NULL OR p_vc_sub IS NULL OR p_issuer IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'missing_arguments');
  END IF;

  -- A VC subject that already points somewhere else is a conflict, not an
  -- update. Silently repointing it would move a learner's identity onto
  -- whichever account the current token happened to resolve to.
  SELECT user_id INTO v_existing
  FROM vc_identities
  WHERE issuer = p_issuer AND vc_sub = p_vc_sub;

  IF v_existing IS NOT NULL AND v_existing <> p_user THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'subject_bound_elsewhere');
  END IF;

  INSERT INTO vc_identities (issuer, vc_sub, user_id, email, raw_claims)
  VALUES (p_issuer, p_vc_sub, p_user, lower(p_email), COALESCE(p_claims, '{}'::jsonb))
  ON CONFLICT (issuer, vc_sub) DO UPDATE
    SET email = EXCLUDED.email,
        raw_claims = EXCLUDED.raw_claims,
        last_seen_at = now();

  SELECT id, status INTO v_institution, v_inst_status
  FROM institutions
  WHERE slug = 'oecs-virtual-campus';

  -- An unverified institution grants nothing. This is the kill switch: an
  -- operator who suspects the VC integration can set the row back to 'pending'
  -- and new arrivals immediately stop receiving the student role, without a
  -- deploy.
  IF v_institution IS NOT NULL AND v_inst_status = 'verified' THEN
    INSERT INTO institution_members (institution_id, user_id, role, status, approved_at)
    VALUES (v_institution, p_user, 'student', 'approved', now())
    ON CONFLICT (institution_id, user_id) DO UPDATE
      SET status = 'approved',
          approved_at = COALESCE(institution_members.approved_at, now());

    INSERT INTO student_safeguarding (user_id, institution_id, birth_year)
    VALUES (p_user, v_institution, p_birth_year)
    ON CONFLICT (user_id) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          -- Never overwrite a known birth year with NULL: a later token that
          -- omits the claim must not silently un-flag a minor.
          birth_year = COALESCE(EXCLUDED.birth_year, student_safeguarding.birth_year),
          updated_at = now();

    -- Additive, exactly like review_institution_member. A learner who is also
    -- an entrepreneur keeps that role; `student` is layered on top, and
    -- has_permission() treats the combination as a student regardless.
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET roles = CASE WHEN 'student' = ANY(roles) THEN roles ELSE array_append(roles, 'student') END,
        updated_at = now()
    WHERE id = p_user;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    v_granted := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'institution_id', v_institution,
    'institution_status', v_inst_status,
    'student_granted', v_granted
  );
END;
$$;

REVOKE ALL ON FUNCTION vc_provision_identity(UUID, TEXT, TEXT, TEXT, JSONB, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc_provision_identity(UUID, TEXT, TEXT, TEXT, JSONB, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION vc_provision_identity(UUID, TEXT, TEXT, TEXT, JSONB, INT) TO service_role;

-- Read-side helper for /api/vc/sync: the caller proves who they are with their
-- own JWT, and this returns their VC link so the sync route knows which email
-- to ask MyPD about. Safe for authenticated because it is scoped to auth.uid().
CREATE OR REPLACE FUNCTION vc_my_identity()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'issuer', v.issuer,
    'vc_sub', v.vc_sub,
    'email', v.email,
    'linked_at', v.linked_at,
    'last_seen_at', v.last_seen_at
  )
  FROM vc_identities v
  WHERE v.user_id = auth.uid()
  ORDER BY v.last_seen_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION vc_my_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc_my_identity() TO authenticated, service_role;


-- ############################################################################
-- ## 069_resumes.sql
-- ############################################################################

-- Migration 069: CV / résumé documents
--
-- KTIP had no CV concept at all. A member's evidence of work was scattered
-- across profiles.skills, achievements, projects and — for anyone arriving from
-- the Virtual Campus — a course history that lived entirely on another domain.
-- None of it could be handed to an employer.
--
-- One row per user per template. The document itself is a JSONB blob rather
-- than six normalised tables, for one reason: the renderer is a port of an
-- existing résumé template whose section shapes (Role, Education, SkillGroup)
-- are already settled. Storing that shape verbatim means the components need no
-- mapping layer, and adding a second template later is a new `template` value
-- rather than a schema migration.
--
-- The interesting column is `sources`.
--
-- The Virtual Campus sync is re-runnable — a learner finishes a course, presses
-- "Sync", and the new course should appear. But by then they may have rewritten
-- their own summary, reordered their experience, or deleted a course they do
-- not want on this CV. A blind overwrite would destroy that work, and a
-- never-overwrite rule would make sync useless after the first run.
--
-- `sources` maps a dot-path in `data` to the authority that last wrote it:
--
--   {"profile.name": "vc", "profile.about": "manual", "courses": "vc"}
--
-- Sync writes a path only when its source is 'vc' or absent. The moment a user
-- edits a field the editor stamps 'manual' and sync stops touching it. That one
-- rule is what makes the button safe to press repeatedly, and it is enforced in
-- api/_lib/cv-build.ts rather than here because it is a merge policy, not an
-- integrity constraint.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Keyed to the renderer in src/lib/resume-templates.ts. Constrained loosely
  -- on purpose: a new template ships as a client-side registry entry, and a
  -- CHECK here would mean a migration for every design.
  template TEXT NOT NULL DEFAULT 'viridion',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Off by default. A CV holds more personal detail than a profile does, and a
  -- learner arriving through SSO never chose to publish anything.
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  vc_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template)
);

CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_public ON resumes(user_id) WHERE is_public;

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- Ownership rules mirror profiles (post-063): USING *and* WITH CHECK on every
-- write policy. 063 exists because a missing WITH CHECK on profiles let a user
-- rewrite a column they should not have been able to reach; the same omission
-- here would let a user move their row onto somebody else's user_id.

DROP POLICY IF EXISTS "Owners can view their own resume" ON resumes;
CREATE POLICY "Owners can view their own resume"
  ON resumes FOR SELECT
  USING (auth.uid() = user_id);

-- A suspended account must not keep serving a public document, so the public
-- read is gated on 063's is_suspended() rather than on is_public alone — same
-- predicate the leaderboard and directory use, not a second copy of the rule.
DROP POLICY IF EXISTS "Public resumes are viewable by everyone" ON resumes;
CREATE POLICY "Public resumes are viewable by everyone"
  ON resumes FOR SELECT
  USING (is_public = TRUE AND NOT is_suspended(user_id));

DROP POLICY IF EXISTS "Users can create their own resume" ON resumes;
CREATE POLICY "Users can create their own resume"
  ON resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own resume" ON resumes;
CREATE POLICY "Users can update their own resume"
  ON resumes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own resume" ON resumes;
CREATE POLICY "Users can delete their own resume"
  ON resumes FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION touch_resume_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_resume_updated_at_trigger ON resumes;
CREATE TRIGGER touch_resume_updated_at_trigger
  BEFORE UPDATE ON resumes
  FOR EACH ROW
  EXECUTE FUNCTION touch_resume_updated_at();

-- Used by /u/:id/cv. A public résumé has to open for a signed-out visitor, and
-- doing that through a function keeps the anon path a single round trip that
-- returns nothing at all when the document is private.
CREATE OR REPLACE FUNCTION public_resume(p_user UUID, p_template TEXT DEFAULT 'viridion')
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', r.template,
    'data', r.data,
    'updated_at', r.updated_at,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )
  FROM resumes r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user
    AND r.template = p_template
    AND r.is_public = TRUE
    AND NOT is_suspended(r.user_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public_resume(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resume(UUID, TEXT) TO anon, authenticated, service_role;


NOTIFY pgrst, 'reload schema';


COMMIT;
