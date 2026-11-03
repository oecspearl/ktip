-- ============================================================
-- Migration 174: a record of every verification decision, and a real revoke
--
-- 145 gave each verified account a reason (verified_via). It did not keep a
-- history: when the flag goes off, the reason is cleared with it, and nothing
-- says who did it or why. The admin users page clears it with a bare UPDATE.
--
-- This migration adds:
--
--   verification_events   append-only log. Written by a trigger on profiles,
--                         so every existing path (document review, domain,
--                         roster, institution, the admin toggle) is recorded
--                         without restating any of them. RPCs that know more
--                         than the trigger can see pass it through two
--                         transaction-local settings:
--                           ktip.verification_reason    free text
--                           ktip.verification_evidence  JSON object
--                           ktip.verification_event     overrides the event
--                                                       name for a flag-off
--                                                       (expired, code_withdrawn)
--
--   verification_hold_at  set by a revoke. While set, nothing automatic can
--                         verify the account again. Without it a revoked
--                         @oecs.int member is re-verified on their next
--                         session by claim_email_verification(), which the
--                         client calls once per session (AuthContext.tsx).
--                         Only a reviewer clears it, and a reviewer verifying
--                         the account by hand clears it implicitly.
--
--   revoke_verification()       reviewer action, reason required
--   clear_verification_hold()   reviewer action, reason required
--   get_my_verification_history()  the member's own trail, reviewer ids omitted
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The hold
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_hold_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.verification_hold_at IS
  'Set by revoke_verification() (174). While set, automatic tracks (domain, roster, institution, org code) cannot verify the account. Cleared by a reviewer.';

-- Fires before guard_verification_provenance_trigger (names sort) and before
-- 175's expiry trigger, so it sees the row as the caller wrote it.
--
-- Deliberately does NOT honour ktip.bypass_profile_guard: that flag is how
-- apply_verified_email() and grant_institution_membership() write the row, and
-- those are exactly the paths a hold has to stop.
CREATE OR REPLACE FUNCTION guard_verification_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reviewer BOOLEAN;
BEGIN
  -- Cheap exit: almost no profile update touches either of these.
  IF NEW.verification_hold_at IS NOT DISTINCT FROM OLD.verification_hold_at
     AND (COALESCE(NEW.is_verified, FALSE) = COALESCE(OLD.is_verified, FALSE)
          OR OLD.verification_hold_at IS NULL) THEN
    RETURN NEW;
  END IF;

  v_reviewer := v_actor IS NOT NULL AND has_permission(v_actor, 'verification:review');

  -- Changing the hold itself: reviewers, the service role (no auth.uid()),
  -- or this migration's own definer functions.
  IF NEW.verification_hold_at IS DISTINCT FROM OLD.verification_hold_at
     AND v_actor IS NOT NULL
     AND NOT v_reviewer
     AND COALESCE(current_setting('ktip.verification_internal', TRUE), '') <> 'on' THEN
    RAISE EXCEPTION 'the verification hold can only be changed by a reviewer';
  END IF;

  -- Verifying a held account.
  IF COALESCE(NEW.is_verified, FALSE) AND NOT COALESCE(OLD.is_verified, FALSE)
     AND OLD.verification_hold_at IS NOT NULL
     AND NEW.verification_hold_at IS NOT NULL THEN
    IF v_reviewer THEN
      -- A reviewer verifying by hand has decided; the hold goes with it.
      NEW.verification_hold_at := NULL;
    ELSE
      RAISE EXCEPTION 'verification_on_hold'
        USING HINT = 'This account''s verification was removed by a reviewer. A reviewer must restore it.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_verification_hold_trigger ON profiles;
CREATE TRIGGER guard_verification_hold_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_verification_hold();

