-- Migration 121: Budget for the pre-publication content check
--
-- 119 and 120 put a deterministic word scan in the browser. It catches what is
-- on the list and nothing else — a paraphrase, an implied threat, or abuse in
-- a dialect the list does not cover all sail straight past it. The second
-- opinion is a model, called once when a member presses submit on long-form
-- content, and a model call costs money and can be made to cost a lot of it.
--
-- Hence a spend ceiling that is enforced where it cannot be edited by the
-- caller. Same shape as claim_translation_budget() in 097: one atomic
-- check-and-spend, service key only, no RLS policy at all, because nothing
-- outside the edge route has any business reading or writing it.
--
-- An over-budget answer is NOT an error. The route fails open — see
-- api/moderate-check.ts for why at length, but in one line: the Postgres
-- trigger is still the enforcement boundary, and turning a vendor's bad hour
-- into "nobody can publish on grant deadline day" is the larger incident.
--
-- Idempotent — safe to re-run. Requires 065.

CREATE TABLE IF NOT EXISTS moderation_check_rate_limit (
  user_id      UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  chars        BIGINT NOT NULL DEFAULT 0,
  requests     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS moderation_check_usage (
  period   DATE PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  chars    BIGINT NOT NULL DEFAULT 0,
  images   INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE moderation_check_rate_limit IS
  'Per-member spend window for the pre-publication model check. Written only by claim_moderation_check_budget() under the service key; no RLS policy, following translation_rate_limit in 097.';

COMMENT ON TABLE moderation_check_usage IS
  'Daily totals for the pre-publication model check, so spend is visible without reading the per-member table.';

ALTER TABLE moderation_check_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_check_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Atomic check-and-spend
-- ============================================================

CREATE OR REPLACE FUNCTION claim_moderation_check_budget(
  p_user   UUID,
  p_chars  INTEGER,
  p_images INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Ten minutes is long enough to cover a member editing and resubmitting a
  -- long form several times, and short enough that a runaway client recovers
  -- on its own rather than needing an admin.
  c_window_minutes CONSTANT INTEGER := 10;
  c_max_requests   CONSTANT INTEGER := 30;
  c_max_chars      CONSTANT BIGINT  := 60000;
  -- An image costs more than its byte count suggests, so it is charged a
  -- notional share of the same bucket rather than given a second one.
  c_image_chars    CONSTANT INTEGER := 1500;

  v_row        moderation_check_rate_limit%ROWTYPE;
  v_cost       BIGINT := GREATEST(p_chars, 0) + (GREATEST(p_images, 0) * c_image_chars);
  v_monthly    BIGINT;
  v_month_cap  BIGINT := NULLIF(current_setting('ktip.moderation_month_char_cap', TRUE), '')::BIGINT;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'no_user');
  END IF;

  INSERT INTO moderation_check_rate_limit (user_id)
  VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  -- Locked, because two tabs pressing submit at once would otherwise each read
  -- the pre-spend total and both be allowed.
  SELECT * INTO v_row
  FROM moderation_check_rate_limit
  WHERE user_id = p_user
  FOR UPDATE;

  IF v_row.window_start < now() - make_interval(mins => c_window_minutes) THEN
    v_row.window_start := now();
    v_row.chars := 0;
    v_row.requests := 0;
  END IF;

  IF v_row.requests + 1 > c_max_requests OR v_row.chars + v_cost > c_max_chars THEN
    UPDATE moderation_check_rate_limit
    SET window_start = v_row.window_start, chars = v_row.chars, requests = v_row.requests
    WHERE user_id = p_user;

    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'rate_limited',
      'retry_after', GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (v_row.window_start + make_interval(mins => c_window_minutes) - now())))
      )
    );
  END IF;

  IF v_month_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(chars), 0) INTO v_monthly
    FROM moderation_check_usage
    WHERE period >= date_trunc('month', CURRENT_DATE)::DATE;

    IF v_monthly + v_cost > v_month_cap THEN
      RETURN jsonb_build_object('allowed', FALSE, 'reason', 'over_budget');
    END IF;
  END IF;

  UPDATE moderation_check_rate_limit
  SET window_start = v_row.window_start,
      chars = v_row.chars + v_cost,
      requests = v_row.requests + 1
  WHERE user_id = p_user;

  INSERT INTO moderation_check_usage (period, requests, chars, images)
  VALUES (CURRENT_DATE, 1, GREATEST(p_chars, 0), GREATEST(p_images, 0))
  ON CONFLICT (period) DO UPDATE
  SET requests = moderation_check_usage.requests + 1,
      chars    = moderation_check_usage.chars + GREATEST(p_chars, 0),
      images   = moderation_check_usage.images + GREATEST(p_images, 0);

  RETURN jsonb_build_object('allowed', TRUE);
END;
$$;

COMMENT ON FUNCTION claim_moderation_check_budget(UUID, INTEGER, INTEGER) IS
  'Atomic check-and-spend for the pre-publication model check. Returns {allowed, reason?, retry_after?}. Callers treat a refusal as "skip the model", never as an error — the deterministic trigger is the enforcement boundary.';

REVOKE ALL ON FUNCTION claim_moderation_check_budget(UUID, INTEGER, INTEGER) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
