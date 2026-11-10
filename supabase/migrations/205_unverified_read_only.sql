-- ============================================================================
-- 205_unverified_read_only.sql — an unverified account can look, not act
-- ============================================================================
--
-- 139 kept an unverified account from publishing and applying: eleven keys,
-- refused inside has_permission(). Everything that runs on ownership or
-- membership alone stayed open, so an unverified stranger could still RSVP,
-- send connection requests, reply in a thread someone else opened, start
-- documents and whiteboards, save grant application drafts, and walk into a
-- virtual venue with video, chat and a team Homebase.
--
-- Decided 2026-11-10: until verified, an account browses grants, events and
-- forums, manages its own profile, and nothing else. It may message staff
-- (a reviewer sorting out its verification), and no one else.
--
-- What this does:
--
--   1. is_staff_member(uid): the account holds an admin-tier role. Admin-tier
--      roles are granted by admins only, never self-assigned, so they are
--      already vetted.
--
--   2. is_verified_member() treats every staff seat as verified. 139 named
--      the three admin slugs; a programme or people supervisor who never went
--      through the queue would otherwise lose their own review tools to the
--      restrictive policies below. Still the RAW roles array, as 139 insisted:
--      an alias must not become a way around the gate.
--
--   3. Two more keys join verification_gated_permissions: project:manage and
--      grant:manage_funds. The remaining ungated keys are read keys
--      (grant:view, dm:receive) or administrative ones, which only staff hold.
--
--   4. RESTRICTIVE policies on the writes that no permission key covers. A
--      restrictive policy ANDs with every permissive one, so the existing
--      policies are left exactly as they are. Staff pass through
--      is_verified_member(), which is the admin escape 118 warns about.
--
--   5. Venue. One trigger on event_venue_members (fires inside join_venue's
--      SECURITY DEFINER too) plus is_venue_member() and venue_effective_role()
--      restated with the check, which also covers memberships that predate
--      this migration. Room chat, presence channels, the LiveKit grant, the
--      team Homebase, teams and quests all sit behind those two functions.
--
--   6. Messaging. A thread takes a new post only while it holds a staff
--      participant or every participant is verified. Only staff may add an
--      unverified account to a conversation. start_direct_conversation() is
--      restated to say 'unverified' instead of failing on RLS.
--
-- What stays open, on purpose (these are the routes TO verification, or a
-- safety line, and locking them would trap people):
--   verification_requests and its storage, institution_members (the school
--   claim), employers insert (the chamber and association route, 125/186),
--   the member's own profiles row, avatar and banner uploads, resumes,
--   feedback, content_reports, grievances, notifications.
--
-- What is NOT gated here, and why: reads. Published resources and their
-- files, member_profiles and the public lists are readable by anon already;
-- refusing them to a signed-in unverified account would protect nothing. The
-- client walls those pages instead.
--
-- Idempotent — safe to re-run. Requires 070, 085, 109, 133, 139, 165.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Staff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_staff_member(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_definitions rd ON rd.slug = ANY(p.roles)
    WHERE p.id = p_user
      AND rd.tier = 'admin'
  );
$$;

COMMENT ON FUNCTION is_staff_member(UUID) IS
  'TRUE if the account holds an admin-tier role (raw roles, no alias expansion). Staff count as verified and may message unverified accounts (205).';

REVOKE ALL ON FUNCTION is_staff_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_staff_member(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. is_verified_member — 139's body, staff seats widened to the admin tier
-- ---------------------------------------------------------------------------
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
  -- an alias must not become a way around the gate. 205 widened this from the
  -- three admin slugs to every admin-tier role.
  IF v_roles && ARRAY['oecs', 'admin', 'super_admin']::TEXT[] THEN
    RETURN TRUE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM role_definitions rd
    WHERE rd.slug = ANY(v_roles) AND rd.tier = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN v_verified;
END;
$$;

COMMENT ON FUNCTION is_verified_member(UUID) IS
  'TRUE if this account may act: verified, or holding an admin-tier seat (139, widened in 205).';

-- ---------------------------------------------------------------------------
-- 3. Two more gated keys
-- ---------------------------------------------------------------------------
INSERT INTO verification_gated_permissions (permission_key) VALUES
  ('project:manage'),
  ('grant:manage_funds')
ON CONFLICT (permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Restrictive policies on writes that no key covers
-- ---------------------------------------------------------------------------
-- Every predicate leads with is_verified_member(auth.uid()), which is TRUE for
-- staff, so no administrator loses a tool on deploy.

-- Events: no RSVP or registration. An organiser may not register an
-- unverified account on its behalf either.
DROP POLICY IF EXISTS "Verified members only: rsvp" ON event_rsvps;
CREATE POLICY "Verified members only: rsvp"
  ON event_rsvps AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()) AND is_verified_member(user_id));

