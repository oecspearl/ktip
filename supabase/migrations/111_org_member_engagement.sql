-- ============================================================
-- Migration 111: an organisation decides whether its own people may engage
--
-- Two layers, and the second exists only because the first is too blunt.
--
--   employers.allow_member_engagement is the master switch. FALSE and nobody
--   in that organisation applies for a grant, asks to join a project or
--   registers for an event, anywhere on the platform.
--
--   projects/grants/events.allow_member_engagement is the exception. NULL
--   inherits; TRUE and FALSE override, and only for members of the OWNING
--   organisation. It is what lets a locked-down employer still open its own
--   internal call to its staff, and what lets an open employer close one call
--   to the people who would otherwise be judging it.
--
-- The org -> item link did not exist. A project knew its owner_id (a person),
-- a grant its created_by, an event its organizer_id; none of them says which
-- organisation the thing belongs to, so there was nothing for the per-item
-- override to be an override OF.
--
-- Two things that had to be fixed to get here:
--
--   * 058's employer_members SELECT policy embeds a bare
--       EXISTS (SELECT 1 FROM employer_members m ...)
--     inside a policy ON employer_members. Postgres re-applies the policy to
--     that inner reference and raises 42P17 infinite recursion, which is why
--     the table has never been readable from a browser and why no roster UI
--     has ever existed. Rewritten below through a SECURITY DEFINER helper.
--
--   * Most employers have no employer_members rows at all — can_manage_employer
--     (081) has carried the registrant on employers.created_by alone. A switch
--     over an empty set governs nobody, so the registrant is backfilled as
--     'owner'.
--
-- Deliberately NOT touched: join_venue() (070/096). Someone already confirmed
-- keeps their seat. Closing the door and emptying the room mid-event are
-- different acts, and only the first one was asked for.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Preflight
--
-- 111 restates policies and function bodies from 058, 063, 064/110, 079, 081
-- and 096. Restating a policy against a schema that never received the earlier
-- migration fails halfway through with a column error that says nothing about
-- the real problem — which is what "column attendance_type does not exist"
-- (096) was. Fail here instead, naming what is missing.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- The ::TEXT casts are load-bearing: `text[] || 'literal'` resolves the
  -- untyped literal as an ARRAY, not an element, and fails with "malformed
  -- array literal".
  IF to_regclass('public.employer_members') IS NULL THEN
    v_missing := v_missing || '058 (employer_members)'::TEXT;
  END IF;
  IF to_regprocedure('public.has_permission(uuid, text)') IS NULL THEN
    v_missing := v_missing || '063 (has_permission)'::TEXT;
  END IF;
  IF to_regprocedure('public.enforce_grant_application_sponsor()') IS NULL THEN
    v_missing := v_missing || '064 (enforce_grant_application_sponsor)'::TEXT;
  END IF;
  IF to_regprocedure('public.decide_project_join_request(uuid, boolean)') IS NULL THEN
    v_missing := v_missing || '079 (project_join_requests)'::TEXT;
  END IF;
  IF to_regprocedure('public.can_manage_employer(uuid, uuid)') IS NULL THEN
    v_missing := v_missing || '081 (can_manage_employer)'::TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_rsvps' AND column_name = 'attendance_type'
  ) THEN
    v_missing := v_missing || '096 (event_rsvps.attendance_type)'::TEXT;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION E'111 needs earlier migrations that this database has not received: %.\nApply them in order, then re-run this file.',
      array_to_string(v_missing, ', ');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS allow_member_engagement BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN employers.allow_member_engagement IS
  'Master switch. FALSE means members of this organisation cannot apply for grants, request to join projects or register for events anywhere on the platform. Owners and admins are exempt; per-item flags on this organisation''s own rows can reopen or close individual items.';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES employers(id) ON DELETE SET NULL;
ALTER TABLE grants   ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES employers(id) ON DELETE SET NULL;
ALTER TABLE events   ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES employers(id) ON DELETE SET NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS allow_member_engagement BOOLEAN;
ALTER TABLE grants   ADD COLUMN IF NOT EXISTS allow_member_engagement BOOLEAN;
ALTER TABLE events   ADD COLUMN IF NOT EXISTS allow_member_engagement BOOLEAN;

