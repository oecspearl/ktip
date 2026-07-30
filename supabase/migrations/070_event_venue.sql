-- Migration 070: Generic event venue — rooms, membership, presence, room chat
--
-- A virtual hackathon needs a place, not just a listing. This adds one: a
-- floorplan of named rooms, a membership roster, per-user availability, and
-- chat scoped to a room.
--
-- WHY THIS IS GENERIC, NOT "hackathon_*"
-- ---------------------------------------
-- A conference wants a networking area. A workshop wants a help desk. Nothing
-- in this migration knows what a team is. Layer 2 (teams, submissions,
-- judging — migrations 072+) may reference these tables; these tables must
-- never reference Layer 2. That one-directional FK is the whole reason
-- hackathon_teams.homebase_room_id points at venue_rooms and not the reverse.
-- Like 062's has_challenge, the flag is what turns the venue on, not the type.
--
-- WHY realtime.messages RLS IS IN THIS MIGRATION AND NOT A LATER ONE
-- ------------------------------------------------------------------
-- Supabase broadcast and presence channels are UNAUTHENTICATED by default.
-- Anyone holding the (public) anon key can subscribe to a channel if they can
-- guess its topic, and a topic here is a table UUID. Without the policies in
-- section 6, a non-participant could sit on room:<uuid> and read a room's chat
-- in real time, and — once 073 lands — on ydoc:team_whiteboard:<uuid> and read
-- or corrupt another team's work. RLS cannot inspect a CRDT delta, so ACCESS
-- is the only control there is. It has to exist before the first channel does.
--
-- can_use_channel() is a dispatcher over topic prefixes that delegates to one
-- leaf function per prefix. Later migrations CREATE OR REPLACE only the leaf
-- they extend (072 teaches can_use_room_channel about team rooms, 073 teaches
-- can_use_ydoc_channel about documents), never the dispatcher.
--
-- WHY availability LIVES IN TWO PLACES
-- ------------------------------------
-- Supabase Presence is the hot path — sub-second, drives every avatar dot, and
-- authoritative while a client is connected. It cannot do three things:
-- paint before the channel syncs, show a teammate's status to someone who is
-- not on the venue channel, or answer "who was here, and where" afterwards.
-- So event_venue_members.availability is a cold mirror, written by
-- venue_heartbeat() at most every 45s. The client reducer resolves conflicts:
-- live presence always wins, the row is only used for users with no presence
-- entry, and only if last_seen_at is inside two minutes.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. Venue flags on events
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS has_venue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_floorplan_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_opens_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_closes_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS spectators_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS spectator_scope TEXT NOT NULL DEFAULT 'members';

-- CHECK added separately so a re-run on an existing column still gets it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_spectator_scope_check') THEN
    ALTER TABLE events ADD CONSTRAINT events_spectator_scope_check
      CHECK (spectator_scope IN ('members', 'registered', 'public'));
  END IF;
END $$;

COMMENT ON COLUMN events.has_venue IS 'Event runs a live virtual venue (floorplan, rooms, presence)';
COMMENT ON COLUMN events.venue_floorplan_url IS 'Hand-authored SVG in the event-assets bucket; room.svg_zone_id maps rows to its id attributes';
COMMENT ON COLUMN events.venue_opens_at IS 'Non-organizers cannot enter before this; NULL means always open';
COMMENT ON COLUMN events.spectator_scope IS 'members = any signed-in KTIP account may spectate. registered/public reserved for later phases';