DROP POLICY IF EXISTS "Verified members only: solutions" ON event_solutions;
CREATE POLICY "Verified members only: solutions"
  ON event_solutions AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

-- Grants: no drafts either. 111 let a draft through on grant:view alone.
DROP POLICY IF EXISTS "Verified members only: grant applications" ON grant_applications;
CREATE POLICY "Verified members only: grant applications"
  ON grant_applications AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

DROP POLICY IF EXISTS "Verified members only: edit grant applications" ON grant_applications;
CREATE POLICY "Verified members only: edit grant applications"
  ON grant_applications AS RESTRICTIVE FOR UPDATE
  USING (is_verified_member(auth.uid()));

-- Reaching members: connections both ways, join requests, mentorship asks.
DROP POLICY IF EXISTS "Verified members only: connect" ON connections;
CREATE POLICY "Verified members only: connect"
  ON connections AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()) AND is_verified_member(addressee_id));

DROP POLICY IF EXISTS "Verified members only: answer connections" ON connections;
CREATE POLICY "Verified members only: answer connections"
  ON connections AS RESTRICTIVE FOR UPDATE
  USING (is_verified_member(auth.uid()));

DROP POLICY IF EXISTS "Verified members only: join requests" ON project_join_requests;
CREATE POLICY "Verified members only: join requests"
  ON project_join_requests AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

DROP POLICY IF EXISTS "Verified members only: mentorship" ON mentorships;
CREATE POLICY "Verified members only: mentorship"
  ON mentorships AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()) AND is_verified_member(mentee_id));

-- Projects: walled for unverified accounts, so no likes or follows.
DROP POLICY IF EXISTS "Verified members only: like projects" ON project_likes;
CREATE POLICY "Verified members only: like projects"
  ON project_likes AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

DROP POLICY IF EXISTS "Verified members only: follow projects" ON project_follows;
CREATE POLICY "Verified members only: follow projects"
  ON project_follows AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

-- Collaborate: no new documents, whiteboards, snippets or proposals, and no
-- sharing one with an unverified account.
DROP POLICY IF EXISTS "Verified members only: documents" ON documents;
CREATE POLICY "Verified members only: documents"
  ON documents AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

DROP POLICY IF EXISTS "Verified members only: whiteboards" ON whiteboards;
CREATE POLICY "Verified members only: whiteboards"
  ON whiteboards AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

DROP POLICY IF EXISTS "Verified members only: snippets" ON snippets;
CREATE POLICY "Verified members only: snippets"
  ON snippets AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()));

-- 045 dropped the proposals table and nothing recreated it, so a bare
-- CREATE POLICY here fails with 42P01 and takes the whole migration with it.
-- Guarded: a database that still carries the table gets the rule, and every
-- other database skips it.
DO $$
BEGIN
  IF to_regclass('public.proposals') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Verified members only: proposals" ON proposals';
    EXECUTE 'CREATE POLICY "Verified members only: proposals"
      ON proposals AS RESTRICTIVE FOR INSERT
      WITH CHECK (is_verified_member(auth.uid()))';
  END IF;
END $$;

DROP POLICY IF EXISTS "Verified members only: share documents" ON document_shares;
CREATE POLICY "Verified members only: share documents"
  ON document_shares AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()) AND is_verified_member(shared_with));

DROP POLICY IF EXISTS "Verified members only: share whiteboards" ON whiteboard_shares;
CREATE POLICY "Verified members only: share whiteboards"
  ON whiteboard_shares AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()) AND is_verified_member(shared_with));

DROP POLICY IF EXISTS "Verified members only: share snippets" ON snippet_shares;
CREATE POLICY "Verified members only: share snippets"
  ON snippet_shares AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(auth.uid()) AND is_verified_member(shared_with));

-- ---------------------------------------------------------------------------
-- 5. Venue
-- ---------------------------------------------------------------------------
-- The trigger is what stops a new membership: join_venue() is SECURITY
-- DEFINER, so no RLS policy would see its INSERT.
CREATE OR REPLACE FUNCTION guard_venue_member_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_verified_member(NEW.user_id) THEN
    RAISE EXCEPTION 'verify your account to enter the venue'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_venue_member_verified ON event_venue_members;
CREATE TRIGGER guard_venue_member_verified
  BEFORE INSERT ON event_venue_members
  FOR EACH ROW EXECUTE FUNCTION guard_venue_member_verified();