COMMENT ON COLUMN projects.employer_id IS 'The organisation this project belongs to, or NULL for a personal project. ON DELETE SET NULL: removing an employer must not delete published work.';
COMMENT ON COLUMN grants.employer_id   IS 'The organisation this grant belongs to, or NULL. ON DELETE SET NULL: removing an employer must not delete published work.';
COMMENT ON COLUMN events.employer_id   IS 'The organisation this event belongs to, or NULL. ON DELETE SET NULL: removing an employer must not delete published work.';

COMMENT ON COLUMN projects.allow_member_engagement IS 'NULL inherits employers.allow_member_engagement of employer_id. TRUE/FALSE override it, for members of employer_id only.';
COMMENT ON COLUMN grants.allow_member_engagement   IS 'NULL inherits employers.allow_member_engagement of employer_id. TRUE/FALSE override it, for members of employer_id only.';
COMMENT ON COLUMN events.allow_member_engagement   IS 'NULL inherits employers.allow_member_engagement of employer_id. TRUE/FALSE override it, for members of employer_id only.';

-- An override that names no organisation binds nobody. Refuse the pair rather
-- than store a setting that silently does nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_engagement_override_needs_employer') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_engagement_override_needs_employer
      CHECK (allow_member_engagement IS NULL OR employer_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grants_engagement_override_needs_employer') THEN
    ALTER TABLE grants ADD CONSTRAINT grants_engagement_override_needs_employer
      CHECK (allow_member_engagement IS NULL OR employer_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_engagement_override_needs_employer') THEN
    ALTER TABLE events ADD CONSTRAINT events_engagement_override_needs_employer
      CHECK (allow_member_engagement IS NULL OR employer_id IS NOT NULL);
  END IF;
END $$;

-- Unindexed FKs: needed both for "what does my organisation own" and so that
-- deleting an employer does not seq-scan three tables.
CREATE INDEX IF NOT EXISTS idx_projects_employer ON projects(employer_id) WHERE employer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grants_employer   ON grants(employer_id)   WHERE employer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_employer   ON events(employer_id)   WHERE employer_id IS NOT NULL;

-- Every gate asks "does this actor belong to an organisation that has switched
-- engagement off". That set is tiny and almost always empty.
CREATE INDEX IF NOT EXISTS idx_employers_engagement_off
  ON employers (id) WHERE allow_member_engagement = FALSE;

-- ------------------------------------------------------------
-- 2. Membership, answered from outside row-level security
--
-- SECURITY DEFINER is what breaks 058's recursion loop: the body runs as the
-- owner and RLS does not re-enter. Same device 081 already used for
-- can_manage_employer().
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_employer_member(p_employer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_employer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM employer_members m
    WHERE m.employer_id = p_employer_id AND m.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_employer_member(UUID, UUID) TO anon, authenticated;

COMMENT ON FUNCTION is_employer_member(UUID, UUID) IS 'Roster membership without re-entering RLS. Exists so policies on employer_members can ask about employer_members without recursing (42P17).';

-- ------------------------------------------------------------
-- 3. The whole feature, in one predicate
--
-- Reading order is the design:
--
--   1. An explicit override on the item binds only members of the OWNING
--      organisation. To everyone else the item is ordinary.
--   2. FALSE on the item is absolute. It is the conflict-of-interest case —
--      "our own people do not sit on this" — and it binds owners and admins
--      too, because an owner is the most conflicted person in the room.
--   3. TRUE on the item lifts the OWNING organisation's master switch and
--      nothing else. Someone who also belongs to a second, locked-down
--      organisation stays locked down. Organisation A does not get to vote
--      away organisation B's policy by publishing an item.
--   4. With no override in play, the actor is blocked if ANY organisation they
--      belong to has the master switch off. Two memberships with opposite
--      settings resolve to the restrictive one: the permissive org loses
--      nothing it holds, the restrictive one would have its rule broken.
--   5. Owners and admins are exempt from the MASTER switch. It is a staff
--      policy, and the people who can flip it are not the people it is for;
--      after the backfill below the registrant IS a roster row, so without
--      this an SME owner switching off staff engagement would lock themselves
--      out of applying on the organisation's own behalf.
--
-- SECURITY DEFINER because it reads `employers`, whose SELECT policy is
-- members-and-admins-only. An invoker-rights version would silently answer
-- "allowed" for every organisation the caller cannot see — which is all of
-- them but their own — and the gate would be no gate.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION member_engagement_allowed(
  p_user_id UUID,
  p_item_employer_id UUID,
  p_item_override BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_item_override IS NOT NULL
     AND p_item_employer_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM employer_members m
       WHERE m.employer_id = p_item_employer_id AND m.user_id = p_user_id
     )
  THEN
    IF p_item_override = FALSE THEN
      RETURN FALSE;                                   -- rule 2
    END IF;

    RETURN NOT EXISTS (                               -- rule 3
      SELECT 1 FROM employer_members m
      JOIN employers e ON e.id = m.employer_id
      WHERE m.user_id = p_user_id
        AND e.allow_member_engagement = FALSE
        AND e.id <> p_item_employer_id
        AND m.role NOT IN ('owner', 'admin')
    );
  END IF;

  RETURN NOT EXISTS (                                 -- rules 4 + 5
    SELECT 1 FROM employer_members m
    JOIN employers e ON e.id = m.employer_id
    WHERE m.user_id = p_user_id
      AND e.allow_member_engagement = FALSE
      AND m.role NOT IN ('owner', 'admin')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION member_engagement_allowed(UUID, UUID, BOOLEAN) TO anon, authenticated;

COMMENT ON FUNCTION member_engagement_allowed(UUID, UUID, BOOLEAN) IS 'Authoritative engagement rule. src/lib/engagement.ts mirrors this for the UI; this one decides.';

-- Thin per-entity wrappers so the policies below stay one line and read like
-- English. A missing row yields no rows -> NULL -> the policy refuses, which is
-- the safe direction.

CREATE OR REPLACE FUNCTION can_engage_with_grant(p_grant_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT member_engagement_allowed(p_user_id, g.employer_id, g.allow_member_engagement)
  FROM grants g WHERE g.id = p_grant_id;
$$;

CREATE OR REPLACE FUNCTION can_engage_with_project(p_project_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT member_engagement_allowed(p_user_id, p.employer_id, p.allow_member_engagement)
  FROM projects p WHERE p.id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION can_engage_with_event(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT member_engagement_allowed(p_user_id, e.employer_id, e.allow_member_engagement)
  FROM events e WHERE e.id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION can_engage_with_grant(UUID, UUID)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_engage_with_project(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_engage_with_event(UUID, UUID)   TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. Gate: grant applications
--
-- Draft and submitted are the same row (useGrants.ts saveDraft upserts
-- status='draft', submitApplication UPDATEs it to 'pending'), so gating INSERT
-- alone would gate nothing. Both policies get the clause, and both keep 064's
-- deliberate split between "may prepare" and "may submit": a member of a
-- locked-down employer can still write an application, they just cannot file
-- one. Written OLD-free — WITH CHECK on UPDATE cannot see OLD, so the clause
-- says "whatever state this row is left in must be permitted".
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create applications" ON grant_applications;
CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_permission(auth.uid(), 'grant:apply')
      OR (status = 'draft' AND has_permission(auth.uid(), 'grant:view'))
    )
    AND (status = 'draft' OR can_engage_with_grant(grant_id, auth.uid()))
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
    AND (status = 'draft' OR can_engage_with_grant(grant_id, auth.uid()))
  );

-- The readable refusal. RLS gives an opaque 42501; this trigger already owns
-- the draft -> submitted transition, which is exactly the moment the switch is
-- about, and it is the only place in the stack that can say why in words.
-- Body is 110's, with one check added.
CREATE OR REPLACE FUNCTION enforce_grant_application_sponsor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT has_permission(NEW.user_id, 'grant:apply') THEN
    RAISE EXCEPTION 'this account is not permitted to submit grant applications';
  END IF;

  -- New in 111.
  IF NOT COALESCE(can_engage_with_grant(NEW.grant_id, NEW.user_id), FALSE) THEN
    RAISE EXCEPTION 'your organisation has turned off grant applications for its members';
  END IF;

  -- A nominated sponsor still has to be one. An application naming a sponsor
  -- who cannot sponsor would carry an endorsement that means nothing.
  IF NEW.sponsor_id IS NOT NULL
     AND NEW.sponsor_approved_at IS NOT NULL
     AND NOT has_permission(NEW.sponsor_id, 'grant:sponsor') THEN
    RAISE EXCEPTION 'the nominated sponsor is not permitted to sponsor applications';
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 5. Gate: project join requests
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Members can request to collaborate" ON project_join_requests;
CREATE POLICY "Members can request to collaborate"
  ON project_join_requests FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND NOT is_project_owner(project_id, auth.uid())
    AND NOT is_project_member(project_id, auth.uid())
    AND can_engage_with_project(project_id, auth.uid())
  );

-- Re-checked at decision time, not just at request time: a request filed the
-- day before the switch flipped must not walk through it. Body is 079's.
CREATE OR REPLACE FUNCTION decide_project_join_request(
  p_request_id UUID,
  p_approve BOOLEAN
)
RETURNS project_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request project_join_requests;
BEGIN
  SELECT * INTO v_request FROM project_join_requests WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT is_project_owner(v_request.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the project owner can decide join requests';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  -- New in 111.
  IF p_approve AND NOT COALESCE(
       can_engage_with_project(v_request.project_id, v_request.requester_id), FALSE) THEN
    RAISE EXCEPTION 'the requester''s organisation does not permit joining projects';
  END IF;

  IF p_approve THEN
    INSERT INTO project_members (project_id, user_id, role, status, invited_by)
    VALUES (v_request.project_id, v_request.requester_id, 'viewer', 'accepted', auth.uid())
    ON CONFLICT (project_id, user_id)
      DO UPDATE SET status = 'accepted', updated_at = now();
  END IF;

  UPDATE project_join_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION decide_project_join_request(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_project_join_request(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 6. Gate: event registration
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can request registration" ON event_rsvps;
CREATE POLICY "Authenticated users can request registration"
  ON event_rsvps FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND attendance_type IN ('participant', 'viewer')
    -- Unchanged from 002: the organizer does not register for their own event.
    AND NOT EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id
      AND organizer_id = auth.uid()
    )
    -- 096: a draft is not open yet and a cancelled event is not open any more.
    AND EXISTS (
      SELECT 1 FROM events
      WHERE id = event_id
      AND status = 'published'
    )
    AND can_engage_with_event(event_id, auth.uid())
  );

-- Same stale-request guard as projects. Body is 096's.
CREATE OR REPLACE FUNCTION decide_event_registration(
  p_rsvp_id UUID,
  p_approve BOOLEAN
)
RETURNS event_rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rsvp event_rsvps;
BEGIN
  SELECT * INTO v_rsvp FROM event_rsvps WHERE id = p_rsvp_id;

  IF v_rsvp.id IS NULL THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  -- is_venue_host (070) is organizer-or-platform-admin, which is exactly the
  -- set of people the Registrations tab is already open to.
  IF NOT is_venue_host(auth.uid(), v_rsvp.event_id) THEN
    RAISE EXCEPTION 'Only the organizer can decide registrations';
  END IF;

  IF v_rsvp.status <> 'pending' THEN
    RAISE EXCEPTION 'This registration has already been decided';
  END IF;

  -- New in 111.
  IF p_approve AND NOT COALESCE(
       can_engage_with_event(v_rsvp.event_id, v_rsvp.user_id), FALSE) THEN
    RAISE EXCEPTION 'the registrant''s organisation does not permit event registration';
  END IF;

  -- Approval is where the seat is actually taken, so this is where the cap is
  -- enforced. Viewers never consume one.
  IF p_approve
     AND v_rsvp.attendance_type = 'participant'
     AND is_event_full(v_rsvp.event_id) THEN
    RAISE EXCEPTION 'The participant cap is full — raise the capacity first';
  END IF;

  UPDATE event_rsvps
  SET status = CASE WHEN p_approve THEN 'confirmed' ELSE 'declined' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_rsvp_id
  RETURNING * INTO v_rsvp;

  RETURN v_rsvp;
END;
$$;

REVOKE ALL ON FUNCTION decide_event_registration(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_event_registration(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 7. Who may publish on behalf of an organisation
--
-- projects UPDATE is owner_id, events is organizer_id, grants is created_by +
-- grant:post — so owners can already set the new columns through the normal
-- path, and nothing there stops them naming an employer they have no
-- relationship with.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_item_employer_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed BOOLEAN;
BEGIN
  -- OLD is only assigned on UPDATE; reading it on INSERT raises "record old is
  -- not assigned yet", which is why this is an IF and not one expression.
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.employer_id IS NOT NULL;
  ELSE
    v_changed := NEW.employer_id IS NOT NULL AND NEW.employer_id IS DISTINCT FROM OLD.employer_id;
  END IF;

  IF v_changed AND NOT can_manage_employer(NEW.employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'you cannot publish this on behalf of an organisation you do not manage';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_employer_claim ON projects;
CREATE TRIGGER guard_project_employer_claim
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION guard_item_employer_claim();

DROP TRIGGER IF EXISTS guard_grant_employer_claim ON grants;
CREATE TRIGGER guard_grant_employer_claim
  BEFORE INSERT OR UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION guard_item_employer_claim();

DROP TRIGGER IF EXISTS guard_event_employer_claim ON events;
CREATE TRIGGER guard_event_employer_claim
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION guard_item_employer_claim();

-- ------------------------------------------------------------
-- 8. The roster becomes real
-- ------------------------------------------------------------

-- Was a self-referencing EXISTS, which recursed (42P17) and made the table
-- unreadable from any browser session.
DROP POLICY IF EXISTS "Members and admins can view employer members" ON employer_members;
CREATE POLICY "Members and admins can view employer members"
  ON employer_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_employer_member(employer_id, auth.uid())
    OR is_platform_admin(auth.uid())
  );

-- The registrant has never had a roster row; can_manage_employer has carried
-- them on created_by alone since 081. The Team page makes that invisible
-- authority visible, and the master switch needs a set of people to govern.
INSERT INTO employer_members (employer_id, user_id, role)
SELECT e.id, e.created_by, 'owner'
FROM employers e
WHERE e.created_by IS NOT NULL
ON CONFLICT (employer_id, user_id) DO NOTHING;

-- Reads are a policy; writes are RPCs. The invariants that force RPCs all span
-- sibling rows and cannot be said in WITH CHECK: "not the last owner", "only an
-- owner grants ownership", "the registrant is a manager without a roster row".
-- Same argument that produced guard_project_member_update in 079.

CREATE OR REPLACE FUNCTION employer_roster(p_employer_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  role TEXT,
  created_at TIMESTAMPTZ,
  display_name TEXT,
  avatar_url TEXT,
  country TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, m.role, m.created_at, p.display_name, p.avatar_url, p.country
  FROM employer_members m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.employer_id = p_employer_id
    AND (is_employer_member(p_employer_id, auth.uid()) OR is_platform_admin(auth.uid()))
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at;
$$;

REVOKE ALL ON FUNCTION employer_roster(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION employer_roster(UUID) TO authenticated;

-- Only an owner hands out ownership. An admin can build a team; it cannot
-- promote itself past the person who added it.
CREATE OR REPLACE FUNCTION is_employer_owner(p_employer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    is_platform_admin(p_user_id)
    OR EXISTS (SELECT 1 FROM employers e WHERE e.id = p_employer_id AND e.created_by = p_user_id)
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = p_employer_id AND m.user_id = p_user_id AND m.role = 'owner'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION is_employer_owner(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION add_employer_member(
  p_employer_id UUID,
  p_user_id UUID,
  p_role TEXT DEFAULT 'recruiter'
)
RETURNS employer_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row employer_members;
BEGIN
  IF NOT can_manage_employer(p_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'only an owner or admin of this organisation can manage its team';
  END IF;

  IF p_role NOT IN ('owner', 'admin', 'recruiter') THEN
    RAISE EXCEPTION 'unknown team role';
  END IF;

  IF p_role = 'owner' AND NOT is_employer_owner(p_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'only an owner can grant ownership';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'no such member';
  END IF;

  -- Idempotent by ON CONFLICT so "add someone already here" is a role change
  -- rather than a 23505 the caller has to interpret.
  INSERT INTO employer_members (employer_id, user_id, role)
  VALUES (p_employer_id, p_user_id, p_role)
  ON CONFLICT (employer_id, user_id) DO UPDATE SET role = EXCLUDED.role
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION add_employer_member(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_employer_member(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION set_employer_member_role(p_member_id UUID, p_role TEXT)
RETURNS employer_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row employer_members;
BEGIN
  SELECT * INTO v_row FROM employer_members WHERE id = p_member_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'team member not found';
  END IF;

  IF NOT can_manage_employer(v_row.employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'only an owner or admin of this organisation can manage its team';
  END IF;

  IF p_role NOT IN ('owner', 'admin', 'recruiter') THEN
    RAISE EXCEPTION 'unknown team role';
  END IF;

  IF v_row.user_id = auth.uid() AND NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'ask another owner to change your own role';
  END IF;

  IF (p_role = 'owner' OR v_row.role = 'owner')
     AND NOT is_employer_owner(v_row.employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'only an owner can grant or revoke ownership';
  END IF;

  IF v_row.role = 'owner' AND p_role <> 'owner'
     AND (SELECT count(*) FROM employer_members m
          WHERE m.employer_id = v_row.employer_id AND m.role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'an organisation needs at least one owner — appoint another first';
  END IF;

  UPDATE employer_members SET role = p_role WHERE id = p_member_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION set_employer_member_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_member_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION remove_employer_member(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row employer_members;
BEGIN
  SELECT * INTO v_row FROM employer_members WHERE id = p_member_id;
  IF v_row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Leaving on your own account is always allowed; removing someone else is
  -- team management.
  IF v_row.user_id <> auth.uid()
     AND NOT can_manage_employer(v_row.employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'only an owner or admin of this organisation can manage its team';
  END IF;

  IF v_row.role = 'owner'
     AND (SELECT count(*) FROM employer_members m
          WHERE m.employer_id = v_row.employer_id AND m.role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'an organisation needs at least one owner — appoint another first';
  END IF;

  DELETE FROM employer_members WHERE id = p_member_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION remove_employer_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION remove_employer_member(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 9. Reading and writing the switch from outside the admin console
-- ------------------------------------------------------------

-- 058 left `employers` with no member-facing UPDATE policy on purpose, and 081
-- restated why: a row editable after verification puts attacker-controlled data
-- behind a verified badge. This writes one column and nothing else, so the
-- policy stays absent. Kept apart from update_my_employer_profile() for the
-- same reason setSharing is kept apart from verification — neither should be
-- flippable by accident while editing the other.
CREATE OR REPLACE FUNCTION set_employer_member_engagement(p_employer_id UUID, p_allow BOOLEAN)
RETURNS employers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row employers;
BEGIN
  IF NOT can_manage_employer(p_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'only an owner or admin of this organisation can change this';
  END IF;

  UPDATE employers SET allow_member_engagement = p_allow
  WHERE id = p_employer_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'organisation not found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION set_employer_member_engagement(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employer_member_engagement(UUID, BOOLEAN) TO authenticated;

-- useMyEmployer matched created_by only, so an owner added to employer_members
-- but not the registrant could not reach the org pages at all — and
-- public_employer_for_user, the one creator-or-member read that exists, returns
-- a deliberately trimmed column list that will never carry this flag.
CREATE OR REPLACE FUNCTION my_employer()
RETURNS SETOF employers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.* FROM employers e
  WHERE e.created_by = auth.uid() OR is_employer_member(e.id, auth.uid())
  ORDER BY e.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION my_employer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_employer() TO authenticated;

-- What the UI needs to say WHY, not just that. One call per session: the client
-- evaluates the same rule locally for every card in a list without a round trip
-- per item, and can name the organisation in the message — which RLS never can.
CREATE OR REPLACE FUNCTION my_employer_engagement()
RETURNS TABLE (
  employer_id UUID,
  legal_name TEXT,
  slug TEXT,
  member_role TEXT,
  allow_member_engagement BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.legal_name, e.slug, m.role, e.allow_member_engagement
  FROM employer_members m
  JOIN employers e ON e.id = m.employer_id
  WHERE m.user_id = auth.uid()
  ORDER BY e.legal_name;
$$;

REVOKE ALL ON FUNCTION my_employer_engagement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_employer_engagement() TO authenticated;

-- ============================================================
-- Verification
--
--   SELECT allow_member_engagement FROM employers LIMIT 5;              -- all t
--   SELECT count(*) FROM employer_members WHERE role = 'owner';         -- >= employers with created_by
--   SELECT proname FROM pg_proc WHERE proname LIKE 'can_engage_with_%'; -- 3 rows
--   SELECT member_engagement_allowed('<uid>', NULL, NULL);              -- t for an unaffiliated user
--   SELECT count(*) FROM employer_members;                              -- does not raise 42P17
-- ============================================================

NOTIFY pgrst, 'reload schema';
