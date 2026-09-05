-- Migration 130: the funder can read and decide the applications to their own call.
--
-- 129 gave a `grant:post` holder a form to publish a funding call with. This is
-- the other half of that transaction, and until now it did not exist for anyone
-- but the platform: `grant_applications` is readable by its own author and by
-- `grant:manage` (003, re-keyed by 116), and by nobody else. A funding agency
-- could post a call, watch the application count go up on the listing, and
-- never see a single application. Every decision had to be made by an OECS
-- administrator on the funder's behalf.
--
-- THIS IS ALSO A CONFORMANCE GAP, not only a feature one. The Grant Application
-- Confidentiality & IP document (src/lib/legal/application-confidentiality.ts,
-- effective 2026-09-01) tells every applicant, in "Who reads your application",
-- that their application is read by "the named funder — the organisation
-- running the call you applied to, as named on the grant listing". That promise
-- was not implementable: the named funder had no read path.
--
-- WHAT THE SAME DOCUMENT CONSTRAINS, and what is enforced below:
--
--   * "A draft is visible only to you until you submit it — the funder sees
--     nothing, not even that a draft exists." The funder's SELECT arm carries
--     `status <> 'draft'`, so a draft is not merely hidden field-by-field: the
--     row does not come back at all.
--   * "Submitting an application grants the funder the right to read, assess
--     and decide on it." Read, assess, decide — not edit. The funder never gets
--     an UPDATE policy on the table; they get decide_grant_application(), which
--     writes `status` and nothing else.
--   * "Not other funders, not partners, not the public." The arm is the call's
--     own creator, matched on grants.created_by, and nobody else.
--
-- NOT IMPLEMENTED HERE, deliberately: the retention clause ("funders and
-- reviewers lose access when the call closes and the decisions are final").
-- Expiring a funder's access to their own decision record is a policy question
-- about audit periods rather than a boolean, and cutting it off at the deadline
-- would take their own history with it. Access currently lasts as long as the
-- grant row does.
--
-- Also fixes one thing 129 half-shipped: the funder's grant page offers a
-- documents panel, but the entity_documents INSERT policy still admitted only
-- `grant:manage` on the 'grant' branch — so uploading to your own call failed
-- at RLS. parent_upload_paths() already had the owner arm (116); the INSERT
-- policy is where it was missing.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. Who counts as the funder of a call
--
-- The pair 077 established for grants, as one function: the creator, and only
-- while they still hold grant:post. Losing the permission closes the door on
-- the calls already posted, which is the whole reason the two are AND-ed.
--
-- SECURITY DEFINER because it is called from inside RLS policies on tables the
-- caller may not read: without it, a policy on grant_applications that reads
-- `grants` would be evaluated under the caller's own grants policy.
-- ============================================================

CREATE OR REPLACE FUNCTION is_grant_funder(p_grant UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND p_grant IS NOT NULL AND EXISTS (
    SELECT 1 FROM grants g
    WHERE g.id = p_grant
      AND g.created_by = p_user
  ) AND has_permission(p_user, 'grant:post');
$$;

COMMENT ON FUNCTION is_grant_funder(UUID, UUID) IS
  'The member who posted this funding call, while they still hold grant:post. NULL created_by (rows predating 077) matches nobody.';

REVOKE ALL ON FUNCTION is_grant_funder(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_grant_funder(UUID, UUID) TO authenticated;

-- ============================================================
-- 2. The funder reads submitted applications to their own call
--
-- A separate policy rather than a widened one: PostgreSQL ORs permissive
-- policies together, so the applicant's own arm and the administrator's arm
-- keep working untouched and this one can be dropped on its own if the access
-- model changes.
-- ============================================================

DROP POLICY IF EXISTS "Funders can view applications to their calls" ON grant_applications;
CREATE POLICY "Funders can view applications to their calls"
  ON grant_applications FOR SELECT
  USING (
    status <> 'draft'
    AND is_grant_funder(grant_id, auth.uid())
  );

-- The decision history that goes with it. Without this the funder's own
-- decisions come back as an empty timeline.
DROP POLICY IF EXISTS "Funders can view events on their applications" ON grant_application_events;
CREATE POLICY "Funders can view events on their applications"
  ON grant_application_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = application_id
        AND a.status <> 'draft'
        AND is_grant_funder(a.grant_id, auth.uid())
    )
  );

-- ============================================================
-- 3. Deciding an application
--
-- An RPC, not an UPDATE policy. A policy is row-level: giving the funder UPDATE
-- on grant_applications would let them rewrite application_data — the
-- applicant's own proposal — and no WITH CHECK can express "only the status
-- column moved". The function writes exactly one column, so "read, assess and
-- decide" stays what it says.
--
-- SECURITY DEFINER, but auth.uid() is unchanged inside it, which is what makes
-- the two existing status triggers keep working: 046 records the decision in
-- grant_application_events with changed_by = the funder, and 098 notifies the
-- applicant. Neither needed a change.
--
-- 'draft' and 'pending' are not reachable: a funder cannot un-submit somebody
-- else's application, and cannot walk a decision back to "not yet looked at".
-- Approved ⇄ rejected is allowed — a decision reversed on appeal is a real
-- thing, and the history table records both.
-- ============================================================

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

  -- A draft was never submitted, so there is nothing to decide and the funder
  -- is not supposed to know it exists. Same message as a missing row.
  IF v_app.status = 'draft' THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  IF NOT (
    is_grant_funder(v_app.grant_id, auth.uid())
    OR has_permission(auth.uid(), 'grant:manage')
  ) THEN
    RAISE EXCEPTION 'you do not run the call this application was made to';
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
  'Sets an application''s status, for the funder who posted the call or a grant:manage holder. Writes no other column — the applicant''s proposal is theirs.';

REVOKE ALL ON FUNCTION decide_grant_application(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_grant_application(UUID, TEXT) TO authenticated;

-- ============================================================
-- 4. Attachments follow the application
--
-- An application is its proposal plus what was attached to it; a funder who can
-- read one and not the other has been handed half a submission and no
-- explanation. Both document functions are restated from 116 with the funder
-- arm added — a function body cannot be patched in place — and the upload
-- policy with it, for the 'grant' branch 129 needed and did not have.
-- ============================================================

CREATE OR REPLACE FUNCTION can_view_document_parent(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'grant' THEN EXISTS (
      SELECT 1 FROM grants g
      WHERE g.id = p_entity_id
        AND (g.is_active = TRUE OR auth.uid() IS NOT NULL)
    )
    WHEN 'project' THEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_entity_id
        AND (
          p.is_public = TRUE
          OR p.owner_id = auth.uid()
          OR is_project_member(p.id, auth.uid())
        )
    )
    WHEN 'grant_application' THEN EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = p_entity_id
        AND (
          a.user_id = auth.uid()
          OR has_permission(auth.uid(), 'grant:manage')
          -- 130: the funder running the call reads what was attached to it —
          -- once it is submitted. A draft's attachments are as invisible as
          -- the draft, which is what the confidentiality document promises.
          OR (a.status <> 'draft' AND is_grant_funder(a.grant_id, auth.uid()))
        )
    )
    WHEN 'event' THEN EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_entity_id
        AND (
          e.status <> 'draft'
          OR e.organizer_id = auth.uid()
          OR has_permission(auth.uid(), 'event:manage')
        )
    )
    WHEN 'event_solution' THEN EXISTS (
      SELECT 1 FROM event_solutions s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = p_entity_id
        AND (
          s.author_id = auth.uid()
          OR e.organizer_id = auth.uid()
          OR has_permission(auth.uid(), 'event:manage')
          OR (e.status <> 'draft' AND COALESCE(event_entries_closed(e.id), FALSE))
        )
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION doc_access_role(p_document_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_visibility TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility, entity_type, entity_id
    INTO v_owner_id, v_visibility, v_entity_type, v_entity_id
  FROM entity_documents WHERE id = p_document_id;

  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id = v_owner_id THEN
    RETURN 'owner';
  END IF;

  -- Platform admins administer every document (090: was an inline 'oecs' test).
  -- Left as the role check on purpose: this branch grants EDIT rights over
  -- somebody else's file, which is the Super Admin's to have and nobody
  -- else's. A supervisor reaches the read-only branches below instead.
  IF p_user_id IS NOT NULL AND is_platform_admin(p_user_id) THEN
    RETURN 'owner';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM document_access
    WHERE document_id = p_document_id AND user_id = p_user_id;
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;

  -- Assessors read what applicants attach — read only, never edit. 130 adds
  -- the funder of the call beside the platform assessor, on the same terms.
  IF v_entity_type = 'grant_application' AND p_user_id IS NOT NULL AND (
    has_permission(p_user_id, 'grant:manage')
    OR EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = v_entity_id
        AND a.status <> 'draft'
        AND is_grant_funder(a.grant_id, p_user_id)
    )
  ) THEN
    RETURN 'viewer';
  END IF;

  -- Organizers read what entrants attach to their challenge.
  IF v_entity_type = 'event_solution' AND p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM event_solutions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = v_entity_id AND e.organizer_id = p_user_id
  ) THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'public' THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'members' AND p_user_id IS NOT NULL THEN
    RETURN 'viewer';
  END IF;

  -- 'private' and 'restricted' need an explicit grant
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "Members can upload documents" ON entity_documents;
CREATE POLICY "Members can upload documents"
  ON entity_documents FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND CASE entity_type
      -- 130: was grant:manage alone, which meant the funder who posted the
      -- call could not attach the call documents to it.
      WHEN 'grant' THEN (
        has_permission(auth.uid(), 'grant:manage')
        OR is_grant_funder(entity_id, auth.uid())
      )
      WHEN 'project' THEN (
        is_project_owner(entity_id, auth.uid())
        OR is_project_member(entity_id, auth.uid(), 'editor')
      )
      WHEN 'grant_application' THEN EXISTS (
        SELECT 1 FROM grant_applications a
        WHERE a.id = entity_id AND a.user_id = auth.uid()
      )
      WHEN 'event' THEN EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = entity_id
          AND (e.organizer_id = auth.uid() OR has_permission(auth.uid(), 'event:manage'))
      )
      WHEN 'event_solution' THEN EXISTS (
        SELECT 1 FROM event_solutions s
        JOIN events e ON e.id = s.event_id
        WHERE s.id = entity_id
          AND s.author_id = auth.uid()
          AND (e.submission_deadline IS NULL OR now() <= e.submission_deadline)
      )
      ELSE FALSE
    END
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 5. Verification
--
--   -- as the funder, with the applicant's uuid to hand:
--   SELECT id, status FROM grant_applications WHERE grant_id = '<call>';
--   -- expect: every submitted application, no drafts
--
--   SELECT decide_grant_application('<application>', 'under_review');
--   SELECT status, changed_by FROM grant_application_events
--    WHERE application_id = '<application>' ORDER BY created_at;
--   -- expect: the funder's uuid against the new row (046's trigger)
--
--   -- and the guard, as anyone else holding grant:post:
--   SELECT decide_grant_application('<application>', 'approved');
--   -- expect: ERROR  you do not run the call this application was made to
-- ============================================================
