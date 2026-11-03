-- Migration 193: Venue usage metering for the Organiser Ops panel
--
-- The venue runs on free tiers first: LiveKit Cloud Build (100 people in
-- calls at once), Azure Translator F0 (2M characters a month) and Azure
-- Speech F0 (5 audio hours of speech translation and 0.5M neural TTS
-- characters a month). OpenRouter is paid per use. The organiser has to see
-- where each unit goes, per event, per team and per member. This migration is
-- the ledger behind that view:
--
--   1. venue_usage           one row per measured unit of work: characters
--                            translated, seconds in a call, seconds of screen
--                            share, a raised hand. Append only.
--   2. venue_usage_sessions  open calls and open screen shares, so a LiveKit
--                            "left" or "unpublished" webhook can be turned
--                            into a duration. Also the live "in calls now"
--                            count for the 100-person cap.
--   3. Writers               record_venue_usage() and the two session
--                            functions run as the service role only. The one
--                            client door is log_help_request(), which records a
--                            count of 1 and nothing the client can size.
--   4. Readers               hosts of the event only (is_venue_host), through
--                            RLS on the table and through the aggregation
--                            functions the panel calls.
--
-- WHY THE SERVER MEASURES
-- -----------------------
-- A client that reports its own usage can report zero. Translation characters
-- are counted in api/translate.ts from what was actually sent to the provider.
-- Call and screen share time come from LiveKit's signed webhooks
-- (api/venue/livekit-webhook.ts). Only a raised hand has no server-side
-- witness, because hands ride realtime broadcast; it is a count of one, rate
-- limited below, so lying about it buys nothing.
--
-- WHY team_id IS COPIED, NOT JOINED
-- ---------------------------------
-- Teams change during a hackathon: people swap, teams merge, a team that loses
-- its last member is deleted. A report that joined event_team_members at read
-- time would move last night's call minutes to whichever team someone is on
-- this morning. The team (id and name) is resolved when the row is written and
-- stored on it. team_id deliberately has no foreign key, so deleting a team
-- does not erase which team the usage belonged to.
--
-- FILES ARE READ, NOT LOGGED
-- --------------------------
-- Team files live in the team-files bucket (190), one folder per team. Storage
-- already knows every object's size and owner, so the reports read
-- storage.objects directly and report it as kind 'file_bytes': what is stored
-- right now, not what was uploaded in the date range. No row is written per
-- upload, so there is nothing to drift.
--
-- Needs 070 (venue), 116 (is_venue_host), 188 (teams), 190 (can_use_room_channel,
-- team-files). Idempotent: safe to re-run.

