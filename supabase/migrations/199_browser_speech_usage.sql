-- 199: captions spoken and translations read aloud, on the usage ledger
--
-- Captions (useLiveCaptions) and read-aloud (CaptionStrip) run on the
-- browser's own speech engines, so they cost nothing and never touch the
-- Azure Speech quota that 193's tts_chars and speech_seconds meter. Counting
-- them under those kinds would make the free-tier bars lie. They get their own
-- two kinds instead, so organisers can still see who leans on captions and
-- read-aloud, per team and per member.
--
-- The numbers come from the browser, so they are the member's own report.
-- log_speech_usage() clamps each report, rate limits it and caps a day, the
-- same way log_help_request() does, so a script cannot fill the ledger.

DO $$ BEGIN
  ALTER TABLE venue_usage DROP CONSTRAINT IF EXISTS venue_usage_kind_check;
  ALTER TABLE venue_usage ADD CONSTRAINT venue_usage_kind_check
    CHECK (kind IN (
      'translate_chars', 'caption_chars', 'call_seconds', 'screen_share_seconds',
      'help_request', 'file_bytes', 'tts_chars', 'speech_seconds',
      'caption_speech_seconds', 'read_aloud_chars'
    ));
END $$;

CREATE INDEX IF NOT EXISTS idx_venue_usage_browser_speech
  ON venue_usage(user_id, kind, at DESC)
  WHERE kind IN ('caption_speech_seconds', 'read_aloud_chars');

-- p_kind: caption_speech_seconds (seconds of speech turned into captions) or
-- read_aloud_chars (characters of translation the browser read out).
-- One report per person, room and kind every 45 seconds; the client batches
-- once a minute. Each report is clamped to what a minute can hold, and a day
-- stops at 8 hours of speech or 400,000 characters per person per event.
-- Returns whether a row was written.
CREATE OR REPLACE FUNCTION log_speech_usage(p_room_id UUID, p_kind TEXT, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
  v_amount NUMERIC;
  v_day_cap NUMERIC;
BEGIN
  IF v_user IS NULL OR is_suspended(v_user) THEN
    RETURN FALSE;
  END IF;
  IF p_kind NOT IN ('caption_speech_seconds', 'read_aloud_chars') THEN
    RETURN FALSE;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Same rule as the room's call and channel (190, 197).
  IF NOT can_use_room_channel(v_user, p_room_id) THEN
    RETURN FALSE;
  END IF;

  SELECT event_id INTO v_event FROM venue_rooms WHERE id = p_room_id;
  IF v_event IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_kind = 'caption_speech_seconds' THEN
    v_amount := least(round(p_amount), 120);
    v_day_cap := 8 * 60 * 60;
  ELSE
    v_amount := least(round(p_amount), 8000);
    v_day_cap := 400000;
  END IF;

  IF EXISTS (
    SELECT 1 FROM venue_usage
    WHERE kind = p_kind AND user_id = v_user AND room_id = p_room_id
      AND at > now() - INTERVAL '45 seconds'
  ) THEN
    RETURN FALSE;
  END IF;

  IF (
    SELECT coalesce(sum(amount), 0) FROM venue_usage
    WHERE kind = p_kind AND user_id = v_user AND event_id = v_event
      AND at > now() - INTERVAL '1 day'
  ) + v_amount > v_day_cap THEN
    RETURN FALSE;
  END IF;

  RETURN record_venue_usage(
    p_room_id, v_user, p_kind, v_amount, jsonb_build_object('engine', 'browser'), NULL, now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION log_speech_usage(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_speech_usage(UUID, TEXT, NUMERIC) TO authenticated;

COMMENT ON FUNCTION log_speech_usage(UUID, TEXT, NUMERIC) IS
  'A member''s own report of browser captions or read-aloud (199). Clamped, rate limited, capped per day';
