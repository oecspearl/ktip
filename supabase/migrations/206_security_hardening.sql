-- ============================================================================
-- 206_security_hardening.sql — the 2026-11-10 security pass, database side
-- ============================================================================
--
-- Five changes, each closing a gap the 2026-11-10 inventory found. Ledger:
-- docs/SECURITY-AUDIT-2026-11-10.md.
--
-- 1. THE ADMIN TIER MUST HOLD A SECOND STEP, AND USE IT.
--    118 set role_definitions.requires_mfa for entrepreneur alone, so the
--    accounts that can suspend, delete and reset everyone else needed only a
--    password. Every admin-tier role now requires it, and grandfathering
--    (mfa_grandfathered, 118) no longer exempts an admin-tier role: a member
--    promoted to supervisor next year owes a second step like everyone else.
--
--    Requiring it is not enough while the write paths only ask whether the
--    ACCOUNT holds a factor. has_permission(), is_platform_admin() and
--    is_super_admin() now refuse an admin-tier account that is asking about
--    ITSELF unless account_mfa_satisfied() says this session has passed the
--    step. Evaluated on someone's behalf (p_user <> auth.uid()), or by the
--    service role (auth.uid() IS NULL), nothing changes. This is the shape 150
--    gave account_mfa_satisfied(), and 118's header explains why the two
--    questions are kept apart: "may Bob sponsor this?" must not depend on
--    Alice's session. Every api/ route that goes through requirePermission()
--    or requireCanAdminister(), and the ~65 policies that call
--    is_platform_admin(), pick this up with no route change.
--
-- 2. A TOTP SESSION MUST BE aal2.
--    account_mfa_satisfied() (150) accepted any session of an account with a
--    verified authenticator, so a password-only (aal1) session passed every
--    write-path check. 118 defined auth_mfa_step_up_ok() for this and nothing
--    ever called it. The TOTP branch now demands aal2 when the account is
--    asking about itself, as the email branch already demanded a step-up row.
--    Enrolment is unaffected: derive_mfa_state() (150) decides "owes
--    enrolment" from account_mfa_enrolled(), not from this predicate.
--
-- 3. THE CLOSURE COLUMNS ARE FENCED.
--    account_status, purge_after and status_changed_at (140) sat outside
--    guard_profile_privileged_columns(), and 168 left UPDATE untouched. A
--    member, or anyone holding their session, could PATCH
--    account_status='pending_deletion', purge_after=now() and lose the account
--    at the next 03:20 purge, skipping the 7-day window that exists so a
--    hijacked account can be recovered. A separate trigger refuses any change
--    made directly by the anon or authenticated role. close_my_account() and
--    reopen_my_account() (141) are SECURITY DEFINER, so their writes run as the
--    function owner and pass untouched; the service role passes too.
--
-- 4. A SUSPENDED OR CLOSED ACCOUNT CANNOT POST ON THE DIRECT PATHS.
--    has_permission() refuses a suspended account everything, but the message
--    and room-chat INSERT policies never call it (118:1010, 070), and 184
--    stopped banning the login, so a suspended member holds a working session.
--    RESTRICTIVE policies on messages, conversation_participants and
--    venue_room_messages now refuse a suspended or closed author.
--    video_call_check_caller() (202) gains the same test plus the verification
--    test, which also closes the gap 205 left for /collaborate/video.
--
-- 5. EDITS ARE MODERATED.
--    065 hung moderate_content() on INSERT only for forum posts, replies,
--    project comments and messages, and authors keep UPDATE on all four. An
--    approved post could be edited into anything. The triggers now fire on
--    INSERT OR UPDATE; moderate_content() (129) skips an UPDATE whose text did
--    not change, so status changes and read flags cost nothing.
--
-- DEPLOY ORDER: 205 (with its proposals fix) → this file → the client. The
-- client nests /admin/* under ProtectedRoute so the set-up and challenge pages
-- catch an admin who owes a step; deploying the client first is harmless.
--
-- BEFORE APPLYING: tell every admin-tier account holder (Super Admin, Admin,
-- supervisors, Safety Admin) that the next sign-in asks for a second step. An
-- authenticator app is the safer choice for these accounts: the email code
-- depends on delivery to the account's inbox.
--
-- RECOVERY, if an administrator is locked out (run in the SQL editor):
--   UPDATE role_definitions SET requires_mfa = FALSE
--   WHERE tier = 'admin';
-- That restores the pre-206 rule for the admin tier at once. The session
-- checks in sections 2–3 stay, and they only bite accounts that require a step.
--
-- Test: supabase/tests/206_security_hardening_test.sql (hand-run, silence =
-- pass). Idempotent — safe to re-run. Requires 118, 124, 140, 141, 150, 202.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Which accounts hold an admin-tier role
-- ---------------------------------------------------------------------------
-- expand_roles() on purpose: 'oecs' is an alias of super_admin and must not be
-- a way round the requirement.
CREATE OR REPLACE FUNCTION holds_admin_tier_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_definitions rd
    WHERE rd.tier = 'admin'
      AND rd.slug = ANY(expand_roles(COALESCE(p_roles, ARRAY[]::TEXT[])))
  );
$$;

REVOKE ALL ON FUNCTION holds_admin_tier_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION holds_admin_tier_role(TEXT[]) TO authenticated, service_role;

UPDATE role_definitions SET requires_mfa = TRUE
WHERE tier = 'admin' AND requires_mfa IS DISTINCT FROM TRUE;

-- ---------------------------------------------------------------------------
-- 2. account_mfa_required — 118's body; grandfathering spares no admin tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION account_mfa_required(p_user UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_definitions rd
    WHERE rd.requires_mfa
      AND rd.slug = ANY(
        expand_roles(
          COALESCE(p_roles, (SELECT p.roles FROM profiles p WHERE p.id = p_user), ARRAY[]::TEXT[])
        )
      )
      AND (
        rd.tier = 'admin'
        OR NOT COALESCE((SELECT p.mfa_grandfathered FROM profiles p WHERE p.id = p_user), FALSE)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION account_mfa_required(UUID, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. account_mfa_satisfied — 150's body; the TOTP branch demands aal2 for self
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION account_mfa_satisfied(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT account_mfa_required(p_user)
      OR (
        EXISTS (
          SELECT 1 FROM auth.mfa_factors f
          WHERE f.user_id = p_user AND f.status = 'verified'
        )
        AND (
          -- Evaluated on someone's behalf: holding the factor is enough.
          auth.uid() IS DISTINCT FROM p_user
          -- The account itself: this session must have proven the factor.
          OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
        )
      )
      OR (
        COALESCE((SELECT p.mfa_method FROM profiles p WHERE p.id = p_user), '') = 'email'
        AND (
          auth.uid() IS DISTINCT FROM p_user
          OR EXISTS (
            SELECT 1 FROM mfa_email_stepups s
            WHERE s.user_id = p_user
              AND s.session_id = mfa_current_session_id()
              AND s.expires_at > now()
          )
        )
      );
$$;

GRANT EXECUTE ON FUNCTION account_mfa_satisfied(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. has_permission — 140's body plus the admin-tier step-up rule
-- ---------------------------------------------------------------------------
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

  -- 140. A deactivated or deletion-scheduled account holds nothing.
  IF NOT is_account_active(p_user) THEN
    RETURN FALSE;
  END IF;

  -- 206. An admin-tier account asking about itself holds nothing until this
  -- session has passed its second step. On someone's behalf, unchanged.
  IF p_user = auth.uid()
     AND holds_admin_tier_role(v_roles)
     AND NOT account_mfa_satisfied(p_user) THEN
    RETURN FALSE;
  END IF;

  -- 139. Publishing and applying wait for a human to approve the account.
  IF NOT is_verified_member(p_user)
     AND EXISTS (
       SELECT 1 FROM verification_gated_permissions v
       WHERE v.permission_key = p_permission
     ) THEN
    RETURN FALSE;
  END IF;

  -- Safeguarding. Hard-coded on purpose: this must survive an admin toggling
  -- the matrix, a bad seed, and a direct UPDATE on role_permissions.
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

-- ---------------------------------------------------------------------------
-- 5. is_platform_admin / is_super_admin — 124's bodies plus the same rule
-- ---------------------------------------------------------------------------
-- The role test comes first, so for every account that is not an
-- administrator the answer is FALSE before any second-step lookup runs.
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
  )
  AND (p_user IS DISTINCT FROM auth.uid() OR account_mfa_satisfied(p_user));
$$;

CREATE OR REPLACE FUNCTION is_super_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = p_user AND 'super_admin' = ANY(expand_roles(p.roles))
    )
    AND (p_user IS DISTINCT FROM auth.uid() OR account_mfa_satisfied(p_user));
$$;

-- Bring the cached enrolment flag up to date for every admin-tier holder, so
-- the client sends them to /security/set-up on their next page load rather
-- than on their next session. ensure_my_mfa_status() would heal it anyway.
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN
    SELECT p.id FROM profiles p WHERE holds_admin_tier_role(p.roles)
  LOOP
    PERFORM sync_mfa_status(v_id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. The closure columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_profile_lifecycle_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user is the role the statement runs as. A SECURITY DEFINER
  -- function (close_my_account, reopen_my_account, the purge) runs as its
  -- owner; a PATCH from the browser runs as anon or authenticated.
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.account_status IS DISTINCT FROM OLD.account_status
          OR NEW.purge_after IS DISTINCT FROM OLD.purge_after
          OR NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at) THEN
    RAISE EXCEPTION 'account status changes go through close_my_account() or reopen_my_account()'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_lifecycle_columns_trigger ON profiles;
CREATE TRIGGER guard_profile_lifecycle_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_profile_lifecycle_columns();

-- ---------------------------------------------------------------------------
-- 7. Standing on the direct paths
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Active accounts only: send messages" ON messages;
CREATE POLICY "Active accounts only: send messages"
  ON messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_suspended(auth.uid()) AND is_account_active(auth.uid()));

DROP POLICY IF EXISTS "Active accounts only: join conversations" ON conversation_participants;
CREATE POLICY "Active accounts only: join conversations"
  ON conversation_participants AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_suspended(auth.uid()) AND is_account_active(auth.uid()));

DROP POLICY IF EXISTS "Active accounts only: room chat" ON venue_room_messages;
CREATE POLICY "Active accounts only: room chat"
  ON venue_room_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_suspended(auth.uid()) AND is_account_active(auth.uid()));

-- 202's body plus the closed-account and verification tests.
CREATE OR REPLACE FUNCTION video_call_check_caller(p_user UUID)
RETURNS VOID AS $$
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(p_user) THEN
    RAISE EXCEPTION 'your account is suspended';
  END IF;
  IF NOT is_account_active(p_user) THEN
    RAISE EXCEPTION 'this account is closed';
  END IF;
  IF NOT is_verified_member(p_user) THEN
    RAISE EXCEPTION 'video calls open once your account is verified';
  END IF;
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user AND 'student' = ANY(coalesce(roles, ARRAY[]::TEXT[]))
  ) THEN
    RAISE EXCEPTION 'video calls are not open to student accounts';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION video_call_check_caller(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Moderate edits — 065's four triggers, now INSERT OR UPDATE
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS moderate_forum_posts_trigger ON forum_posts;
CREATE TRIGGER moderate_forum_posts_trigger
  BEFORE INSERT OR UPDATE ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_forum_replies_trigger ON forum_replies;
CREATE TRIGGER moderate_forum_replies_trigger
  BEFORE INSERT OR UPDATE ON forum_replies
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_project_comments_trigger ON project_comments;
CREATE TRIGGER moderate_project_comments_trigger
  BEFORE INSERT OR UPDATE ON project_comments
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'user_id');

DROP TRIGGER IF EXISTS moderate_messages_trigger ON messages;
CREATE TRIGGER moderate_messages_trigger
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'sender_id');

COMMENT ON FUNCTION holds_admin_tier_role(TEXT[]) IS
  'TRUE if any of these roles (aliases expanded) is admin-tier. 206: such accounts owe a second step.';
COMMENT ON FUNCTION guard_profile_lifecycle_columns() IS
  'Refuses direct edits of account_status, purge_after, status_changed_at by anon/authenticated (206).';
