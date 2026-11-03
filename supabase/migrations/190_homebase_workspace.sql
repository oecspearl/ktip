-- Migration 190: Homebase workspace — team rooms open to their own team
--
-- 070 shut every room of kind 'team' out of realtime ("unreachable until 072
-- teaches it about teams"), and 072 never landed. 188 created teams. This
-- migration finishes the job:
--
--   1. One rule for who may use a team room: its team's members and the
--      venue's hosts. An unclaimed team room stays visitable, so people can
--      see it is free. The rule is applied at the door (enter_venue_room), on
--      the call token (venue_room_grant), on the room's realtime channel
--      (can_use_room_channel) and on the room's chat (read and post). One
--      helper, four call sites, so they cannot drift apart.
--   2. team_tasks   the Homebase task board (to do / doing / review / done).
--   3. team_boards  the Homebase whiteboard, saved as a tldraw snapshot.
--   4. team-files   a private storage bucket, one folder per team.
--   5. ydoc:team:<team id>  the team's own realtime channel, for whiteboard
--      edits and "the board changed" pings. 070 reserved the ydoc prefix and
--      denied it; this opens the one scope teams need.
--
-- Needs 188 (event_teams). Idempotent: safe to re-run.

-- ============================================================
-- 1. Who may use a room
-- ============================================================

CREATE OR REPLACE FUNCTION is_event_team_member(p_user UUID, p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_team_members WHERE team_id = p_team_id AND user_id = p_user
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Members of the team, or a host of the team's event.
CREATE OR REPLACE FUNCTION can_use_team(p_user UUID, p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND NOT is_suspended(p_user) AND EXISTS (
    SELECT 1 FROM event_teams t
    WHERE t.id = p_team_id
      AND (is_event_team_member(p_user, t.id) OR is_venue_host(p_user, t.event_id))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- TRUE for every non-team room (other rules still apply there), for an
-- unclaimed team room, and for a claimed one only to its team and hosts.
CREATE OR REPLACE FUNCTION can_access_venue_room(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_rooms r
    WHERE r.id = p_room_id
      AND (
        r.kind <> 'team'
        OR is_venue_host(p_user, r.event_id)
        OR NOT EXISTS (SELECT 1 FROM event_teams t WHERE t.homebase_room_id = r.id)
        OR EXISTS (
          SELECT 1 FROM event_teams t
          JOIN event_team_members m ON m.team_id = t.id
          WHERE t.homebase_room_id = r.id AND m.user_id = p_user
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION can_access_venue_room(UUID, UUID) IS
  'A claimed team room (Homebase) is for its team and the hosts. Every other room passes; its own rules still apply';

-- ---- the door (089 body + the team arm) ----
CREATE OR REPLACE FUNCTION enter_venue_room(p_room_id UUID)
RETURNS venue_rooms AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_role TEXT;
  v_here INT;
  v_host BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;

  SELECT role INTO v_role FROM event_venue_members
  WHERE event_id = v_room.event_id AND user_id = v_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  v_host := is_venue_host(v_user, v_room.event_id);

  IF NOT v_room.is_open AND NOT v_host THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  IF array_length(v_room.allowed_roles, 1) IS NOT NULL
     AND NOT (v_role = ANY(v_room.allowed_roles))
     AND NOT v_host THEN
    RAISE EXCEPTION 'this room is not open to %', v_role;
  END IF;

  IF NOT can_access_venue_room(v_user, p_room_id) THEN
    RAISE EXCEPTION 'this Homebase belongs to another team';
  END IF;

  IF v_room.capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO v_here FROM event_venue_members
    WHERE current_room_id = p_room_id
      AND user_id <> v_user
      AND last_seen_at > now() - INTERVAL '2 minutes';
    IF v_here >= v_room.capacity AND NOT v_host THEN
      RAISE EXCEPTION 'this room is full';
    END IF;
  END IF;

  UPDATE event_venue_members
  SET current_room_id = p_room_id, last_seen_at = now()
  WHERE event_id = v_room.event_id AND user_id = v_user;

  RETURN v_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---- the call token (109 body + the team arm) ----
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

  v_role := venue_effective_role(v_user, p_room_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;

  v_host := is_venue_host(v_user, v_room.event_id);

  IF NOT v_room.is_open AND NOT v_host THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  IF array_length(v_room.allowed_roles, 1) IS NOT NULL
     AND NOT (v_role = ANY(v_room.allowed_roles))
     AND NOT v_host THEN
    RAISE EXCEPTION 'this room is not open to %', v_role;
  END IF;

  -- A Homebase call is the team's call. Nobody else gets a token for it.
  IF NOT can_access_venue_room(v_user, p_room_id) THEN
    RAISE EXCEPTION 'this Homebase belongs to another team';
  END IF;

  SELECT COUNT(*) INTO v_present FROM event_venue_members
  WHERE current_room_id = p_room_id
    AND user_id <> v_user
    AND last_seen_at > now() - INTERVAL '2 minutes';

  RETURN jsonb_build_object(
    'room', v_room.id,
    'identity', v_user,
    'can_subscribe', TRUE,
    'can_publish', CASE
      WHEN v_host THEN TRUE
      WHEN v_room.audio_mode IN ('listen_only', 'moderated') THEN v_role = 'speaker'
      WHEN v_present >= v_room.max_publishers THEN FALSE
      ELSE TRUE
    END,
    'can_publish_data', TRUE,
    'is_host', v_host,
    'recording', v_room.recording_enabled,
    'audio_mode', v_room.audio_mode,
    'max_publishers', v_room.max_publishers
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---- the room channel: team rooms are no longer refused outright ----
CREATE OR REPLACE FUNCTION can_use_room_channel(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_rooms r
    WHERE r.id = p_room_id
      AND r.is_open
      AND is_venue_member(p_user, r.event_id)
      AND can_access_venue_room(p_user, r.id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ---- room chat: a Homebase's chat is the team's ----
DROP POLICY IF EXISTS "Venue members can read room chat" ON venue_room_messages;
CREATE POLICY "Venue members can read room chat"
  ON venue_room_messages FOR SELECT
  USING (
    (status = 'active' OR author_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND (
      is_venue_member(auth.uid(), event_id)
      OR is_venue_host(auth.uid(), event_id)
    )
    AND (
      can_access_venue_room(auth.uid(), room_id)
      OR has_permission(auth.uid(), 'moderation:view')
    )
  );

DROP POLICY IF EXISTS "Venue members can post to an open room" ON venue_room_messages;
CREATE POLICY "Venue members can post to an open room"
  ON venue_room_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND kind = 'chat'
    AND NOT is_suspended(auth.uid())
    AND can_access_venue_room(auth.uid(), room_id)
    AND EXISTS (
      SELECT 1 FROM venue_rooms r
      JOIN event_venue_members m
        ON m.event_id = r.event_id AND m.user_id = auth.uid()
      WHERE r.id = venue_room_messages.room_id
        AND r.is_open
        AND m.role <> 'spectator'
    )
  );

-- ============================================================
-- 2. Task board
-- ============================================================

CREATE TABLE IF NOT EXISTS team_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'review', 'done')),
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Fractional, so a card dropped between two others needs one write, not a
  -- renumbering of the whole column.
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_team ON team_tasks(team_id, status, position);

ALTER TABLE team_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can read its tasks" ON team_tasks;
CREATE POLICY "Team can read its tasks" ON team_tasks FOR SELECT
  USING (can_use_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Team can add tasks" ON team_tasks;
CREATE POLICY "Team can add tasks" ON team_tasks FOR INSERT
  WITH CHECK (can_use_team(auth.uid(), team_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Team can change tasks" ON team_tasks;
CREATE POLICY "Team can change tasks" ON team_tasks FOR UPDATE
  USING (can_use_team(auth.uid(), team_id))
  WITH CHECK (can_use_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Team can remove tasks" ON team_tasks;
CREATE POLICY "Team can remove tasks" ON team_tasks FOR DELETE
  USING (can_use_team(auth.uid(), team_id));

CREATE OR REPLACE FUNCTION touch_team_task()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS team_tasks_touch ON team_tasks;
CREATE TRIGGER team_tasks_touch BEFORE UPDATE ON team_tasks
  FOR EACH ROW EXECUTE FUNCTION touch_team_task();

-- ============================================================
-- 3. Whiteboard
-- ============================================================

-- One board per team. The live edits travel over ydoc:team:<id>; this row is
-- what a teammate who opens the board later loads.
CREATE TABLE IF NOT EXISTS team_boards (
  team_id UUID PRIMARY KEY REFERENCES event_teams(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 2MB of JSON is a very busy board. A cap keeps one runaway paste from
  -- turning every later load into a multi-megabyte download.
  CONSTRAINT team_boards_size CHECK (pg_column_size(snapshot) <= 2097152)
);

ALTER TABLE team_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can read its board" ON team_boards;
CREATE POLICY "Team can read its board" ON team_boards FOR SELECT
  USING (can_use_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Team can create its board" ON team_boards;
CREATE POLICY "Team can create its board" ON team_boards FOR INSERT
  WITH CHECK (can_use_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Team can save its board" ON team_boards;
CREATE POLICY "Team can save its board" ON team_boards FOR UPDATE
  USING (can_use_team(auth.uid(), team_id))
  WITH CHECK (can_use_team(auth.uid(), team_id));

-- ============================================================
-- 4. Team files
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('team-files', 'team-files', FALSE, 26214400) -- 25MB
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Team can read its files" ON storage.objects;
CREATE POLICY "Team can read its files" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'team-files'
    AND can_use_team(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Team can upload files" ON storage.objects;
CREATE POLICY "Team can upload files" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'team-files'
    AND can_use_team(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Team can remove files" ON storage.objects;
CREATE POLICY "Team can remove files" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'team-files'
    AND can_use_team(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

-- ============================================================
-- 5. The team channel: ydoc:team:<team id>
-- ============================================================

CREATE OR REPLACE FUNCTION can_use_ydoc_channel(p_user UUID, p_scope TEXT, p_ref_id UUID)
RETURNS BOOLEAN AS $$
  SELECT CASE p_scope
    WHEN 'team' THEN can_use_team(p_user, p_ref_id)
    ELSE FALSE
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 6. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION is_event_team_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_use_team(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_venue_room(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification (read-only)
-- ============================================================
--
--   -- As a member of Team Alpha: TRUE. As a member of another team: FALSE.
--   SELECT can_access_venue_room(auth.uid(), '<Team Alpha room id>');
--   SELECT can_use_channel(auth.uid(), 'ydoc:team:<Team Alpha id>');
