-- ============================================================================
-- 117_takedown_notices.sql — copyright notices, counter-notices, repeat strikes
-- ============================================================================
--
-- The Copyright & Takedown Policy (src/lib/legal/copyright.ts) promises a
-- working process: file a notice without an account, get an acknowledgement,
-- have the accused told what was removed and by whom, let them answer with a
-- counter-notice, and terminate accounts that infringe repeatedly. This is the
-- machinery behind that.
--
-- WHY NOT content_reports (065). That table has
-- `reporter_id UUID NOT NULL REFERENCES profiles(id)` and a closed category
-- CHECK. A copyright notice comes from a rightsholder who has no KTIP account —
-- a photographer, a label, a company's lawyer — and cannot satisfy a NOT NULL FK
-- to profiles. Making reporter_id nullable would weaken the auto-quarantine
-- logic that counts DISTINCT reporters, which is the whole reason that column is
-- NOT NULL (see the comment at 065:145). Separate table, shared admin console.
--
-- THE STRIKE RULE. A strike counts only when a notice has been ACTIONED and not
-- later reversed by a counter-notice. Counting filings instead would hand anyone
-- willing to file three notices the ability to delete a competitor's account,
-- which is a well-known failure mode of takedown regimes and one worth designing
-- out rather than moderating around.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Notices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS takedown_notices (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind           TEXT NOT NULL DEFAULT 'takedown'
                 CHECK (kind IN ('takedown', 'counter_notice')),
  -- A counter-notice hangs off the notice it answers.
  parent_id      UUID REFERENCES takedown_notices(id) ON DELETE CASCADE,

  -- Short, human-quotable reference. Goes in the acknowledgement email and is
  -- what a claimant quotes in follow-up, so it must not be a UUID.
  reference      TEXT NOT NULL UNIQUE,

  -- The complainant. Deliberately NOT a profiles FK: most rightsholders have no
  -- account here, and requiring one would mean the only people who can protect
  -- their work are the people already using the platform.
  claimant_name  TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  claimant_org   TEXT,
  claimant_role  TEXT NOT NULL CHECK (claimant_role IN ('owner', 'authorised_agent')),
  -- Set only when the complainant happened to be signed in while filing.
  claimant_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- The target. target_type/target_id mirror content_reports so one admin
  -- console can render both queues; both are nullable because a notice filed
  -- from the public form carries only a URL until a moderator resolves it.
  target_type    TEXT CHECK (target_type IS NULL OR target_type IN (
    'project', 'forum_post', 'forum_reply', 'project_comment', 'profile',
    'event', 'resource', 'document', 'snippet', 'cv', 'org_profile', 'event_solution'
  )),
  target_id      UUID,
  target_author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_url     TEXT NOT NULL,
  -- Frozen at filing time, so the review survives the author editing or
  -- deleting the content — the same reason content_reports keeps one.
  content_snapshot TEXT,

  work_description    TEXT NOT NULL,
  infringement_detail TEXT NOT NULL,

  -- The three affirmations, stored separately because they ARE separate
  -- statements. One combined boolean is not evidence that each was made, and
  -- each is the one a bad-faith filer later claims they never read.
  sworn_good_faith BOOLEAN NOT NULL,
  sworn_accuracy   BOOLEAN NOT NULL,
  sworn_authority  BOOLEAN NOT NULL,

  status         TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'reviewing', 'actioned', 'rejected',
    'counter_received', 'restored', 'withdrawn'
  )),
  -- Derived by apply_takedown_outcome(), never set by hand.
  counts_as_strike BOOLEAN NOT NULL DEFAULT FALSE,

  admin_notes    TEXT,
  resolved_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  -- Salted hash, never a raw address, matching the promise in Privacy §2.2 and
  -- the pattern migration 097 uses for the translation throttle. Written by the
  -- edge function, which is the only layer that can see x-forwarded-for.
  ip_hash        TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A takedown must swear all three; a counter-notice makes a different
  -- statement and is filed through the same table.
  CONSTRAINT takedown_sworn CHECK (
    kind <> 'takedown'
    OR (sworn_good_faith AND sworn_accuracy AND sworn_authority)
  ),
  CONSTRAINT counter_has_parent CHECK (kind <> 'counter_notice' OR parent_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_takedown_status ON takedown_notices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_takedown_author ON takedown_notices(target_author_id);
CREATE INDEX IF NOT EXISTS idx_takedown_strikes ON takedown_notices(target_author_id)
  WHERE counts_as_strike;
CREATE INDEX IF NOT EXISTS idx_takedown_parent ON takedown_notices(parent_id);

-- ---------------------------------------------------------------------------
-- 2. Strike state on the profile
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS copyright_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS copyright_strike_at TIMESTAMPTZ;

-- The threshold lives with the other moderation thresholds, not in code, so it
-- can be tuned without a deploy.
ALTER TABLE moderation_settings
  ADD COLUMN IF NOT EXISTS copyright_strike_limit INTEGER NOT NULL DEFAULT 3
  CHECK (copyright_strike_limit > 0);

-- Widen the shared audit trail rather than inventing a second one. The console,
-- the account history and any later export all read moderation_log already.
ALTER TABLE moderation_log DROP CONSTRAINT IF EXISTS moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'flagged', 'warned', 'quarantined', 'restored', 'removed', 'suspended', 'escalated',
  'takedown', 'restored_after_counter'
));

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE takedown_notices ENABLE ROW LEVEL SECURITY;

