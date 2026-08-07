-- ============================================================
-- 109: a role in one room, not always in the whole venue
-- ============================================================
--
-- event_venue_members.role (070, widened by 106) is one role for the whole
-- venue: make somebody a speaker and they hold the mic in every moderated room
-- there is. That is right for a judge and wrong for a speaker — the person
-- billed to talk in the Networking Area has no business bypassing the mode gate
-- on the main stage.
--
-- So a role may now be scoped to a room, with the venue-wide role as the
-- fallback:
--
--   venue_room_roles row for (room, user) → that is their role in that room
--   no row                                → event_venue_members.role, as before
--
-- "Everywhere" in the UI is not a third state. It writes the role to
-- event_venue_members and drops the per-room rows, which is exactly the
-- pre-109 behaviour — one less thing for the resolver to know about.
--
-- Only venue_room_grant() changes. enter_venue_room() (070) never consulted
-- roles at all — it gates on is_open and capacity — and the channel policies go
-- through is_venue_member(), which is about membership rather than role. This
-- migration therefore has exactly one authorization surface to get right.
--
-- Idempotent — safe to re-run.

-- ------------------------------------------------------------
-- 1. The table
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS venue_room_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised from the room so every policy on this table can ask
  -- is_venue_host() without a join. Kept honest by the trigger below.
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Same vocabulary as event_venue_members.role after 106. Deliberately not a
  -- shared domain: this table grants a role, it does not describe a membership,
  -- and a future role that only makes sense in one room belongs here alone.
  role TEXT NOT NULL CHECK (role IN (
    'participant', 'mentor', 'judge', 'organizer', 'spectator', 'speaker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One role per person per room. Changing it is an update, not a second row.
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_room_roles_event ON venue_room_roles(event_id);
-- The resolver's lookup, and the only one on the hot path.
CREATE INDEX IF NOT EXISTS idx_venue_room_roles_lookup ON venue_room_roles(room_id, user_id);

COMMENT ON TABLE venue_room_roles IS
  'Per-room override of event_venue_members.role. No row means the venue-wide role applies';

-- A row must name the room's own event, or the host gate on this table would be
-- asking about the wrong venue. Same shape as 108's guard, same reason: the
-- rule spans two tables, so a CHECK cannot say it.
CREATE OR REPLACE FUNCTION guard_venue_room_role_event()
RETURNS TRIGGER AS $$
DECLARE
  v_room_event UUID;
BEGIN
  SELECT event_id INTO v_room_event FROM venue_rooms WHERE id = NEW.room_id;

  IF v_room_event IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF v_room_event <> NEW.event_id THEN
    RAISE EXCEPTION 'that room belongs to a different event';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_venue_room_role_event_trigger ON venue_room_roles;
CREATE TRIGGER guard_venue_room_role_event_trigger
  BEFORE INSERT OR UPDATE ON venue_room_roles
  FOR EACH ROW
  EXECUTE FUNCTION guard_venue_room_role_event();

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------

ALTER TABLE venue_room_roles ENABLE ROW LEVEL SECURITY;

-- Everyone inside the venue can see who holds what where. The roster is
-- already visible to members (070) and a room that hands somebody the mic in
-- front of you is not a secret.
DROP POLICY IF EXISTS "Venue members can see room roles" ON venue_room_roles;
CREATE POLICY "Venue members can see room roles"
  ON venue_room_roles FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_venue_member(auth.uid(), event_id)
    OR is_venue_host(auth.uid(), event_id)
  );

-- Writes are the host's alone. There is no self-service arm on purpose: this
-- table decides who may publish in a moderated room, so a member who could
-- insert their own row could hand themselves the mic.
DROP POLICY IF EXISTS "Hosts can manage room roles" ON venue_room_roles;
CREATE POLICY "Hosts can manage room roles"
  ON venue_room_roles FOR ALL
  USING (is_venue_host(auth.uid(), event_id))
  WITH CHECK (is_venue_host(auth.uid(), event_id));

-- ------------------------------------------------------------
-- 3. The resolver
-- ------------------------------------------------------------
--
-- SECURITY DEFINER for the same reason is_venue_member() is: it reads
-- event_venue_members, whose own SELECT policy calls back into these helpers.

-- Membership is checked FIRST and a room role cannot substitute for it. A row
-- in venue_room_roles is a host saying "when you are here, you are a speaker" —
-- it is not an admission ticket, and reading it as one would hand a LiveKit
-- token to somebody enter_venue_room() would turn away at the door.
CREATE OR REPLACE FUNCTION venue_effective_role(p_user UUID, p_room_id UUID)
RETURNS TEXT AS $$
  SELECT CASE
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

COMMENT ON FUNCTION venue_effective_role(UUID, UUID) IS
  'The role this person holds in this room: the per-room override if there is one, else their venue-wide role. NULL when they are not in the venue at all — a room role never stands in for membership';

-- ------------------------------------------------------------
-- 4. venue_room_grant() asks the resolver instead of the roster
-- ------------------------------------------------------------
--
-- Restated from 106 with one line changed — the SELECT that fills v_role. Every
-- other clause is verbatim; see 101 and 106 for the reasoning behind each.

CREATE OR REPLACE FUNCTION venue_room_grant(p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_role TEXT;
  v_host BOOLEAN;
  v_present INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;

  -- The one change 109 makes. NULL still means "not in this venue": the
  -- resolver's fallback arm is the roster row, so no row anywhere is no role.
  v_role := venue_effective_role(v_user, p_room_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  v_host := is_venue_host(v_user, v_room.event_id);

  IF NOT v_room.is_open AND NOT v_host THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  -- Empty array means unrestricted. Hosts are never locked out of their own
  -- venue — same carve-out enter_venue_room() makes, deliberately duplicated
  -- rather than factored out, because the two functions answer different
  -- questions and coupling them would make a change to one silently change the
  -- other.
  --
  -- Note this now reads the per-room role, which is the point: giving somebody
  -- a role in a room is also how you let them past that room's door list.
  IF array_length(v_room.allowed_roles, 1) IS NOT NULL
     AND NOT (v_role = ANY(v_room.allowed_roles))
     AND NOT v_host THEN
    RAISE EXCEPTION 'this room is not open to %', v_role;
  END IF;

  -- Occupancy, NOT a count of live cameras — see migration 101 for why the
  -- over-estimate is the safe direction to be wrong in.
  SELECT COUNT(*) INTO v_present FROM event_venue_members
  WHERE current_room_id = p_room_id
    AND user_id <> v_user
    AND last_seen_at > now() - INTERVAL '2 minutes';

  RETURN jsonb_build_object(
    'room', v_room.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    -- `listen_only` and `moderated` gate publishing on WHO you are, and a
    -- speaker is the person those modes exist to hand the mic to: they bypass
    -- the mode gate like a host does. In an open room a speaker is subject to
    -- max_publishers like everyone else — the cap protects the bandwidth
    -- bill, and a speaker's camera costs the same as anyone's.
    'can_publish', CASE
      WHEN v_host THEN TRUE
      WHEN v_room.audio_mode IN ('listen_only', 'moderated') THEN v_role = 'speaker'
      WHEN v_present >= v_room.max_publishers THEN FALSE
      ELSE TRUE
    END,
    -- Data messages are always allowed. They carry reactions, raised hands and
    -- captions — none of which cost bandwidth worth capping, and all of which a
    -- listen-only participant still needs.
    'can_publish_data', TRUE,
    'is_host', v_host,
    'recording', v_room.recording_enabled,
    'audio_mode', v_room.audio_mode,
    'max_publishers', v_room.max_publishers
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 5. Grants
-- ------------------------------------------------------------

GRANT EXECUTE ON FUNCTION venue_effective_role(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 6. Verification (run separately; read-only)
-- ============================================================
--
-- 1. A per-room role wins over the venue-wide one:
--
--    SELECT venue_effective_role('<user>', '<room>');
--
--    Expect the venue_room_roles.role if a row exists, otherwise the
--    event_venue_members.role, otherwise NULL.
--
-- 2. A room role does not leak into the next room. With a user made 'speaker'
--    in one room only:
--
--    SELECT r.name, venue_effective_role('<user>', r.id)
--    FROM venue_rooms r WHERE r.event_id = '<event>';
--
--    Expect 'speaker' on exactly one row and their venue role on the rest.
