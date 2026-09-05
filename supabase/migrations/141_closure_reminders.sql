-- ============================================================
-- Migration 141: warn before the window closes
--
-- 140 gave a leaving member 90 days (deactivation) or 7 (deletion) to change
-- their mind, and told them so once, on the way out. A window nobody is
-- reminded of is a trapdoor with a long fuse: the whole promise of "we keep it
-- for a finite period in case you want to come back" depends on the person
-- hearing about it again while there is still something to come back to.
--
-- One reminder each, sent by the daily purge cron:
--
--   deactivated       7 days before the 90-day window closes
--   pending_deletion  2 days before the 7-day window closes
--
-- purge_warned_at is what makes it ONE reminder rather than one per day for a
-- week. A member who reactivates and leaves again gets a fresh one, because
-- close_my_account() clears it.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS purge_warned_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.purge_warned_at IS
  'When the "your window is closing" reminder was sent. NULL means not yet warned.';

-- How much notice each closure gets, in days before purge_after.
CREATE OR REPLACE FUNCTION account_reminder_lead_days(p_status TEXT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'deactivated'      THEN 7
    WHEN 'pending_deletion' THEN 2
    ELSE NULL
  END;
$$;

-- A new closure starts unwarned. 140's body verbatim plus that one column.
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
      purge_after = now() + (account_retention_days(v_status) || ' days')::INTERVAL,
      purge_warned_at = NULL
  WHERE p.id = auth.uid()
  RETURNING p.account_status, p.purge_after;
END;
$$;

-- Coming back clears the warning too, so leaving again is warned again.
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
      purge_after = NULL,
      purge_warned_at = NULL
  WHERE p.id = auth.uid();

  RETURN QUERY SELECT 'active'::TEXT, TRUE;
END;
$$;

-- ------------------------------------------------------------
-- The reminder queue
-- ------------------------------------------------------------
-- Service role only, like accounts_due_for_purge(): this names people who are
-- about to lose an account, which is nobody else's business.
CREATE OR REPLACE FUNCTION accounts_due_for_closure_warning()
RETURNS TABLE (user_id UUID, account_status TEXT, purge_after TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.account_status, p.purge_after
  FROM profiles p
  WHERE p.account_status <> 'active'
    AND p.purge_after IS NOT NULL
    AND p.purge_warned_at IS NULL
    -- Inside the notice period, and not already past the window: an account
    -- the purge is about to take needs no warning, it needs the purge.
    AND p.purge_after > now()
    AND p.purge_after <= now()
      + (account_reminder_lead_days(p.account_status) || ' days')::INTERVAL
  ORDER BY p.purge_after
  LIMIT 500;
$$;

-- Marked only after the mail is accepted, so a delivery failure is retried
-- tomorrow rather than silently counted as sent.
CREATE OR REPLACE FUNCTION mark_closure_warned(p_user UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET purge_warned_at = now() WHERE id = p_user;
$$;

REVOKE ALL ON FUNCTION accounts_due_for_closure_warning() FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_closure_warned(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION accounts_due_for_closure_warning() FROM authenticated;
REVOKE ALL ON FUNCTION mark_closure_warned(UUID) FROM authenticated;

NOTIFY pgrst, 'reload schema';