-- Not public: a notice names a complainant and an accused. Staff can read the
-- queue; the accused can read notices filed against their own content, because
-- they cannot answer a complaint they are not allowed to see. The claimant is
-- deliberately NOT given a read policy — they filed anonymously as far as this
-- database is concerned, and their copy arrives by email.
DROP POLICY IF EXISTS "Staff and the accused read takedown notices" ON takedown_notices;
CREATE POLICY "Staff and the accused read takedown notices" ON takedown_notices
  FOR SELECT USING (
    has_permission(auth.uid(), 'moderation:view')
    OR target_author_id = auth.uid()
  );

-- No INSERT policy. Notices arrive through api/legal/takedown.ts with the
-- service key: the form is public and unauthenticated, so there is no JWT to
-- write under, and the endpoint is also the only layer that can rate-limit and
-- hash the caller's IP.
--
-- No UPDATE or DELETE policy either. Status changes go through
-- apply_takedown_outcome(), so a moderator cannot quietly rewrite the record of
-- what they decided.
GRANT SELECT ON takedown_notices TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Strike recomputation and outcomes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_copyright_strikes(p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_last  TIMESTAMPTZ;
BEGIN
  IF p_user IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*), MAX(resolved_at)
  INTO v_count, v_last
  FROM takedown_notices
  WHERE target_author_id = p_user
    AND counts_as_strike
    AND kind = 'takedown';

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
  UPDATE profiles
  SET copyright_strikes = COALESCE(v_count, 0),
      copyright_strike_at = v_last,
      updated_at = now()
  WHERE id = p_user;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- The one way a notice's status changes. Permission-gated, audited, and it owns
