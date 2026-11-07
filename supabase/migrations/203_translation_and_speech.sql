-- 203: translations into English are cached, and server speech captions have a gate
--
-- Two changes for running translation on free tiers (Groq, November 2026).
--
-- 1. The shared translation cache (097) only accepted French and Spanish as
--    target languages. Content written in French or Spanish and read in
--    English (room chat, now that members write in their own language, 100)
--    could never be stored, so every view paid the provider again for the same
--    sentence. The insert failed quietly in api/_lib/translate-core.ts.
--
-- 2. Captions use the browser's own speech recognition where it exists. Where
--    it does not (Firefox), the browser sends each spoken phrase to
--    api/speech/transcribe.ts, which runs it through Groq's free Whisper. That
--    free tier is shared by the whole organisation and limited per day, in
--    requests and in audio seconds, so the route asks speech_allowance()
--    before every phrase. The route itself records the seconds Whisper
--    reports, as kind 'speech_seconds', through record_venue_usage(): the
--    number comes from the server, not from the member's browser.
--
--    Server captions can run in any LiveKit room: venue rooms, coffee tables
--    (200) and /collaborate/video calls (202). can_caption_in() says who may
--    caption where.
--
-- Idempotent. Safe to re-run.

-- ============================================================
-- 1. English in the translation cache
-- ============================================================

DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.translations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%target_lang%'
  LOOP
    EXECUTE format('ALTER TABLE translations DROP CONSTRAINT %I', v_name);
  END LOOP;
  ALTER TABLE translations ADD CONSTRAINT translations_target_lang_check
    CHECK (target_lang IN ('en', 'fr', 'es'));
END $$;

-- ============================================================
-- 2. Server speech captions
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_venue_usage_server_speech
  ON venue_usage(user_id, at DESC)
  WHERE kind = 'speech_seconds';

-- Can this person be in the LiveKit room with this name? A venue room by the
-- same rule as its call and channel, a coffee table they are sitting at, or a
-- call from /collaborate/video that is still open and that they may join.
CREATE OR REPLACE FUNCTION can_caption_in(p_user UUID, p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    can_use_room_channel(p_user, p_room_id)
    OR EXISTS (
      SELECT 1 FROM venue_coffee_seats
      WHERE table_id = p_room_id AND user_id = p_user AND left_at IS NULL
    )
    OR (
      EXISTS (
        SELECT 1 FROM video_calls c
        WHERE c.id = p_room_id AND NOT video_call_is_over(c)
          AND (NOT c.locked OR c.created_by = p_user)
      )
      AND NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = p_user AND 'student' = ANY(coalesce(roles, ARRAY[]::TEXT[]))
      )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- What api/speech/transcribe.ts checks before sending a phrase to Whisper.
-- "Today" is the UTC day, which is when Groq's daily limits reset. Service
-- role only: it reads everyone's usage.
CREATE OR REPLACE FUNCTION speech_allowance(p_user UUID, p_room_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_day_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_user_day NUMERIC;
  v_day_seconds NUMERIC;
  v_day_requests INT;
BEGIN
  SELECT
    coalesce(sum(amount) FILTER (WHERE user_id = p_user), 0),
    coalesce(sum(amount), 0),
    count(*)
  INTO v_user_day, v_day_seconds, v_day_requests
  FROM venue_usage
  WHERE kind = 'speech_seconds' AND at >= v_day_start;

  RETURN jsonb_build_object(
    'suspended', coalesce(is_suspended(p_user), FALSE),
    'can_caption', can_caption_in(p_user, p_room_id),
    'user_day_seconds', v_user_day,
    'day_seconds', v_day_seconds,
    'day_requests', v_day_requests
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. Grants
-- ============================================================

REVOKE ALL ON FUNCTION can_caption_in(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION speech_allowance(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION speech_allowance(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
