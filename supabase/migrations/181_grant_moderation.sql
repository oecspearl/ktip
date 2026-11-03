-- ============================================================
-- Migration 181: funding calls belong to the organisation that posted them
--
-- Decided at the Nov 2026 stakeholder meeting. Three changes, one idea: an
-- administrator polices funding calls but does not run them.
--
--   1. Administrators no longer edit a call. They can switch it off
--      (is_active) or suspend it with a reason. Every other column is the
--      poster's. A BEFORE UPDATE trigger holds the line, because the RLS
--      UPDATE policies cannot say "only these columns moved".
--   2. Suspension. A suspended call disappears for everyone except its
--      poster, the managers of the organisation it was posted for, the
--      members who already applied to it, and grants administrators. The
--      poster is told why.
--   3. Applications are decided by the organisation that posted the call and
--      nobody else. The admin UPDATE policy on grant_applications goes, and
--      decide_grant_application() / record_grant_award() lose their
--      grant:manage arm. Administrators keep read access.
--
-- Requires 077 (grants.created_by), 111 (grants.employer_id), 116, 130, 149
-- and 154 (content_index).
--
-- Apply BEFORE deploying the client that ships with it: the admin console
-- calls set_grant_suspension(), which does not exist until this runs.
--
-- Safe to re-run: IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- 1. Suspension columns
--
-- suspended_by points at auth.users, not profiles, on purpose. grants already
-- has one FK to profiles (created_by, 077) and a second one would make every
-- bare `profiles(...)` embed from grants ambiguous (PGRST201).
-- ============================================================

ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE grants DROP CONSTRAINT IF EXISTS grants_moderation_status_check;
ALTER TABLE grants ADD CONSTRAINT grants_moderation_status_check
  CHECK (moderation_status IN ('active', 'suspended'));

ALTER TABLE grants DROP CONSTRAINT IF EXISTS grants_suspension_reason_length;
ALTER TABLE grants ADD CONSTRAINT grants_suspension_reason_length
  CHECK (suspension_reason IS NULL OR char_length(suspension_reason) <= 2000);

CREATE INDEX IF NOT EXISTS idx_grants_moderation_status
  ON grants(moderation_status) WHERE moderation_status <> 'active';

COMMENT ON COLUMN grants.moderation_status IS
  'active | suspended. Set only through set_grant_suspension() (181). Independent of is_active, which is the poster''s own open/closed switch.';
COMMENT ON COLUMN grants.suspension_reason IS
  'Why an administrator suspended the call. Shown to the poster. Cleared on restore; moderation_log keeps the history.';

-- ============================================================
-- 2. Who runs an organisation
--
-- can_manage_employer() (116) is not usable here: it also answers TRUE for
-- every holder of employer:manage, which is every administrator, so "not the
-- owner and not a manager of the posting organisation" would never catch an
-- administrator at all. This is the same test without the platform arm: the
-- organisation's creator, or a member whose seat is owner or admin.
-- ============================================================

CREATE OR REPLACE FUNCTION runs_employer(p_employer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_employer_id IS NOT NULL AND p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM employers e WHERE e.id = p_employer_id AND e.created_by = p_user_id)
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = p_employer_id
        AND m.user_id = p_user_id
        AND m.role IN ('owner', 'admin')
    )
  );
$$;

COMMENT ON FUNCTION runs_employer(UUID, UUID) IS
  'The organisation''s creator or an owner/admin member. Unlike can_manage_employer(), never TRUE merely for holding employer:manage.';

REVOKE ALL ON FUNCTION runs_employer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION runs_employer(UUID, UUID) TO authenticated;

-- An applicant keeps sight of the call they applied to, suspended or not.
-- Without this their own application row would come back with a NULL grant
-- embed and My Applications would have nothing to say about it.
-- SECURITY DEFINER so the grants SELECT policy below can ask without
-- re-entering the grant_applications policies, some of which read grants.
CREATE OR REPLACE FUNCTION has_applied_to_grant(p_grant UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_grant IS NOT NULL AND p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM grant_applications a
    WHERE a.grant_id = p_grant AND a.user_id = p_user
  );
$$;

