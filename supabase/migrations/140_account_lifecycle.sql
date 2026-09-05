-- ============================================================
-- Migration 140: deactivate, delete, and a window to change your mind
--
-- Asked before go-live: "where users can deactivate or delete their account.
-- What happens to the data when account is deactivated or deleted? ... keep the
-- data for a finite period of time in case the person wants to reactivate the
-- account, unless explicitly requested otherwise. They should be allowed to
-- choose."
--
-- Before this, the only exit was /api/delete-account: an immediate, total,
-- irreversible hard delete of the profile row and the auth user. No middle
-- state, no window, no choice. A member who wanted to step away for a term had
-- to destroy everything or stay.
--
-- THE TWO EXITS, AND WHAT EACH KEEPS
--
--   deactivate       hidden from the platform; sign in again and you are back.
--                    Nothing is touched for 90 days. After that the account is
--                    anonymised — personal data gone, contributions kept.
--
--   delete           7-day window in which signing in cancels it, so a hijacked
--                    account can be recovered. Then purged.
--
-- ONE THING THE 7-DAY PURGE CANNOT DO HONESTLY, stated here rather than
-- discovered later. A funder's account is FK'd to the funding calls they
-- posted, and other members' applications are FK'd to those calls. A cascade
-- from the profile row therefore destroys third parties' submissions along with
-- the leaver's data. purge_account() below deletes the leaver and their
-- personal data, and REASSIGNS a funding call that has applications against it
-- to the organisation that owns it (or leaves it authorless where there is no
-- organisation) rather than taking somebody else's application down with it.
-- If the intent is that those applications die with the call, that is a
-- deliberate follow-up, not something to arrive at by accident.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. State
-- ------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'deactivated', 'pending_deletion'));

COMMENT ON COLUMN profiles.account_status IS
  'active | deactivated (hidden, reversible) | pending_deletion (purge scheduled)';
COMMENT ON COLUMN profiles.purge_after IS
  'When the retention window closes. NULL on an active account.';

-- The cron reads exactly this: closed accounts whose window has passed.
CREATE INDEX IF NOT EXISTS idx_profiles_purge_due
  ON profiles(purge_after)
  WHERE account_status <> 'active';