-- ============================================================
-- 2. Rooms
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Stable slug. Deep links and default-room lookups use this, never the name.
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'breakout' CHECK (kind IN (
    'main_hall', 'networking', 'workshop', 'help_desk',
    'sponsor_booth', 'team', 'judging', 'stage', 'breakout')),
  description TEXT,
  -- The id attribute of a <g>/<rect> in the event's floorplan SVG. Text, not a
  -- geometry: the host draws the map, we only need to know which shape is which
  -- room. Deliberately not x/y — see the walking-mode note in section 5.
  svg_zone_id TEXT,
  capacity INT CHECK (capacity IS NULL OR capacity > 0),
  -- Audio/video policy. Consumed by venue_room_grant() in 071; stored here so
  -- the host authors it once alongside everything else about the room.
  audio_mode TEXT NOT NULL DEFAULT 'open' CHECK (audio_mode IN ('open', 'moderated', 'listen_only')),
  max_publishers INT NOT NULL DEFAULT 12 CHECK (max_publishers > 0),
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  sponsor_name TEXT,
  sponsor_logo_url TEXT,
  sponsor_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, key)
);

CREATE INDEX IF NOT EXISTS idx_venue_rooms_event ON venue_rooms(event_id, sort_order);

COMMENT ON TABLE venue_rooms IS 'Rooms in an event venue. Has no team_id — hackathon_teams points here instead, which is what keeps the venue reusable by non-hackathon events';
COMMENT ON COLUMN venue_rooms.recording_enabled IS 'Host opt-in per room. Never default true: a silent recording of a room containing a student is a safeguarding incident';

-- ============================================================
-- 3. Membership + the cold presence mirror
-- ============================================================

CREATE TABLE IF NOT EXISTS event_venue_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN (
    'participant', 'mentor', 'judge', 'organizer', 'spectator')),
  availability TEXT NOT NULL DEFAULT 'working' CHECK (availability IN (
    'working', 'away', 'busy', 'help_wanted', 'offline')),
  status_note TEXT,
  current_room_id UUID REFERENCES venue_rooms(id) ON DELETE SET NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  looking_for_team BOOLEAN NOT NULL DEFAULT TRUE,
  is_discoverable BOOLEAN NOT NULL DEFAULT TRUE,
  -- Escape hatch. A future walking mode writes {"x": 120, "y": 340} here and
  -- needs no migration; the presence payload already reserves a `pos` field
  -- that v:1 readers ignore.
  meta JSONB NOT NULL DEFAULT '{}',
  first_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_members_seen ON event_venue_members(event_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_members_room ON event_venue_members(event_id, current_room_id);
CREATE INDEX IF NOT EXISTS idx_venue_members_user ON event_venue_members(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_members_discover
  ON event_venue_members(event_id) WHERE looking_for_team AND is_discoverable;

COMMENT ON TABLE event_venue_members IS 'Roster for an event venue plus a 45s-throttled mirror of live presence';
COMMENT ON COLUMN event_venue_members.meta IS 'Extension point (x/y for a future walking map). Never read by RLS';
COMMENT ON COLUMN event_venue_members.availability IS 'Cold mirror. Live Supabase Presence wins whenever a client is connected';

-- ============================================================
-- 4. Room chat
-- ============================================================

-- Structurally room-scoped: a message belongs to a room, never to a pair of
-- users. That is deliberate. Migration 064 hard-blocks 1:1 DMs for the student
-- role inside has_permission(), and a venue full of new chat surfaces is
-- exactly how that safeguard gets accidentally routed around. There is no
-- shape here that could become a DM.
CREATE TABLE IF NOT EXISTS venue_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES venue_rooms(id) ON DELETE CASCADE,
  -- Denormalised so the RLS predicate is one join, not two. Set by trigger.
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'system')),
  reply_to UUID REFERENCES venue_room_messages(id) ON DELETE SET NULL,
  is_removed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_room_messages_room
  ON venue_room_messages(room_id, created_at DESC);

COMMENT ON TABLE venue_room_messages IS 'Chat scoped to a venue room. Cannot express a 1:1 conversation by construction';

CREATE OR REPLACE FUNCTION venue_room_message_event_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT event_id INTO NEW.event_id FROM venue_rooms WHERE id = NEW.room_id;
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'room % does not exist', NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS venue_room_message_event_id_trigger ON venue_room_messages;
CREATE TRIGGER venue_room_message_event_id_trigger
  BEFORE INSERT ON venue_room_messages
  FOR EACH ROW
  EXECUTE FUNCTION venue_room_message_event_id();

