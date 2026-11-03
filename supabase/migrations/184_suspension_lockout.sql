-- ============================================================================
-- 184_suspension_lockout.sql — a suspended member lands on one page
-- ============================================================================
--
-- Suspension stops banning the login (api/admin/suspend-user.ts no longer
-- sets ban_duration). has_permission() already refuses every action to a
-- suspended account, so the database side was always enough; what the ban
-- added was a member who could not sign in to find out why, or to appeal.
-- The client now reads the member's own state and holds the session on
-- /account/suspended instead.
--
-- Three changes:
--
-- 1. set_user_suspension() writes moderation_log. It logged nothing, so the
--    account history could not say who suspended whom or when. 124's body is
--    restated with the INSERT added after the write; the ceiling checks in
--    front of it are unchanged, word for word.
--
-- 2. my_suspension(): the member's own suspension, through SECURITY DEFINER.
--    168 took the suspension columns out of the profiles column grant, so a
--    plain select cannot read them. An expired suspension reads as not
--    suspended, using is_suspended() from 063, which is the same rule
--    has_permission() applies. Nothing sweeps is_suspended back to FALSE when
--    suspended_until passes, and nothing has to.
--
-- 3. feedback.category accepts 'appeal', which the suspended page files.
--
-- has_permission() is not changed: is_suspended() (063) already treats a
-- passed suspended_until as lifted.
--
-- Idempotent — safe to re-run. Requires 063, 093, 117 and 124.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. The log can say "reinstated"
-- ---------------------------------------------------------------------------
-- 117's list plus one value. 'restored' is about content; a reinstated account
-- is a different fact and the account history should be able to tell them apart.
ALTER TABLE moderation_log DROP CONSTRAINT IF EXISTS moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'flagged', 'warned', 'quarantined', 'restored', 'removed', 'suspended', 'escalated',
  'takedown', 'restored_after_counter', 'reinstated'
));

-- ---------------------------------------------------------------------------
-- 1. set_user_suspension — 124's body plus the audit row
-- ---------------------------------------------------------------------------
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

  -- 184. Who, whom, when, and on what terms.
  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
  VALUES (
    'admin',
    v_actor,
    p_user,
    'account',
    p_user,
    CASE WHEN p_suspended THEN 'suspended' ELSE 'reinstated' END,
    jsonb_build_object(
      'until', CASE WHEN p_suspended THEN p_until ELSE NULL END,
      'reason', CASE WHEN p_suspended THEN p_reason ELSE NULL END
    )
  );

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. my_suspension — the member's own state
-- ---------------------------------------------------------------------------
-- NULL with no session. suspended_at is the newest account suspension in the
-- log: an admin's (target_type 'account', 184 onwards) or the content filter's
-- (actor_kind 'system', 065). Not 181's rows, which log a suspended funding
-- call against its poster. NULL for a suspension made before this migration.
CREATE OR REPLACE FUNCTION my_suspension()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'is_suspended', is_suspended(p.id),
    'suspended_until', CASE WHEN is_suspended(p.id) THEN p.suspended_until END,
    'suspension_reason', CASE WHEN is_suspended(p.id) THEN p.suspension_reason END,
    'suspended_at', CASE WHEN is_suspended(p.id) THEN (
      SELECT max(m.created_at)
      FROM moderation_log m
      WHERE m.user_id = p.id
        AND m.action = 'suspended'
        AND (m.target_type = 'account' OR m.actor_kind = 'system')
    ) END
  )
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION my_suspension() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_suspension() TO authenticated;

COMMENT ON FUNCTION my_suspension() IS
  'The caller''s own suspension: is_suspended (false once suspended_until has passed), suspended_until, suspension_reason, suspended_at (184).';

-- ---------------------------------------------------------------------------
-- 3. Appeals land in the feedback queue
-- ---------------------------------------------------------------------------
-- 093's list plus 'appeal'. The INSERT policy (037) checks only that user_id
-- is the caller, not has_permission(), so a suspended member can still file.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_category_check;
ALTER TABLE feedback
  ADD CONSTRAINT feedback_category_check
  CHECK (category IN ('bug', 'feature_request', 'general', 'content', 'praise', 'appeal'));

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT my_suspension();                                                 -- as a member
--   SELECT action, count(*) FROM moderation_log WHERE target_type = 'account' GROUP BY 1;