REVOKE ALL ON FUNCTION has_applied_to_grant(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_applied_to_grant(UUID, UUID) TO authenticated;

-- ============================================================
-- 3. Reading grants
--
-- 003's policy, the only SELECT policy on grants, with suspended rows taken
-- out of the public half. The active half is unchanged: anonymous visitors see
-- open calls, signed-in members see closed ones too.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view active grants" ON grants;
CREATE POLICY "Anyone can view active grants"
  ON grants FOR SELECT
  USING (
    (moderation_status = 'active' AND (is_active = TRUE OR auth.uid() IS NOT NULL))
    OR (
      auth.uid() IS NOT NULL AND (
        created_by = auth.uid()
        OR runs_employer(employer_id, auth.uid())
        OR has_permission(auth.uid(), 'grant:manage')
        OR has_applied_to_grant(id, auth.uid())
      )
    )
  );

-- The personalised feed reads content_index from SECURITY DEFINER functions,
-- which see past RLS. 154's view verbatim, with the grants arm filtered.
CREATE OR REPLACE VIEW content_index AS
  SELECT 'project'::TEXT                       AS entity,
         p.id,
         p.title,
         p.summary,
         coalesce(p.hashtags, ARRAY[]::TEXT[]) AS tags,
         p.category::TEXT                      AS category,
         NULL::TEXT                            AS type_key,
         coalesce(p.is_climate_action, FALSE)  AS is_climate_action,
         coalesce(p.is_featured, FALSE)        AS is_featured,
         p.created_at,
         NULL::TIMESTAMPTZ                     AS occurs_at,
         NULL::TIMESTAMPTZ                     AS deadline_at,
         p.owner_id,
         (coalesce(p.view_count, 0)
          + coalesce((SELECT sum(cv.views) FROM content_views cv
                       WHERE cv.entity = 'project' AND cv.content_id = p.id), 0))::NUMERIC AS popularity,
         NULL::CHAR(2)                         AS country_code,
         FALSE                                 AS is_virtual
    FROM projects p
   WHERE p.is_public

  UNION ALL

  SELECT 'resource'::TEXT,
         r.id,
         r.title,
         r.summary,
         coalesce(r.tags, ARRAY[]::TEXT[]),
         r.category::TEXT,
         r.resource_type::TEXT,
         coalesce(r.is_climate_action, FALSE),
         FALSE,
         r.created_at,
         NULL::TIMESTAMPTZ,
         NULL::TIMESTAMPTZ,
         r.author_id,
         coalesce((SELECT sum(cv.views) FROM content_views cv
                    WHERE cv.entity = 'resource' AND cv.content_id = r.id), 0)::NUMERIC,
         NULL::CHAR(2),
         FALSE
    FROM resources r
   WHERE r.is_published
     AND coalesce(r.approval_status, 'approved') = 'approved'

  UNION ALL

  SELECT 'event'::TEXT,
         e.id,
         e.title,
         e.summary,
         coalesce(e.tags, ARRAY[]::TEXT[]),
         NULL::TEXT,
         e.event_type::TEXT,
         coalesce(e.is_climate_action, FALSE),
         FALSE,
         e.created_at,
         e.start_date,
         NULL::TIMESTAMPTZ,
         e.organizer_id,
         coalesce((SELECT sum(cv.views) FROM content_views cv
                    WHERE cv.entity = 'event' AND cv.content_id = e.id), 0)::NUMERIC,
         e.country_code,
         coalesce(e.is_virtual, FALSE)
    FROM events e
   WHERE e.status <> 'draft'

  UNION ALL

  SELECT 'grant'::TEXT,
         g.id,
         g.title,
         g.summary,
         coalesce(g.tags, ARRAY[]::TEXT[]),
         NULL::TEXT,
         g.grant_type::TEXT,
         coalesce(g.is_climate_action, FALSE),
         FALSE,
         g.created_at,
         NULL::TIMESTAMPTZ,
         g.deadline,
         g.created_by,
         coalesce((SELECT sum(cv.views) FROM content_views cv
                    WHERE cv.entity = 'grant' AND cv.content_id = g.id), 0)::NUMERIC,
         NULL::CHAR(2),
         FALSE
    FROM grants g
   WHERE g.is_active
     AND g.moderation_status = 'active';

REVOKE ALL ON content_index FROM anon, authenticated;

-- ============================================================
-- 4. Administrators switch calls off; they do not rewrite them
--
-- The RLS UPDATE policies on grants still admit grant:manage (116), because an
-- administrator does need to write is_active and the suspension columns. This
-- trigger narrows that to those columns. It runs for everybody, so it also
-- stops a poster setting their own call back to active after a suspension.
--
--   * no session (service role, cron, SQL editor): allowed. purge_account()
--     (140) clears created_by from the cron this way.
--   * suspension columns: grant:manage only.
--   * the poster, or somebody who runs the posting organisation: anything
--     else, as before.
--   * anybody else (an administrator acting through grant:manage): only
--     is_active and the suspension columns. updated_at and
--     moderation_severity are bookkeeping the other triggers write.
--
-- Named guard_grant_non_owner_edits so it fires after guard_grant_employer_claim
-- (111) and before moderate_grants_trigger (122): BEFORE triggers run in name
-- order.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_grant_non_owner_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_admin_cols TEXT[] := ARRAY['is_active', 'updated_at', 'moderation_severity',
                               'moderation_status', 'suspension_reason', 'suspended_at', 'suspended_by'];
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.moderation_status, NEW.suspension_reason, NEW.suspended_at, NEW.suspended_by)
     IS DISTINCT FROM
     ROW(OLD.moderation_status, OLD.suspension_reason, OLD.suspended_at, OLD.suspended_by)
     AND NOT has_permission(v_uid, 'grant:manage') THEN
    RAISE EXCEPTION 'only a funding administrator can suspend or restore a funding call'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.created_by = v_uid OR runs_employer(OLD.employer_id, v_uid) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_admin_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_admin_cols) THEN
    RAISE EXCEPTION 'only the organisation that posted this funding call can edit it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_grant_non_owner_edits ON grants;