-- the strike arithmetic so a moderator never has to reason about it.
CREATE OR REPLACE FUNCTION apply_takedown_outcome(
  p_notice_id UUID,
  p_status    TEXT,
  p_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_notice takedown_notices%ROWTYPE;
  v_strike BOOLEAN;
  v_count  INTEGER;
  v_limit  INTEGER;
BEGIN
  IF v_actor IS NULL OR NOT has_permission(v_actor, 'moderation:action') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('reviewing', 'actioned', 'rejected', 'restored', 'withdrawn') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_status');
  END IF;

  SELECT * INTO v_notice FROM takedown_notices WHERE id = p_notice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  -- Actioned means the content came down and the notice stands. Everything
  -- else — rejected, restored after a counter-notice, withdrawn by the
  -- claimant — clears the strike, which is what makes a counter-notice worth
  -- filing.
  v_strike := (p_status = 'actioned');

  UPDATE takedown_notices
  SET status = p_status,
      counts_as_strike = v_strike,
      admin_notes = COALESCE(p_notes, admin_notes),
      resolved_by = v_actor,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_notice_id;

  v_count := refresh_copyright_strikes(v_notice.target_author_id);

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
  VALUES (
    'admin',
    v_actor,
    v_notice.target_author_id,
    v_notice.target_type,
    v_notice.target_id,
    CASE WHEN p_status = 'restored' THEN 'restored_after_counter' ELSE 'takedown' END,
    jsonb_build_object(
      'notice_id', p_notice_id,
      'reference', v_notice.reference,
      'status', p_status,
      'strikes', v_count
    )
  );

  SELECT copyright_strike_limit INTO v_limit FROM moderation_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'strikes', v_count,
    'limit', COALESCE(v_limit, 3),
    -- Reported, not executed. Terminating an account is a decision a person
    -- makes with the queue in front of them; a status update quietly deleting
    -- somebody's work as a side effect is exactly the kind of automation this
    -- process should not have.
    'at_limit', v_count >= COALESCE(v_limit, 3)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_takedown_outcome(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Filing a counter-notice
-- ---------------------------------------------------------------------------
-- The accused author's side, and the one write here that DOES have a session,
-- so it can be an RPC rather than an endpoint. Restoration is still a
-- moderator's decision — this records the answer and flags the notice.
CREATE OR REPLACE FUNCTION file_counter_notice(
  p_notice_id UUID,
  p_statement TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_notice takedown_notices%ROWTYPE;
  v_ref    TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
  END IF;

  IF p_statement IS NULL OR length(trim(p_statement)) < 20 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'statement_too_short');
  END IF;

  SELECT * INTO v_notice FROM takedown_notices WHERE id = p_notice_id;
  IF NOT FOUND OR v_notice.target_author_id IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF v_notice.kind <> 'takedown' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_a_takedown');
  END IF;

  IF EXISTS (SELECT 1 FROM takedown_notices WHERE parent_id = p_notice_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_answered');
  END IF;

  v_ref := 'CN-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));

  INSERT INTO takedown_notices (
    kind, parent_id, reference,
    claimant_name, claimant_email, claimant_role, claimant_user_id,
    target_type, target_id, target_author_id, target_url,
    work_description, infringement_detail,
    sworn_good_faith, sworn_accuracy, sworn_authority,
    status
  )
  SELECT
    'counter_notice',
    p_notice_id,
    v_ref,
    COALESCE(p.display_name, 'Member'),
    COALESCE((SELECT email FROM auth.users WHERE id = v_actor), ''),
    'owner',
    v_actor,
    v_notice.target_type,
    v_notice.target_id,
    v_actor,
    v_notice.target_url,
    v_notice.work_description,
    trim(p_statement),
    TRUE, TRUE, TRUE,
    'received'
  FROM profiles p
  WHERE p.id = v_actor;

  UPDATE takedown_notices
  SET status = 'counter_received', updated_at = now()
  WHERE id = p_notice_id;

  RETURN jsonb_build_object('ok', TRUE, 'reference', v_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION file_counter_notice(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Guard the strike columns
-- ---------------------------------------------------------------------------
-- Restated in full from 116 (which restated 115, which restated 091) for the
-- CREATE OR REPLACE reason those files give. The addition is the copyright
-- block: without it a member with three standing notices clears their own count
-- in one PATCH.
--
-- IMPORTANT: the suspension and verification branches below are 116's
-- capability-keyed versions, NOT 115's role-keyed ones. This migration runs
-- after 116, so restating 115's text here would silently revoke the People
-- supervisor's Verify button — the guard would start raising again for the very
-- actor 116 exists to admit. Everything else is 116's text unchanged.
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
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

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

  IF NEW.is_minor IS DISTINCT FROM OLD.is_minor
     OR NEW.requires_age_declaration IS DISTINCT FROM OLD.requires_age_declaration
     OR NEW.age_declared_at IS DISTINCT FROM OLD.age_declared_at THEN
    RAISE EXCEPTION 'age status is derived from the declared date of birth and cannot be set directly';
  END IF;

  IF NEW.requires_consent IS DISTINCT FROM OLD.requires_consent
     OR NEW.consent_recorded_at IS DISTINCT FROM OLD.consent_recorded_at THEN
    RAISE EXCEPTION 'consent state is derived from recorded acceptances and cannot be set directly';
  END IF;

  -- Strikes are derived from actioned, unreversed notices. The only way to
  -- clear one is a counter-notice that succeeds.
  IF NEW.copyright_strikes IS DISTINCT FROM OLD.copyright_strikes
     OR NEW.copyright_strike_at IS DISTINCT FROM OLD.copyright_strike_at THEN
    RAISE EXCEPTION 'copyright strike state is derived from takedown notices and cannot be set directly';
  END IF;

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

-- ---------------------------------------------------------------------------
-- 7. Reading the queue
-- ---------------------------------------------------------------------------
-- Notices filed against MY content, so the author-side panel can offer a
-- counter-notice. Returns the claimant's name and claim — the policy says the
-- accused is told who filed and why, and this is where that promise is kept.
CREATE OR REPLACE FUNCTION get_my_takedown_notices()
RETURNS TABLE (
  id UUID,
  reference TEXT,
  claimant_name TEXT,
  claimant_org TEXT,
  target_url TEXT,
  work_description TEXT,
  infringement_detail TEXT,
  status TEXT,
  counts_as_strike BOOLEAN,
  created_at TIMESTAMPTZ,
  answered BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id, n.reference, n.claimant_name, n.claimant_org, n.target_url,
    n.work_description, n.infringement_detail, n.status, n.counts_as_strike,
    n.created_at,
    EXISTS (SELECT 1 FROM takedown_notices c WHERE c.parent_id = n.id)
  FROM takedown_notices n
  WHERE n.target_author_id = auth.uid()
    AND n.kind = 'takedown'
  ORDER BY n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_my_takedown_notices() TO authenticated;

NOTIFY pgrst, 'reload schema';