-- ============================================================
-- 5. Predicates
-- ============================================================

-- SECURITY DEFINER is load-bearing, not decoration: event_venue_members' own
-- SELECT policy calls this. A plain function would re-enter RLS and recurse.
CREATE OR REPLACE FUNCTION is_venue_member(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_venue_members
    WHERE user_id = p_user AND event_id = p_event_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_venue_host(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND organizer_id = p_user)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND 'oecs' = ANY(roles))
    OR has_permission(p_user, 'org:manage')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_venue_host(UUID, UUID) IS 'Organizer of this event, or a platform admin. The legacy oecs slug is kept because expand_roles() maps it to super_admin and ~60 existing policies still test it';

-- ============================================================
-- 6. Channel authorization — the reason this migration is 070
-- ============================================================

-- venue:{eventId} — the single presence channel for a whole venue. One channel,
-- not one per room: Supabase Presence hands every subscriber the complete
-- state, so per-room occupancy is a client-side groupBy and nobody has to
-- subscribe to eight channels to draw one floorplan.
CREATE OR REPLACE FUNCTION can_use_venue_channel(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT is_venue_member(p_user, p_event_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- room:{roomId} — chat and awareness for one room.
-- 072 replaces this to add the team-room arm; team-kind rooms are unreachable
-- until then, which is correct because no team can exist yet.
CREATE OR REPLACE FUNCTION can_use_room_channel(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_rooms r
    WHERE r.id = p_room_id
      AND r.is_open
      AND r.kind <> 'team'
      AND is_venue_member(p_user, r.event_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ydoc:{scope}:{refId} and yaware:{scope}:{refId} — CRDT deltas and awareness.
-- Denies everything until 073 creates collab_ydocs and replaces this. Failing
-- closed is the only safe default for a channel nobody is using yet.
CREATE OR REPLACE FUNCTION can_use_ydoc_channel(p_user UUID, p_scope TEXT, p_ref_id UUID)
RETURNS BOOLEAN AS $$
  SELECT FALSE;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- The dispatcher. Later migrations replace the leaves above, never this.
-- plpgsql with an exception block because realtime.topic() is attacker-supplied
-- text: 'room:not-a-uuid' must be FALSE, not a 500.
CREATE OR REPLACE FUNCTION can_use_channel(p_user UUID, p_topic TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_prefix TEXT;
BEGIN
  IF p_user IS NULL OR p_topic IS NULL THEN
    RETURN FALSE;
  END IF;
  IF is_suspended(p_user) THEN
    RETURN FALSE;
  END IF;

  v_prefix := split_part(p_topic, ':', 1);

  CASE v_prefix
    WHEN 'venue' THEN
      RETURN can_use_venue_channel(p_user, split_part(p_topic, ':', 2)::uuid);
    WHEN 'room' THEN
      RETURN can_use_room_channel(p_user, split_part(p_topic, ':', 2)::uuid);
    WHEN 'ydoc', 'yaware' THEN
      RETURN can_use_ydoc_channel(
        p_user, split_part(p_topic, ':', 2), split_part(p_topic, ':', 3)::uuid);
    ELSE
      RETURN FALSE;
  END CASE;
EXCEPTION WHEN OTHERS THEN
  -- Malformed topic, missing uuid segment, anything. Deny.
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION can_use_channel(UUID, TEXT) IS 'Topic dispatcher for realtime.messages RLS. Unknown or malformed topics deny';

-- Only channels created with { config: { private: true } } are checked against
-- these policies. The existing postgres_changes subscriptions in
-- useMessages.ts and useNotifications.ts are unaffected.
--
-- realtime.messages is owned by supabase_admin, not by the role the dashboard
-- SQL editor runs as, so a bare ALTER TABLE here fails with
-- "must be owner of table messages" and takes the whole migration with it.
-- Supabase enables RLS on that table by default, so the ALTER is normally a
-- no-op anyway — it is attempted only if RLS is actually off, and a privilege
-- error is downgraded to a warning.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages' AND c.relrowsecurity
  ) THEN
    BEGIN
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      RAISE NOTICE 'Enabled RLS on realtime.messages.';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'RLS is OFF on realtime.messages and this role cannot enable it. Private channels will NOT be access-controlled. Enable it from the Supabase dashboard (Database > Tables > realtime.messages) before opening a venue.';
    END;
  END IF;
END $$;

-- Policies are created through EXECUTE inside a guarded block for the same
-- ownership reason. Failing closed is safe: with RLS on and no policy, a
-- private channel subscribe is denied, so a missing policy breaks the venue
-- rather than exposing it.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Venue channels require membership" ON realtime.messages';
  EXECUTE 'CREATE POLICY "Venue channels require membership" ON realtime.messages '
       || 'FOR SELECT TO authenticated USING (can_use_channel(auth.uid(), realtime.topic()))';

  EXECUTE 'DROP POLICY IF EXISTS "Venue channels require write membership" ON realtime.messages';
  EXECUTE 'CREATE POLICY "Venue channels require write membership" ON realtime.messages '
       || 'FOR INSERT TO authenticated WITH CHECK (can_use_channel(auth.uid(), realtime.topic()))';

  RAISE NOTICE 'Channel authorization policies installed on realtime.messages.';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Could not create the channel policies on realtime.messages (need table owner). Run section 6''s two CREATE POLICY statements as supabase_admin. Until then private channels deny everyone and the venue will not connect.';
  WHEN undefined_function THEN
    RAISE WARNING 'realtime.topic() does not exist on this project — Realtime Authorization is unavailable. Upgrade the realtime extension before opening a venue.';
END $$;

-- ============================================================
-- 7. RLS — venue_rooms (the 062 trio)
-- ============================================================

ALTER TABLE venue_rooms ENABLE ROW LEVEL SECURITY;

-- Non-draft, not just published: the floorplan stays readable after an event
-- completes so a spectator can still see where things happened.
DROP POLICY IF EXISTS "Anyone can view rooms of non-draft events" ON venue_rooms;
CREATE POLICY "Anyone can view rooms of non-draft events"
  ON venue_rooms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = venue_rooms.event_id
        AND events.status <> 'draft'
    )
  );

DROP POLICY IF EXISTS "Organizers can manage their venue rooms" ON venue_rooms;
CREATE POLICY "Organizers can manage their venue rooms"
  ON venue_rooms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = venue_rooms.event_id
        AND events.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = venue_rooms.event_id
        AND events.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "OECS admins can manage all venue rooms" ON venue_rooms;
CREATE POLICY "OECS admins can manage all venue rooms"
  ON venue_rooms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 'oecs' = ANY(profiles.roles)
    )
  );