CREATE TRIGGER guard_grant_non_owner_edits
  BEFORE UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION guard_grant_non_owner_edits();

-- ============================================================
-- 5. Suspending and restoring
--
-- An RPC rather than a client UPDATE so the reason, the audit row and the
-- poster's notification always travel together. Returns JSONB so 182 can add
-- the id of the note it files without changing the signature.
-- ============================================================

CREATE OR REPLACE FUNCTION set_grant_suspension(
  p_grant UUID,
  p_suspended BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_grant  grants%ROWTYPE;
  v_notify UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF NOT has_permission(v_uid, 'grant:manage') THEN
    RAISE EXCEPTION 'only a funding administrator can suspend or restore a funding call'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_suspended AND v_reason IS NULL THEN
    RAISE EXCEPTION 'give a reason for the suspension' USING ERRCODE = 'check_violation';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'keep the reason under 2000 characters' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_grant FROM grants WHERE id = p_grant;
  IF v_grant.id IS NULL THEN
    RAISE EXCEPTION 'funding call not found';
  END IF;

  IF (v_grant.moderation_status = 'suspended') = p_suspended THEN
    RETURN jsonb_build_object('ok', TRUE, 'changed', FALSE, 'note_id', NULL);
  END IF;

  UPDATE grants SET
    moderation_status = CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END,
    suspension_reason = CASE WHEN p_suspended THEN v_reason ELSE NULL END,
    suspended_at      = CASE WHEN p_suspended THEN now() ELSE NULL END,
    suspended_by      = CASE WHEN p_suspended THEN v_uid ELSE NULL END,
    updated_at        = now()
  WHERE id = p_grant;

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, action, detail)
  VALUES (
    'admin', v_uid, v_grant.created_by, 'grant', p_grant,
    CASE WHEN p_suspended THEN 'suspended' ELSE 'restored' END,
    jsonb_build_object('reason', v_reason, 'title', v_grant.title)
  );

  -- The poster, or failing that (a call whose poster has left, 140) whoever
  -- created the organisation it was posted for.
  v_notify := v_grant.created_by;
  IF v_notify IS NULL AND v_grant.employer_id IS NOT NULL THEN
    SELECT e.created_by INTO v_notify FROM employers e WHERE e.id = v_grant.employer_id;
  END IF;

  IF v_notify IS NOT NULL THEN
    PERFORM send_notification(
      v_notify,
      CASE WHEN p_suspended THEN 'grant_suspended' ELSE 'grant_restored' END,
      CASE WHEN p_suspended THEN 'Your funding call was suspended' ELSE 'Your funding call is visible again' END,
      CASE WHEN p_suspended
        THEN left('KTIP suspended "' || v_grant.title || '". Reason: ' || v_reason, 1000)
        ELSE left('"' || v_grant.title || '" is visible to members again.', 1000)
      END,
      '/grants/' || coalesce(v_grant.slug, v_grant.id::TEXT)
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'changed', TRUE, 'note_id', NULL);
END;
$$;