-- ------------------------------------------------------------
-- 2. The log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  via TEXT,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verification_events_event_check CHECK (event IN (
    'granted', 'renewed', 'track_changed', 'rejected', 'revoked', 'expired',
    'reminder_sent', 'code_issued', 'code_redeemed', 'code_revoked',
    'code_withdrawn', 'hold_set', 'hold_cleared'
  )),
  CONSTRAINT verification_events_reason_len CHECK (reason IS NULL OR length(reason) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_verification_events_user
  ON verification_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_events_recent
  ON verification_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_events_event
  ON verification_events (event, created_at DESC);

COMMENT ON TABLE verification_events IS
  'Append-only history of verification decisions (174). Written by trg_log_verification_change and by the code/expiry RPCs. Reviewers read it directly; members read their own through get_my_verification_history().';

ALTER TABLE verification_events ENABLE ROW LEVEL SECURITY;

-- Reviewers only. A member reads their own trail through the RPC below, which
-- leaves out who the reviewer was: RLS is column-blind.
DROP POLICY IF EXISTS "Reviewers read verification events" ON verification_events;
CREATE POLICY "Reviewers read verification events"
  ON verification_events FOR SELECT
  USING (has_permission(auth.uid(), 'verification:review'));

-- No INSERT, UPDATE or DELETE policy. Rows arrive from SECURITY DEFINER code
-- only and are never edited.

-- Reads the three settings defensively: a malformed evidence string must not
-- turn into a failed profile update.
CREATE OR REPLACE FUNCTION verification_context_evidence()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_raw TEXT := NULLIF(current_setting('ktip.verification_evidence', TRUE), '');
BEGIN
  IF v_raw IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  BEGIN
    RETURN COALESCE(v_raw::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('unparsed', left(v_raw, 500));
  END;
END;
$$;

REVOKE ALL ON FUNCTION verification_context_evidence() FROM PUBLIC;

CREATE OR REPLACE FUNCTION log_verification_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was BOOLEAN := COALESCE(OLD.is_verified, FALSE);
  v_now BOOLEAN := COALESCE(NEW.is_verified, FALSE);
  v_event TEXT;
  v_via TEXT;
  v_reason TEXT := NULLIF(left(current_setting('ktip.verification_reason', TRUE), 1000), '');
  v_override TEXT := NULLIF(current_setting('ktip.verification_event', TRUE), '');
  v_evidence JSONB;
BEGIN
  IF NOT v_was AND v_now THEN
    v_event := 'granted';
    v_via := NEW.verified_via;
  ELSIF v_was AND NOT v_now THEN
    v_event := CASE WHEN v_override IN ('expired', 'code_withdrawn') THEN v_override ELSE 'revoked' END;
    v_via := OLD.verified_via;
  ELSIF v_now AND NEW.verified_via IS DISTINCT FROM OLD.verified_via THEN
    v_event := 'track_changed';
    v_via := NEW.verified_via;
  END IF;

  BEGIN
    v_evidence := verification_context_evidence();

    IF v_event IS NOT NULL THEN
      IF NEW.verification_hold_at IS DISTINCT FROM OLD.verification_hold_at THEN
        v_evidence := v_evidence || jsonb_build_object('hold', NEW.verification_hold_at IS NOT NULL);
      END IF;
      INSERT INTO verification_events (user_id, event, via, actor_id, reason, evidence)
      VALUES (NEW.id, v_event, v_via, auth.uid(), v_reason, v_evidence);
    ELSIF NEW.verification_hold_at IS DISTINCT FROM OLD.verification_hold_at THEN
      INSERT INTO verification_events (user_id, event, via, actor_id, reason, evidence)
      VALUES (
        NEW.id,
        CASE WHEN NEW.verification_hold_at IS NULL THEN 'hold_cleared' ELSE 'hold_set' END,
        NEW.verified_via, auth.uid(), v_reason, v_evidence
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- The log must never be the reason a sign-up or a review fails.
    RAISE WARNING 'log_verification_change(%): %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_verification_change ON profiles;
CREATE TRIGGER trg_log_verification_change
  AFTER UPDATE OF is_verified, verified_via, verification_hold_at ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION log_verification_change();

-- Document reviews: a rejection never touches profiles, so the trigger above
-- cannot see it. An approval does, and this hands the request id and the
-- reviewer's note to that trigger through the transaction-local settings.
CREATE OR REPLACE FUNCTION log_verification_request_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  BEGIN
    IF NEW.status = 'rejected' THEN
      INSERT INTO verification_events (user_id, event, via, actor_id, reason, evidence)
      VALUES (
        NEW.user_id, 'rejected', 'document', auth.uid(), NULLIF(left(NEW.admin_note, 1000), ''),
        jsonb_build_object('request_id', NEW.id, 'requested_role', NEW.requested_role)
      );
    ELSIF NEW.status = 'approved' THEN
      PERFORM set_config('ktip.verification_evidence',
        jsonb_build_object('request_id', NEW.id, 'requested_role', NEW.requested_role)::TEXT, TRUE);
      PERFORM set_config('ktip.verification_reason', COALESCE(left(NEW.admin_note, 1000), ''), TRUE);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log_verification_request_review(%): %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_verification_request_review ON verification_requests;
CREATE TRIGGER trg_log_verification_request_review
  AFTER UPDATE OF status ON verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_verification_request_review();

-- ------------------------------------------------------------
-- 3. Backfill: everyone verified today gets a starting row
-- ------------------------------------------------------------
INSERT INTO verification_events (user_id, event, via, actor_id, reason, evidence, created_at)
SELECT p.id, 'granted', p.verified_via, NULL, NULL,
       jsonb_build_object('backfill', TRUE),
       COALESCE(p.verified_at, p.created_at, now())
FROM profiles p
WHERE COALESCE(p.is_verified, FALSE)
  AND NOT EXISTS (SELECT 1 FROM verification_events e WHERE e.user_id = p.id);

-- ------------------------------------------------------------
-- 4. Revoke and clear
-- ------------------------------------------------------------
-- Leaves roles alone: removing a role stays a set_user_roles() decision.
-- p_hold FALSE is for "verified the wrong way, try again" — the member can
-- re-verify through any track at once.
CREATE OR REPLACE FUNCTION revoke_verification(
  p_user UUID,
  p_reason TEXT,
  p_hold BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := trim(both from COALESCE(p_reason, ''));
  v_was BOOLEAN;
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'verification:review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;
  IF p_user = v_actor THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'self');
  END IF;
  IF length(v_reason) < 10 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'reason_required');
  END IF;
  IF holds_admin_seat(p_user) AND NOT is_super_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'seat_requires_super_admin');
  END IF;

  SELECT COALESCE(is_verified, FALSE) INTO v_was FROM profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  PERFORM set_config('ktip.verification_reason', left(v_reason, 1000), TRUE);
  PERFORM set_config('ktip.verification_event', '', TRUE);
  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET is_verified = FALSE,
      verified_via = NULL,
      verified_at = NULL,
      verification_hold_at = CASE WHEN p_hold THEN now() ELSE verification_hold_at END,
      updated_at = now()
  WHERE id = p_user;
  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);
  PERFORM set_config('ktip.verification_reason', '', TRUE);

  IF v_was THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      p_user,
      'verification_result',
      'Your verification was removed',
      left('A reviewer removed the verified badge from your account. Reason: ' || v_reason
           || CASE WHEN p_hold THEN ' To ask for it back, reply through Settings, Verification.'
                   ELSE ' You can verify again from Settings, Verification.' END, 1000),
      '/settings?tab=verification'
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'was_verified', v_was, 'hold', p_hold);
END;
$$;