-- ============================================================
-- 8. RLS — event_venue_members
-- ============================================================

ALTER TABLE event_venue_members ENABLE ROW LEVEL SECURITY;

-- Everyone inside a venue can see everyone else inside it. That is the point of
-- a networking area, and it is the same information the presence channel is
-- already broadcasting.
DROP POLICY IF EXISTS "Venue members can view the roster" ON event_venue_members;
CREATE POLICY "Venue members can view the roster"
  ON event_venue_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_venue_member(auth.uid(), event_id)
    OR is_venue_host(auth.uid(), event_id)
  );

-- No INSERT policy on purpose. Joining goes through join_venue(), which is what
-- decides whether you are a participant, a judge or a spectator. A client that
-- could insert its own row could make itself an organizer.
DROP POLICY IF EXISTS "Members can update their own venue row" ON event_venue_members;
CREATE POLICY "Members can update their own venue row"
  ON event_venue_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can leave a venue" ON event_venue_members;
CREATE POLICY "Members can leave a venue"
  ON event_venue_members FOR DELETE
  USING (user_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

DROP POLICY IF EXISTS "Hosts can manage the venue roster" ON event_venue_members;
CREATE POLICY "Hosts can manage the venue roster"
  ON event_venue_members FOR ALL
  USING (is_venue_host(auth.uid(), event_id))
  WITH CHECK (is_venue_host(auth.uid(), event_id));

-- WITH CHECK cannot see OLD, so role escalation is blocked by a trigger rather
-- than by the policy: the self-update policy above would otherwise let anyone
-- set their own role to 'organizer'.
CREATE OR REPLACE FUNCTION guard_venue_member_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role AND NOT is_venue_host(auth.uid(), OLD.event_id) THEN
    NEW.role := OLD.role;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_venue_member_role_trigger ON event_venue_members;
CREATE TRIGGER guard_venue_member_role_trigger
  BEFORE UPDATE ON event_venue_members
  FOR EACH ROW
  EXECUTE FUNCTION guard_venue_member_role();

-- ============================================================
-- 9. RLS — venue_room_messages
-- ============================================================

ALTER TABLE venue_room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can read room chat" ON venue_room_messages;
CREATE POLICY "Venue members can read room chat"
  ON venue_room_messages FOR SELECT
  USING (
    is_venue_member(auth.uid(), event_id)
    OR is_venue_host(auth.uid(), event_id)
  );

-- Spectators are deliberately excluded from posting: they are watching, not
-- participating. Suspension is checked here as well as in has_permission()
-- because this is a write path that does not go through a permission key.
DROP POLICY IF EXISTS "Venue members can post to an open room" ON venue_room_messages;
CREATE POLICY "Venue members can post to an open room"
  ON venue_room_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND kind = 'chat'
    AND NOT is_suspended(auth.uid())
    AND EXISTS (
      SELECT 1 FROM venue_rooms r
      JOIN event_venue_members m
        ON m.event_id = r.event_id AND m.user_id = auth.uid()
      WHERE r.id = venue_room_messages.room_id
        AND r.is_open
        AND m.role <> 'spectator'
    )
  );