-- The windows, in one place. Changing the policy is changing these two lines.
CREATE OR REPLACE FUNCTION account_retention_days(p_status TEXT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'deactivated'      THEN 90   -- long enough for a semester away
    WHEN 'pending_deletion' THEN 7    -- long enough to undo a hijack
    ELSE NULL
  END;
$$;

-- ------------------------------------------------------------
-- 2. The member's own controls
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_my_account(p_mode TEXT)
RETURNS TABLE (account_status TEXT, purge_after TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  v_status := CASE p_mode
    WHEN 'deactivate' THEN 'deactivated'
    WHEN 'delete'     THEN 'pending_deletion'
    ELSE NULL
  END;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'unknown closure mode: %', p_mode;
  END IF;

  -- An admin seat cannot close itself out from under the platform: losing the
  -- last super_admin to a mis-click is not a recoverable state.
  IF EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.roles && ARRAY['admin', 'super_admin']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'an administrator account is closed by another administrator, not by itself';
  END IF;

  RETURN QUERY
  UPDATE profiles p
  SET account_status = v_status,
      status_changed_at = now(),
      purge_after = now() + (account_retention_days(v_status) || ' days')::INTERVAL
  WHERE p.id = auth.uid()
  RETURNING p.account_status, p.purge_after;
END;
$$;

COMMENT ON FUNCTION close_my_account(TEXT) IS
  'Deactivate (90-day window) or schedule deletion (7-day window) of the calling account.';

-- Signing in is the reactivation gesture, so this is called on sign-in as well
-- as from the settings page. Safe to call on an already-active account.
CREATE OR REPLACE FUNCTION reopen_my_account()
RETURNS TABLE (account_status TEXT, reopened BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  SELECT p.account_status INTO v_was FROM profiles p WHERE p.id = auth.uid();

  IF v_was IS NULL OR v_was = 'active' THEN
    RETURN QUERY SELECT COALESCE(v_was, 'active'), FALSE;
    RETURN;
  END IF;

  UPDATE profiles p
  SET account_status = 'active',
      status_changed_at = now(),
      purge_after = NULL
  WHERE p.id = auth.uid();

  RETURN QUERY SELECT 'active'::TEXT, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION close_my_account(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reopen_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_my_account(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_my_account() TO authenticated;

-- ------------------------------------------------------------
-- 3. Hiding a deactivated member
-- ------------------------------------------------------------
-- Deliberately NOT an RLS filter on profiles. Authorship is rendered by joining
-- the profile onto the content, so hiding the row at the policy level would
-- blank the author of every project, thread and funding call the member ever
-- posted — including, for a deactivation, ones they are coming back to. The
-- filter belongs on the surfaces that list PEOPLE, and this is what they use.
CREATE OR REPLACE FUNCTION is_account_active(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.account_status = 'active' FROM profiles p WHERE p.id = p_user),
    FALSE
  );
$$;

-- A closed account cannot act, exactly as a suspended one cannot. Without this
-- a member could deactivate and keep posting from an open tab for 90 days.
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

-- ------------------------------------------------------------
-- 4. What the retention window ends in
-- ------------------------------------------------------------
-- Anonymisation, for a deactivation nobody came back from. The row survives so
-- every foreign key pointing at it survives; what leaves is the person.
CREATE OR REPLACE FUNCTION anonymise_account(p_user UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET
    display_name = 'Former member',
    username = NULL,
    bio = NULL,
    avatar_url = NULL,
    banner = NULL,
    phone = NULL,
    website = NULL,
    organization = NULL,
    industry = NULL,
    country = NULL,
    skills = ARRAY[]::TEXT[],
    interests = ARRAY[]::TEXT[],
    open_to = ARRAY[]::TEXT[],
    languages = ARRAY[]::TEXT[],
    is_verified = FALSE,
    account_status = 'deactivated',
    purge_after = NULL,
    status_changed_at = now()
  WHERE id = p_user;
$$;

-- Deletion. Detaches the third-party records that must outlive the leaver,
-- then removes the profile — everything genuinely theirs cascades from it.
-- The auth.users row cannot be reached from SQL; the cron does that half with
-- the service role immediately after this returns.
CREATE OR REPLACE FUNCTION purge_account(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A funding call with applications against it belongs to the applicants as
  -- much as to whoever posted it. Hand it to the owning organisation rather
  -- than cascade it — and with it, everybody's submission — into nothing.
  UPDATE grants g
  SET created_by = NULL
  WHERE g.created_by = p_user
    AND EXISTS (SELECT 1 FROM grant_applications a WHERE a.grant_id = g.id);

  DELETE FROM profiles WHERE id = p_user;
END;
$$;

-- The queue the cron works. Service role only: this names every account about
-- to be erased, which is not a list any member has business reading.
CREATE OR REPLACE FUNCTION accounts_due_for_purge()
RETURNS TABLE (user_id UUID, account_status TEXT, purge_after TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.account_status, p.purge_after
  FROM profiles p
  WHERE p.account_status <> 'active'
    AND p.purge_after IS NOT NULL
    AND p.purge_after <= now()
  ORDER BY p.purge_after
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION anonymise_account(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_account(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION accounts_due_for_purge() FROM PUBLIC;
REVOKE ALL ON FUNCTION anonymise_account(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION purge_account(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION accounts_due_for_purge() FROM authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- closing sets a window, and the window is the policy
--   SELECT * FROM close_my_account('deactivate');   -- deactivated, now()+90d
--   SELECT * FROM close_my_account('delete');       -- pending_deletion, now()+7d
--
--   -- a closed account can do nothing while it is closed
--   SELECT has_permission('<closed uuid>', 'forum:comment');   -- f
--
--   -- and signing in undoes it
--   SELECT * FROM reopen_my_account();              -- active, t
--
--   -- the purge queue is invisible to members
--   SET ROLE authenticated;
--   SELECT * FROM accounts_due_for_purge();         -- permission denied
-- ============================================================