COMMENT ON FUNCTION set_grant_suspension(UUID, BOOLEAN, TEXT) IS
  'Suspend (with a reason) or restore a funding call. grant:manage only. Logs to moderation_log and tells the poster.';

REVOKE ALL ON FUNCTION set_grant_suspension(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_grant_suspension(UUID, BOOLEAN, TEXT) TO authenticated;

-- ============================================================
-- 6. Applications are the poster's to decide
--
-- 012 created this policy and 116 re-keyed it to grant:manage. With it gone an
-- administrator's UPDATE on grant_applications matches no permissive policy.
-- Their SELECT policy ("OECS admins can view all applications") stays.
-- ============================================================

DROP POLICY IF EXISTS "OECS admins can update any application" ON grant_applications;

-- 130's function with the grant:manage arm removed. Everything else is
-- unchanged, including the two status triggers it relies on (046, 098).
CREATE OR REPLACE FUNCTION decide_grant_application(
  p_application UUID,
  p_status TEXT
)
RETURNS grant_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app grant_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF p_status NOT IN ('under_review', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'unsupported decision: %', p_status;
  END IF;

  SELECT * INTO v_app FROM grant_applications WHERE id = p_application;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  IF v_app.status = 'draft' THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  -- 181: the funder only. An administrator reads applications but no longer
  -- decides them.
  IF NOT is_grant_funder(v_app.grant_id, auth.uid()) THEN
    RAISE EXCEPTION 'only the organisation that posted this call can decide its applications';
  END IF;

  UPDATE grant_applications
     SET status = p_status,
         updated_at = now()
   WHERE id = p_application
  RETURNING * INTO v_app;

  RETURN v_app;
END;
$$;

COMMENT ON FUNCTION decide_grant_application(UUID, TEXT) IS
  'Sets an application''s status, for the funder who posted the call (is_grant_funder). Since 181 grant:manage no longer decides. Writes no other column.';

REVOKE ALL ON FUNCTION decide_grant_application(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_grant_application(UUID, TEXT) TO authenticated;

-- 149's function with the same arm removed: recording an award forces the
-- application to approved, so it is a decision too.
CREATE OR REPLACE FUNCTION public.record_grant_award(
  p_application UUID,
  p_amount      NUMERIC,
  p_currency    TEXT DEFAULT 'XCD'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_applicant UUID;
  v_grant     TEXT;
  v_grant_id  UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'grant:manage_funds') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_amount');
  END IF;

  SELECT ga.user_id, g.title, g.id INTO v_applicant, v_grant, v_grant_id
  FROM grant_applications ga
  JOIN grants g ON g.id = ga.grant_id
  WHERE ga.id = p_application;

  IF v_applicant IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT is_grant_funder(v_grant_id, auth.uid()) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_your_call');
  END IF;

  UPDATE grant_applications SET
    awarded_amount   = p_amount,
    awarded_currency = COALESCE(p_currency, 'XCD'),
    awarded_at       = now(),
    awarded_by       = auth.uid(),
    status           = 'approved',
    updated_at       = now()
  WHERE id = p_application;

  PERFORM send_notification(
    v_applicant, 'grant_awarded', 'Funding awarded',
    'Your application to "' || v_grant || '" has been awarded.',
    '/grants/applications'
  );

  RETURN jsonb_build_object('ok', TRUE, 'awarded_amount', p_amount);
END; $fn$;

COMMENT ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) IS
  'Record what was awarded on one application. Requires grant:manage_funds AND being the call''s funder (is_grant_funder). Since 181 grant:manage alone is not enough. Forces the application to approved.';

REVOKE ALL ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification
--
--   -- every existing call starts active
--   SELECT moderation_status, count(*) FROM grants GROUP BY 1;
--
--   -- as an administrator (not the poster): is_active moves, title does not
--   UPDATE grants SET is_active = NOT is_active WHERE id = '<id>';   -- ok
--   UPDATE grants SET title = title || '!'      WHERE id = '<id>';   -- 42501
--
--   -- as the poster: title moves, moderation_status does not
--   UPDATE grants SET moderation_status = 'active' WHERE id = '<id>'; -- 42501
--
--   -- no admin UPDATE policy left on applications
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'grant_applications' ORDER BY cmd, policyname;
--
--   -- a suspended call is gone from the feed index
--   SELECT count(*) FROM content_index ci JOIN grants g ON g.id = ci.id
--    WHERE ci.entity = 'grant' AND g.moderation_status = 'suspended';  -- 0
-- ============================================================