-- Soft delete only. UPDATE is intentionally not granted to authors: an edited
-- chat line in a moderated venue is worse than an unedited one.
DROP POLICY IF EXISTS "Authors and hosts can remove a message" ON venue_room_messages;
CREATE POLICY "Authors and hosts can remove a message"
  ON venue_room_messages FOR UPDATE
  USING (author_id = auth.uid() OR is_venue_host(auth.uid(), event_id))
  WITH CHECK (author_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

DROP POLICY IF EXISTS "Hosts can delete room messages" ON venue_room_messages;
CREATE POLICY "Hosts can delete room messages"
  ON venue_room_messages FOR DELETE
  USING (is_venue_host(auth.uid(), event_id));

-- ============================================================
-- 10. updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION touch_venue_rooms()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_venue_rooms_trigger ON venue_rooms;
CREATE TRIGGER touch_venue_rooms_trigger
  BEFORE UPDATE ON venue_rooms
  FOR EACH ROW
  EXECUTE FUNCTION touch_venue_rooms();

-- event_venue_members.updated_at is stamped by guard_venue_member_role().

-- ============================================================
-- 11. RPCs
-- ============================================================

-- Joining. The caller never says what role it wants; this decides.
CREATE OR REPLACE FUNCTION join_venue(p_event_id UUID)
RETURNS event_venue_members AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event events;
  v_role TEXT;
  v_row event_venue_members;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;
  IF NOT v_event.has_venue THEN
    RAISE EXCEPTION 'this event has no venue';
  END IF;

  -- Already in. Idempotent by design: the client calls this on every entry.
  SELECT * INTO v_row FROM event_venue_members
  WHERE event_id = p_event_id AND user_id = v_user;
  IF v_row.id IS NOT NULL THEN
    UPDATE event_venue_members SET last_seen_at = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  IF is_venue_host(v_user, p_event_id) THEN
    v_role := 'organizer';
  ELSIF EXISTS (
    SELECT 1 FROM event_rsvps
    WHERE event_id = p_event_id AND user_id = v_user
      AND status IN ('confirmed', 'checked_in')
  ) THEN
    v_role := 'participant';
  ELSIF v_event.spectators_enabled AND v_event.spectator_scope = 'members' THEN
    v_role := 'spectator';
  ELSE
    RAISE EXCEPTION 'register for this event to enter the venue';
  END IF;

  -- Hosts bypass the window; a host has to be able to set the room up early.
  IF v_role <> 'organizer' THEN
    IF v_event.venue_opens_at IS NOT NULL AND now() < v_event.venue_opens_at THEN
      RAISE EXCEPTION 'the venue has not opened yet';
    END IF;
    IF v_event.venue_closes_at IS NOT NULL AND now() > v_event.venue_closes_at THEN
      RAISE EXCEPTION 'the venue has closed';
    END IF;
  END IF;

  INSERT INTO event_venue_members (event_id, user_id, role, availability)
  VALUES (p_event_id, v_user, v_role, CASE WHEN v_role = 'spectator' THEN 'away' ELSE 'working' END)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The cold-path write. Client throttles to one call per 45s, plus one
-- immediately on any change and one on beforeunload. p_availability NULL means
-- "just touch last_seen_at" so an idle tab does not overwrite a manual 'busy'.
CREATE OR REPLACE FUNCTION venue_heartbeat(
  p_event_id UUID,
  p_room_id UUID DEFAULT NULL,
  p_availability TEXT DEFAULT NULL,
  p_status_note TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT NULL
)
RETURNS event_venue_members AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row event_venue_members;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE event_venue_members SET
    last_seen_at    = now(),
    current_room_id = p_room_id,
    availability    = COALESCE(p_availability, availability),
    status_note     = COALESCE(p_status_note, status_note),
    meta            = COALESCE(p_meta, meta)
  WHERE event_id = p_event_id AND user_id = v_user
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Entering a room. Validates membership, that the room is open, and capacity.
-- Capacity is checked against the cold mirror, so it is advisory — the live
-- number is whatever the presence channel says. Advisory is the right level
-- here: bouncing someone out of a room because of a stale count is worse than
-- letting one extra person in.
CREATE OR REPLACE FUNCTION enter_venue_room(p_room_id UUID)
RETURNS venue_rooms AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room venue_rooms;
  v_here INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_room FROM venue_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF NOT is_venue_member(v_user, v_room.event_id) THEN
    RAISE EXCEPTION 'not a member of this venue';
  END IF;
  IF NOT v_room.is_open AND NOT is_venue_host(v_user, v_room.event_id) THEN
    RAISE EXCEPTION 'this room is closed';
  END IF;

  IF v_room.capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO v_here FROM event_venue_members
    WHERE current_room_id = p_room_id
      AND user_id <> v_user
      AND last_seen_at > now() - INTERVAL '2 minutes';
    IF v_here >= v_room.capacity AND NOT is_venue_host(v_user, v_room.event_id) THEN
      RAISE EXCEPTION 'this room is full';
    END IF;
  END IF;

  UPDATE event_venue_members
  SET current_room_id = p_room_id, last_seen_at = now()
  WHERE event_id = v_room.event_id AND user_id = v_user;

  RETURN v_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cold-path occupancy, for first paint and for the organizer dashboard. The hot
-- path is a client-side groupBy over presence state and does not call this.
CREATE OR REPLACE FUNCTION venue_room_occupancy(p_event_id UUID)
RETURNS TABLE (room_id UUID, occupants INT) AS $$
  SELECT m.current_room_id, COUNT(*)::INT
  FROM event_venue_members m
  WHERE m.event_id = p_event_id
    AND m.current_room_id IS NOT NULL
    AND m.last_seen_at > now() - INTERVAL '2 minutes'
    AND is_venue_member(auth.uid(), p_event_id)
  GROUP BY m.current_room_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- One click in the admin tab instead of authoring six rows by hand. Skips any
-- key that already exists, so a host who has renamed Main Hall keeps it.
CREATE OR REPLACE FUNCTION seed_default_venue_rooms(p_event_id UUID)
RETURNS SETOF venue_rooms AS $$
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO venue_rooms (event_id, key, name, kind, description, audio_mode, svg_zone_id, sort_order)
  VALUES
    (p_event_id, 'main-hall',  'Main Hall',       'main_hall',  'Opening remarks, announcements and the closing ceremony.', 'moderated',   'zone-main-hall',  10),
    (p_event_id, 'networking', 'Networking Area', 'networking', 'Open mics. See everyone here and talk freely.',            'open',        'zone-networking', 20),
    (p_event_id, 'workshop',   'Workshop Room',   'workshop',   'Scheduled sessions from mentors and sponsors.',            'moderated',   'zone-workshop',   30),
    (p_event_id, 'help-desk',  'Help Desk',       'help_desk',  'Stuck? A mentor is here.',                                 'open',        'zone-help-desk',  40),
    (p_event_id, 'showcase',   'Showcase Stage',  'stage',      'Demos and pitches.',                                       'listen_only', 'zone-showcase',   50),
    (p_event_id, 'quiet-room', 'Quiet Room',      'breakout',   'Heads-down focus. No audio.',                               'listen_only', 'zone-quiet',      60)
  ON CONFLICT (event_id, key) DO NOTHING;

  RETURN QUERY SELECT * FROM venue_rooms WHERE event_id = p_event_id ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 12. Realtime publication
-- ============================================================

-- ALTER PUBLICATION ... ADD TABLE is not idempotent — it errors if the table is
-- already a member, which would break the promise at the top of this file. The
-- guard is not optional.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                   AND tablename = 'venue_room_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_room_messages;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                   AND tablename = 'venue_rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE venue_rooms;
  END IF;
END $$;

-- event_venue_members is deliberately NOT published. The presence channel is
-- the hot path; the table is a 60s-stale fallback, and publishing it would fan
-- out a WAL event for every heartbeat from every participant.

-- ============================================================
-- 13. Grants
-- ============================================================

-- Postgres grants EXECUTE to PUBLIC by default, so anything taking a UUID it
-- should not be pointed at has to be revoked explicitly (066 does the same for
-- check_achievements_for).
REVOKE ALL ON FUNCTION is_venue_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_venue_host(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_use_venue_channel(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_use_room_channel(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_use_ydoc_channel(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_use_channel(UUID, TEXT) FROM PUBLIC;

-- The RLS policies on realtime.messages run as the invoking role, so these two
-- must be callable by authenticated. They are still not oracles: both take the
-- caller's own uid from the policy expression, and a caller passing someone
-- else's uid learns only what that user could already see.
GRANT EXECUTE ON FUNCTION can_use_channel(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_use_venue_channel(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_use_room_channel(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_use_ydoc_channel(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_venue_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_venue_host(UUID, UUID) TO authenticated, service_role;

-- Argument-free-ish client entry points: every one of these derives the actor
-- from auth.uid() and cannot be aimed at another user.
GRANT EXECUTE ON FUNCTION join_venue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_heartbeat(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION enter_venue_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_room_occupancy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION seed_default_venue_rooms(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 14. Verification (run separately; safe read-only checks)
-- ============================================================
--
-- 1. RLS is on for private channels, and both policies exist:
--
--    SELECT c.relrowsecurity AS rls_enabled
--    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'realtime' AND c.relname = 'messages';
--
--    SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'realtime' AND tablename = 'messages';
--
--    Expect rls_enabled = true and two rows (SELECT + INSERT). If either is
--    missing, private channels deny everyone and the venue will not connect.
--
-- 2. The dispatcher denies malformed and unknown topics:
--
--    SELECT can_use_channel(auth.uid(), 'room:not-a-uuid')  AS malformed,  -- false
--           can_use_channel(auth.uid(), 'nonsense:abc')     AS unknown,    -- false
--           can_use_channel(auth.uid(), 'ydoc:team_whiteboard:'
--             || gen_random_uuid()::text)                   AS ydoc_closed; -- false until 073
--
-- 3. Publication members (venue_room_messages and venue_rooms, exactly once):
--
--    SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--    ORDER BY tablename;