-- 070's body plus the first clause. A membership from before 205, or from an
-- account whose verification lapsed or was revoked, stops counting at once.
-- SECURITY DEFINER is still load-bearing: event_venue_members' own SELECT
-- policy calls this.
CREATE OR REPLACE FUNCTION is_venue_member(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT is_verified_member(p_user) AND EXISTS (
    SELECT 1 FROM event_venue_members
    WHERE user_id = p_user AND event_id = p_event_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 109's body plus the first WHEN. venue_room_grant() reads this to decide
-- whether to mint a LiveKit token, so NULL here means no video.
CREATE OR REPLACE FUNCTION venue_effective_role(p_user UUID, p_room_id UUID)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN NOT is_verified_member(p_user) THEN NULL
    WHEN NOT EXISTS (
      SELECT 1 FROM event_venue_members m
      JOIN venue_rooms r ON r.event_id = m.event_id
      WHERE r.id = p_room_id AND m.user_id = p_user
    ) THEN NULL
    ELSE COALESCE(
      (SELECT rr.role FROM venue_room_roles rr
        WHERE rr.room_id = p_room_id AND rr.user_id = p_user),
      (SELECT m.role FROM event_venue_members m
        JOIN venue_rooms r ON r.event_id = m.event_id
        WHERE r.id = p_room_id AND m.user_id = p_user)
    )
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ---------------------------------------------------------------------------
-- 6. Messaging
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION conversation_allows_post(p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = p_conversation
        AND is_staff_member(cp.user_id)
    )
    OR NOT EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = p_conversation
        AND NOT is_verified_member(cp.user_id)
    );
$$;

COMMENT ON FUNCTION conversation_allows_post(UUID) IS
  'A thread takes posts while it holds a staff participant or every participant is verified (205).';

REVOKE ALL ON FUNCTION conversation_allows_post(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION conversation_allows_post(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Verified members only: post in threads" ON messages;
CREATE POLICY "Verified members only: post in threads"
  ON messages AS RESTRICTIVE FOR INSERT
  WITH CHECK (conversation_allows_post(conversation_id));

DROP POLICY IF EXISTS "Verified members only: join threads" ON conversation_participants;
CREATE POLICY "Verified members only: join threads"
  ON conversation_participants AS RESTRICTIVE FOR INSERT
  WITH CHECK (is_verified_member(user_id) OR is_staff_member(auth.uid()));

-- 165's body with one early return added, after the student check. Without it
-- a member messaging an unverified account met a bare RLS error from the
-- policy above.
CREATE OR REPLACE FUNCTION start_direct_conversation(p_other UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_existing UUID;
  v_conv     UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  v_existing := find_conversation_between(v_me, p_other);
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'conversation_id', v_existing);
  END IF;

  -- Safeguarding (064): a 1-to-1 thread may never contain a student.
  IF EXISTS (
    SELECT 1 FROM profiles
     WHERE id IN (v_me, p_other)
       AND 'student' = ANY(coalesce(roles, ARRAY[]::TEXT[]))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'student');
  END IF;

  -- Verification (205): only staff open a thread with an unverified account.
  IF NOT is_verified_member(p_other) AND NOT is_staff_member(v_me) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unverified');
  END IF;

  -- Privacy (083): a private member takes messages from connections only.
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_other AND profile_visibility = 'private')
     AND NOT EXISTS (
       SELECT 1 FROM connections
        WHERE status = 'accepted'
          AND ((requester_id = v_me AND addressee_id = p_other)
            OR (requester_id = p_other AND addressee_id = v_me))
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'private');
  END IF;

  v_conv := gen_random_uuid();
  INSERT INTO conversations (id, created_by) VALUES (v_conv, v_me);
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conv, v_me), (v_conv, p_other);

  RETURN jsonb_build_object('ok', TRUE, 'conversation_id', v_conv);
END;
$$;

REVOKE ALL ON FUNCTION start_direct_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_direct_conversation(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 7. Verification (read-only, run separately)
-- ---------------------------------------------------------------------------
--   -- Accounts this locks down (signed up, not verified, not staff):
--   SELECT count(*) FROM profiles p
--   WHERE roles <> '{}' AND NOT is_verified_member(p.id);
--
--   -- Staff seats that pass only because of the admin-tier widening:
--   SELECT p.id, p.display_name, p.roles FROM profiles p
--   WHERE NOT COALESCE(p.is_verified, FALSE) AND is_staff_member(p.id);
--
--   -- Full assertions: supabase/tests/205_unverified_read_only_test.sql