-- ============================================================
-- 1. The ledger
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_usage (
  id BIGSERIAL PRIMARY KEY,
  -- Nullable for usage that belongs to no event. Nothing writes such rows
  -- today; the column allows it so a later site-wide meter needs no change.
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  -- Copied at write time. No foreign key, on purpose: see the header.
  team_id UUID,
  team_name TEXT,
  room_id UUID REFERENCES venue_rooms(id) ON DELETE SET NULL,
  -- SET NULL, not CASCADE: a deleted account takes its name with it but the
  -- organisation still spent the minutes.
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Idempotency key for writers that may retry. LiveKit retries a webhook it
  -- did not get a 2xx for; the same event id must not count twice.
  source_id TEXT UNIQUE,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_usage_kind_check') THEN
    ALTER TABLE venue_usage ADD CONSTRAINT venue_usage_kind_check
      CHECK (kind IN (
        'translate_chars', 'caption_chars', 'call_seconds', 'screen_share_seconds',
        'help_request', 'file_bytes', 'tts_chars', 'speech_seconds'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_usage_meta_check') THEN
    ALTER TABLE venue_usage ADD CONSTRAINT venue_usage_meta_check
      CHECK (jsonb_typeof(meta) = 'object' AND length(meta::text) <= 2000);
  END IF;
END $$;

-- The panel's main query: one event, a date range.
CREATE INDEX IF NOT EXISTS idx_venue_usage_event_at ON venue_usage(event_id, at);
-- The free-tier meters: every event, this month, by kind.
CREATE INDEX IF NOT EXISTS idx_venue_usage_kind_at ON venue_usage(kind, at) INCLUDE (amount);
-- log_help_request's rate limit and the "open help requests" count.
CREATE INDEX IF NOT EXISTS idx_venue_usage_help
  ON venue_usage(user_id, at DESC) WHERE kind = 'help_request';

COMMENT ON TABLE venue_usage IS
  'Measured venue usage (193). Written by the service role and log_help_request() only. team_id/team_name are copied at write time and never rewritten';

ALTER TABLE venue_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue hosts can read usage" ON venue_usage;
CREATE POLICY "Venue hosts can read usage"
  ON venue_usage FOR SELECT
  USING (event_id IS NOT NULL AND is_venue_host(auth.uid(), event_id));

-- No INSERT, UPDATE or DELETE policy. RLS already refuses them; the revoke
-- makes the intent readable from \dp as well.
REVOKE INSERT, UPDATE, DELETE ON venue_usage FROM anon, authenticated;

-- ============================================================
-- 2. Open sessions (calls and screen shares)
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_usage_sessions (
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('call', 'screen_share')),
  -- LiveKit's participant sid for a call, track sid for a screen share. One
  -- person can rejoin, and each connection is its own session.
  sid TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (room_id, user_id, kind, sid)
);

CREATE INDEX IF NOT EXISTS idx_venue_usage_sessions_kind ON venue_usage_sessions(kind, started_at);

-- Service role only. No policies at all.
ALTER TABLE venue_usage_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON venue_usage_sessions FROM anon, authenticated;

-- ============================================================
-- 3. Writers
-- ============================================================

-- The one place a usage row is built. Resolves the event from the room, checks
-- the person belongs to that event, and copies their current team onto the
-- row. Returns FALSE (and writes nothing) when the room is unknown or the
-- person is not in the venue: api/translate.ts passes a room id the browser
-- chose, and a member must not be able to bill another event's ledger.
CREATE OR REPLACE FUNCTION record_venue_usage(
  p_room_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_amount NUMERIC,
  p_meta JSONB DEFAULT '{}'::jsonb,
  p_source_id TEXT DEFAULT NULL,
  p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_event UUID;
  v_team UUID;
  v_team_name TEXT;
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RETURN FALSE;
  END IF;

  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF v_event IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (is_venue_member(p_user_id, v_event) OR is_venue_host(p_user_id, v_event)) THEN
    RETURN FALSE;
  END IF;

  SELECT m.team_id, t.name INTO v_team, v_team_name
  FROM event_team_members m
  JOIN event_teams t ON t.id = m.team_id
  WHERE m.event_id = v_event AND m.user_id = p_user_id;

  INSERT INTO venue_usage (event_id, team_id, team_name, room_id, user_id, kind, amount, meta, source_id, at)
  VALUES (
    v_event, v_team, v_team_name, p_room_id, p_user_id, p_kind, p_amount,
    coalesce(p_meta, '{}'::jsonb), p_source_id, coalesce(p_at, now())
  )
  ON CONFLICT (source_id) DO NOTHING;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A call or screen share started. A replayed webhook is a no-op.
CREATE OR REPLACE FUNCTION open_venue_usage_session(
  p_room_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_sid TEXT,
  p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID AS $$
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL OR coalesce(p_sid, '') = '' THEN
    RETURN;
  END IF;
  -- Only rooms this app knows about. LiveKit may host other rooms one day.
  IF NOT EXISTS (SELECT 1 FROM venue_rooms WHERE id = p_room_id) THEN
    RETURN;
  END IF;

  INSERT INTO venue_usage_sessions (room_id, user_id, kind, sid, started_at)
  VALUES (p_room_id, p_user_id, p_kind, p_sid, coalesce(p_at, now()))
  ON CONFLICT DO NOTHING;

  -- A session whose "ended" webhook never arrived must not count as in a
  -- call for ever. A day is far longer than any real session.
  DELETE FROM venue_usage_sessions WHERE started_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A call or screen share ended: turn it into seconds. p_started_at is
-- LiveKit's own joinedAt for a call, preferred when present because it does
-- not depend on the "joined" webhook having arrived. Ending a call also ends
-- any screen share that person still had open in the room.
CREATE OR REPLACE FUNCTION close_venue_usage_session(
  p_room_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_sid TEXT,
  p_at TIMESTAMPTZ DEFAULT now(),
  p_started_at TIMESTAMPTZ DEFAULT NULL,
  p_source_id TEXT DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_started TIMESTAMPTZ;
  v_end TIMESTAMPTZ := coalesce(p_at, now());
  v_seconds NUMERIC := 0;
  v_share RECORD;
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM venue_usage_sessions
  WHERE room_id = p_room_id AND user_id = p_user_id AND kind = p_kind AND sid = coalesce(p_sid, '')
  RETURNING started_at INTO v_started;

  v_started := coalesce(p_started_at, v_started);

  IF v_started IS NOT NULL THEN
    -- Capped at a day: a clock that is wrong by a year must not become a year
    -- of call time on the meter.
    v_seconds := greatest(0, least(extract(epoch FROM (v_end - v_started)), 86400));
    IF v_seconds > 0 THEN
      PERFORM record_venue_usage(
        p_room_id, p_user_id,
        CASE p_kind WHEN 'call' THEN 'call_seconds' ELSE 'screen_share_seconds' END,
        round(v_seconds),
        jsonb_build_object('sid', p_sid, 'source', 'livekit'),
        p_source_id,
        v_end
      );
    END IF;
  END IF;

  IF p_kind = 'call' THEN
    FOR v_share IN
      SELECT sid FROM venue_usage_sessions
      WHERE room_id = p_room_id AND user_id = p_user_id AND kind = 'screen_share'
    LOOP
      PERFORM close_venue_usage_session(
        p_room_id, p_user_id, 'screen_share', v_share.sid, v_end, NULL,
        CASE WHEN p_source_id IS NULL THEN NULL ELSE p_source_id || ':' || v_share.sid END
      );
    END LOOP;
  END IF;

  RETURN v_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The one client-callable writer. A hand raised in a room is a help request.
-- The amount is always 1. Rate limited to one per person per room per minute,
-- and 60 per person per event per day, so a toggling hand or a script cannot
-- flood the ledger. Returns whether a row was written.
CREATE OR REPLACE FUNCTION log_help_request(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) THEN
    RETURN FALSE;
  END IF;

  -- Same rule as the room channel the hand travels on (190).
  IF NOT can_use_room_channel(v_user, p_room_id) THEN
    RETURN FALSE;
  END IF;

  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;

  IF EXISTS (
    SELECT 1 FROM venue_usage
    WHERE kind = 'help_request' AND user_id = v_user AND room_id = p_room_id
      AND at > now() - INTERVAL '1 minute'
  ) THEN
    RETURN FALSE;
  END IF;

  IF (
    SELECT count(*) FROM venue_usage
    WHERE kind = 'help_request' AND user_id = v_user AND event_id = v_event
      AND at > now() - INTERVAL '1 day'
  ) >= 60 THEN
    RETURN FALSE;
  END IF;

  RETURN record_venue_usage(p_room_id, v_user, 'help_request', 1, '{}'::jsonb, NULL, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. Readers (hosts only)
-- ============================================================

-- Totals per team, per member and per kind for one event and a date range.
-- The panel builds every view (team rows, member rows, CSV) from this one
-- result. file_bytes rows are current storage, not the range: see the header.
CREATE OR REPLACE FUNCTION venue_usage_breakdown(
  p_event_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  user_id UUID,
  display_name TEXT,
  kind TEXT,
  amount NUMERIC,
  entries BIGINT
) AS $$
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  RETURN QUERY
  SELECT
    u.team_id,
    -- The team's current name when it still exists, the name it had then when
    -- it does not.
    coalesce(t.name, max(u.team_name)),
    u.user_id,
    p.display_name,
    u.kind,
    sum(u.amount),
    count(*)
  FROM venue_usage u
  LEFT JOIN event_teams t ON t.id = u.team_id
  LEFT JOIN profiles p ON p.id = u.user_id
  WHERE u.event_id = p_event_id
    AND u.kind <> 'file_bytes'
    AND (p_from IS NULL OR u.at >= p_from)
    AND (p_to IS NULL OR u.at < p_to)
  GROUP BY u.team_id, t.name, u.user_id, p.display_name, u.kind;

  -- Files: what each team holds right now, by uploader. Wrapped so a storage
  -- schema without these columns degrades to "no file rows" instead of
  -- failing the whole report.
  BEGIN
    RETURN QUERY
    SELECT
      t.id,
      t.name,
      o.owner,
      p.display_name,
      'file_bytes'::TEXT,
      sum(coalesce((o.metadata->>'size')::NUMERIC, 0)),
      count(*)
    FROM storage.objects o
    JOIN event_teams t ON t.id = safe_uuid((storage.foldername(o.name))[1])
    LEFT JOIN profiles p ON p.id = o.owner
    WHERE o.bucket_id = 'team-files' AND t.event_id = p_event_id
    GROUP BY t.id, t.name, o.owner, p.display_name;
  EXCEPTION WHEN undefined_column OR undefined_table OR undefined_function THEN
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Per day and kind, for one event. Days are UTC.
CREATE OR REPLACE FUNCTION venue_usage_daily(
  p_event_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (day DATE, kind TEXT, amount NUMERIC, entries BIGINT) AS $$
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  RETURN QUERY
  SELECT (u.at AT TIME ZONE 'UTC')::DATE, u.kind, sum(u.amount), count(*)
  FROM venue_usage u
  WHERE u.event_id = p_event_id
    AND (p_from IS NULL OR u.at >= p_from)
    AND (p_to IS NULL OR u.at < p_to)
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Month to date (UTC), for the free-tier meters. Free tiers belong to the
-- organisation, not to one event, so the totals cover every event; this
-- event's share comes alongside. Only sums leave this function, never a
-- person, so a host of one event learns nothing about another event's people.
--
--   kinds          { kind: { all_events, this_event } }
--   site_translate_chars  every character the translation route was cleared
--                         to send this month, venue or not (097's ledger)
--   team_file_bytes       team-files storage across all events, right now
--   calls_now             people in a venue call right now, across all events
CREATE OR REPLACE FUNCTION venue_usage_meters(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_month_start TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_kinds JSONB;
  v_site BIGINT := NULL;
  v_files NUMERIC := NULL;
  v_calls BIGINT;
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT coalesce(jsonb_object_agg(k.kind, jsonb_build_object('all_events', k.total, 'this_event', k.mine)), '{}'::jsonb)
  INTO v_kinds
  FROM (
    SELECT u.kind, sum(u.amount) AS total,
           sum(u.amount) FILTER (WHERE u.event_id = p_event_id) AS mine
    FROM venue_usage u
    WHERE u.at >= v_month_start AND u.kind <> 'file_bytes'
    GROUP BY u.kind
  ) k;

  BEGIN
    SELECT sum(chars_translated) INTO v_site
    FROM translation_usage
    WHERE period = (v_month_start AT TIME ZONE 'UTC')::DATE;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_site := NULL;
  END;

  BEGIN
    SELECT sum(coalesce((metadata->>'size')::NUMERIC, 0)) INTO v_files
    FROM storage.objects WHERE bucket_id = 'team-files';
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_files := NULL;
  END;

  SELECT count(*) INTO v_calls
  FROM (
    SELECT DISTINCT s.room_id, s.user_id
    FROM venue_usage_sessions s
    WHERE s.kind = 'call' AND s.started_at > now() - INTERVAL '12 hours'
  ) live;

  RETURN jsonb_build_object(
    'month_start', v_month_start,
    'kinds', v_kinds,
    'site_translate_chars', v_site,
    'team_file_bytes', coalesce(v_files, 0),
    'calls_now', coalesce(v_calls, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- The KPI row's server-side numbers. People online, teams and people without
-- a team are already on the client (presence and the team list).
--
--   open_help_requests  people who raised a hand in the last 5 minutes, the
--                       same lifetime a hand has on screen (useRoomSignals)
--   help_requests_today hands raised since midnight UTC
--   submissions         event_solutions rows, or NULL where that table is absent
CREATE OR REPLACE FUNCTION venue_ops_snapshot(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_open BIGINT;
  v_today BIGINT;
  v_submissions BIGINT := NULL;
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT count(DISTINCT user_id) INTO v_open
  FROM venue_usage
  WHERE event_id = p_event_id AND kind = 'help_request' AND at > now() - INTERVAL '5 minutes';

  SELECT count(*) INTO v_today
  FROM venue_usage
  WHERE event_id = p_event_id AND kind = 'help_request'
    AND at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  IF to_regclass('public.event_solutions') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT count(*) FROM event_solutions WHERE event_id = $1'
        INTO v_submissions USING p_event_id;
    EXCEPTION WHEN undefined_column THEN
      v_submissions := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'open_help_requests', coalesce(v_open, 0),
    'help_requests_today', coalesce(v_today, 0),
    'submissions', v_submissions
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 5. Grants
-- ============================================================

REVOKE ALL ON FUNCTION record_venue_usage(UUID, UUID, TEXT, NUMERIC, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION open_venue_usage_session(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION close_venue_usage_session(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_venue_usage(UUID, UUID, TEXT, NUMERIC, JSONB, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION open_venue_usage_session(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION close_venue_usage_session(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO service_role;

REVOKE ALL ON FUNCTION log_help_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_help_request(UUID) TO authenticated;

REVOKE ALL ON FUNCTION venue_usage_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION venue_usage_daily(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION venue_usage_meters(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION venue_ops_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION venue_usage_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_usage_daily(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_usage_meters(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION venue_ops_snapshot(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 6. Verification (read-only)
-- ============================================================
--
--   -- As a host of the event: rows. As anyone else: 'insufficient permission'.
--   SELECT * FROM venue_usage_breakdown('<event id>', now() - INTERVAL '1 day', now());
--   SELECT venue_usage_meters('<event id>');
--   SELECT venue_ops_snapshot('<event id>');
--
--   -- As an attendee in a room: TRUE once, then FALSE for a minute.
--   SELECT log_help_request('<room id>');
--
--   -- As an attendee: zero rows (no policy), and an INSERT is refused.
--   SELECT count(*) FROM venue_usage;
