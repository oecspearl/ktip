-- ============================================================
-- Migration 139: verification actually gates something
--
-- Reported on / before go-live: "we need a verification step before this goes
-- live... before users get full access".
--
-- The workflow itself has existed since 035 — members submit documents, admins
-- approve, profiles.is_verified flips. What was never built is the consequence.
-- Grep every reader of is_verified before this migration and you find a badge
-- on the dashboard, a badge on the public profile, a column in the admin user
-- table and a trophy requirement. It is not read by any RLS policy, by
-- has_permission(), or by any route guard. An unverified member had exactly the
-- access a verified one had.
--
-- THE GATE LIVES IN has_permission(), NOT IN THE POLICIES.
--
-- Every INSERT policy worth gating already routes through has_permission() —
-- that is how suspension works (064's note: "has_permission() denies everything
-- to a suspended account, so every policy that routes through it already
-- handles suspension"). Adding `AND is_verified(...)` to a dozen policies would
-- be a dozen places to forget. One denial inside the function covers the
-- policies, has_permission_as(), and get_my_permissions() — which is what the
-- client reads, so the UI stops offering what the database would refuse.
--
-- WHAT IS GATED: publishing and applying. Reading is untouched by design. An
-- unverified member signs in, completes their profile, and browses funding,
-- projects, events, resources and the directory. They cannot publish into the
-- platform or apply for money until a human has approved them.
--
-- WHO IS EXEMPT: the admin seats, and only for bootstrap. Somebody has to be
-- able to approve the first verification request, and on a fresh platform that
-- somebody is unverified too. Note that verification:review is NOT in the gated
-- list either way — reviewing the queue was never a publishing act.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The gated set, as data
-- ------------------------------------------------------------
-- A table rather than an IN list inside the function: /admin/roles will
-- eventually want to show which keys carry the gate, and a list buried in a
-- plpgsql body cannot be read from the client. Mirrored in
-- VERIFICATION_GATED_PERMISSIONS (src/lib/permissions.ts).
CREATE TABLE IF NOT EXISTS verification_gated_permissions (
  permission_key TEXT PRIMARY KEY REFERENCES permission_definitions(key) ON DELETE CASCADE
);

COMMENT ON TABLE verification_gated_permissions IS
  'Permissions withheld until profiles.is_verified. Publishing and applying only — never reading.';

ALTER TABLE verification_gated_permissions ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in: the UI explains the gate, so it has to know
-- what the gate covers. Writable by nobody through the API — the set changes
-- by migration, not by an admin clicking.
DROP POLICY IF EXISTS "Members can read the gated set" ON verification_gated_permissions;
CREATE POLICY "Members can read the gated set"
  ON verification_gated_permissions FOR SELECT TO authenticated
  USING (TRUE);

INSERT INTO verification_gated_permissions (permission_key)
VALUES
  ('grant:post'),
  ('grant:apply'),
  ('grant:sponsor'),
  ('project:create'),
  ('event:create'),
  ('forum:post'),
  ('forum:board'),
  ('forum:comment'),
  ('resource:submit'),
  ('mentorship:offer'),
  ('dm:initiate')
ON CONFLICT (permission_key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Is this account past the gate?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_verified_member(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
  v_verified BOOLEAN;
BEGIN
  IF p_user IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT p.roles, COALESCE(p.is_verified, FALSE)
    INTO v_roles, v_verified
  FROM profiles p WHERE p.id = p_user;

  IF v_roles IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Bootstrap: staff seats are not held behind a queue they are the only ones
  -- who can work. Deliberately the raw roles array and not expand_roles() —
  -- an alias must not become a way around the gate.
  IF v_roles && ARRAY['oecs', 'admin', 'super_admin']::TEXT[] THEN
    RETURN TRUE;
  END IF;

  RETURN v_verified;
END;
$$;

COMMENT ON FUNCTION is_verified_member(UUID) IS
  'TRUE if this account may publish and apply: verified by an admin, or holding an admin seat.';

-- ------------------------------------------------------------
-- 3. has_permission() with the gate
-- ------------------------------------------------------------
-- 110's body verbatim, with one block added after the suspension check and
-- before the safeguarding denials. Restated in full rather than as a delta
-- because CREATE OR REPLACE takes the whole body and 110 is the definition
-- this is built on; a partial restatement would drop the student safeguards.
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

  -- 139. Publishing and applying wait for a human to approve the account.
  -- Reading, receiving and administering are untouched.
  IF NOT is_verified_member(p_user)
     AND EXISTS (
       SELECT 1 FROM verification_gated_permissions v
       WHERE v.permission_key = p_permission
     ) THEN
    RETURN FALSE;
  END IF;

  -- Safeguarding. Hard-coded on purpose: this must survive an admin toggling
  -- the matrix, a bad seed, and a direct UPDATE on role_permissions. A student
  -- who also holds an adult role is still treated as a student.
  --
  -- grant:apply was on this list until 110. Students now submit their own
  -- applications; what is still denied is unmonitored messaging and the
  -- administration of money.
  IF 'student' = ANY(v_roles) AND p_permission IN (
    'dm:initiate',
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

-- ------------------------------------------------------------
-- 4. The client needs to know WHY a key is missing
-- ------------------------------------------------------------
-- get_my_permissions() returns what you hold. Once the gate bites, a member
-- who holds grant:apply through their role sees it absent and has no way to
-- tell that from never having had it. This says which of the two it is.
CREATE OR REPLACE FUNCTION get_my_verification_state()
RETURNS TABLE (verified BOOLEAN, gated_keys TEXT[])
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_verified_member(auth.uid()),
    COALESCE(ARRAY(
      SELECT v.permission_key FROM verification_gated_permissions v ORDER BY v.permission_key
    ), ARRAY[]::TEXT[]);
$$;

REVOKE ALL ON FUNCTION get_my_verification_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_verification_state() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- an unverified member holds none of the gated keys
--   SELECT has_permission('<unverified uuid>', 'grant:apply');   -- f
--   SELECT has_permission('<unverified uuid>', 'grant:view');    -- t
--
--   -- approving them restores every one of them
--   UPDATE profiles SET is_verified = TRUE WHERE id = '<uuid>';
--   SELECT has_permission('<uuid>', 'grant:apply');              -- t
--
--   -- staff are never stranded behind their own queue
--   SELECT is_verified_member('<admin uuid>');                   -- t
--
--   -- the gate is eleven keys, and reading is not one of them
--   SELECT count(*) FROM verification_gated_permissions;         -- 11
-- ============================================================