REVOKE ALL ON FUNCTION revoke_verification(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revoke_verification(UUID, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION clear_verification_hold(p_user UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := trim(both from COALESCE(p_reason, ''));
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'verification:review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;
  IF length(v_reason) < 10 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'reason_required');
  END IF;
  IF holds_admin_seat(p_user) AND NOT is_super_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'seat_requires_super_admin');
  END IF;

  PERFORM set_config('ktip.verification_reason', left(v_reason, 1000), TRUE);
  UPDATE profiles
  SET verification_hold_at = NULL,
      updated_at = now()
  WHERE id = p_user AND verification_hold_at IS NOT NULL;
  PERFORM set_config('ktip.verification_reason', '', TRUE);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_on_hold');
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    p_user,
    'verification_result',
    'You can verify your account again',
    'A reviewer lifted the hold on your account. Verify from Settings, Verification.',
    '/settings?tab=verification'
  );

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION clear_verification_hold(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_verification_hold(UUID, TEXT) TO authenticated;

-- The member's own trail. No actor ids: a member learns what happened and
-- why, not which reviewer did it.
CREATE OR REPLACE FUNCTION get_my_verification_history(p_limit INT DEFAULT 20)
RETURNS TABLE (
  event TEXT,
  via TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.event, e.via,
         CASE WHEN e.event IN ('revoked', 'rejected', 'hold_set', 'hold_cleared', 'code_withdrawn')
              THEN e.reason END,
         e.created_at
  FROM verification_events e
  WHERE e.user_id = auth.uid()
    AND e.event NOT IN ('code_issued', 'code_revoked', 'reminder_sent')
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION get_my_verification_history(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_verification_history(INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- the backfill left nobody verified without a starting row
--   SELECT count(*) FROM profiles p
--    WHERE p.is_verified
--      AND NOT EXISTS (SELECT 1 FROM verification_events e WHERE e.user_id = p.id);  -- 0
--
--   -- as a reviewer: revoke, then the member's next session cannot undo it
--   SELECT revoke_verification('<uuid>', 'Left the organisation in October');  -- ok:true
--   SELECT is_verified, verification_hold_at IS NOT NULL FROM profiles WHERE id = '<uuid>';  -- f, t
--   -- as that member:
--   SELECT claim_email_verification();   -- 174 alone: raises verification_on_hold
--                                        -- after 175: {"ok":false,"reason":"on_hold"}
--
--   -- the reason is required, and the trail records it
--   SELECT revoke_verification('<uuid>', 'no');                 -- reason_required
--   SELECT event, reason FROM verification_events WHERE user_id = '<uuid>'
--    ORDER BY created_at DESC LIMIT 1;                          -- revoked, Left the...
--
--   -- a reviewer verifying by hand lifts the hold
--   UPDATE profiles SET is_verified = TRUE, verified_via = 'admin', verified_at = now()
--    WHERE id = '<uuid>';
--   SELECT verification_hold_at FROM profiles WHERE id = '<uuid>';   -- NULL
-- ============================================================
