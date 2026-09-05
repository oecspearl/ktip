-- Migration 134: the facts no query can produce.
--
-- The last group of §14 KPIs, and they are a different KIND of thing from the
-- other two phases. Phase 1 computed what the database already knew. Phase 2
-- built collectors for what it could learn. These cannot be derived from the
-- platform at all:
--
--   uptime            a system cannot measure its own downtime — the minutes
--                     that matter are precisely the ones where nothing ran
--   5xx rate          lives in Sentry, not in Postgres
--   innovations adopted / security incidents / non-grant revenue
--                     evaluation findings and off-platform financials
--
-- So there are two tables and the split is the design: one for readings taken
-- from OUTSIDE by a machine, one for facts a HUMAN asserts with evidence.
-- Mixing them would put an attested revenue figure in the same shape as a
-- sampled error rate, and the first question anyone asks of an impact number is
-- which of the two it is.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. Health samples — observed from outside, by a machine
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_health_samples (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Which probe reported this, so a disagreeing source is attributable rather
  -- than just noise in the series.
  source         TEXT NOT NULL,
  -- The span the sample describes, e.g. '1h', '24h'. A 99.9% over an hour and a
  -- 99.9% over a month are not the same claim.
  window_label   TEXT NOT NULL,
  uptime_pct     NUMERIC CHECK (uptime_pct IS NULL OR uptime_pct BETWEEN 0 AND 100),
  error_rate_5xx NUMERIC CHECK (error_rate_5xx IS NULL OR error_rate_5xx >= 0),
  p75_lcp_ms     INTEGER CHECK (p75_lcp_ms IS NULL OR p75_lcp_ms >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_health_samples IS
  'Externally observed health (roadmap §14 T36). Written by a scheduled probe with the service role — the platform cannot measure its own downtime.';

CREATE INDEX IF NOT EXISTS idx_health_samples_observed
  ON platform_health_samples(observed_at DESC);

ALTER TABLE platform_health_samples ENABLE ROW LEVEL SECURITY;

-- Read-only to everyone with a console. Writes come from the service role,
-- which bypasses RLS — there is deliberately no INSERT policy, so nothing
-- holding a user session can forge a health reading.
DROP POLICY IF EXISTS "Console holders can read health samples" ON platform_health_samples;
CREATE POLICY "Console holders can read health samples"
  ON platform_health_samples FOR SELECT
  USING (has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 2. Impact records — asserted by a person, with evidence
--
-- Every row names who attested it and links to something that supports it.
-- A hand-entered figure in a World Bank report without a person's name against
-- it is the thing an audit finds.
-- ============================================================

CREATE TABLE IF NOT EXISTS impact_records (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind         TEXT NOT NULL CHECK (kind IN (
                 'innovation_adopted',
                 'security_incident',
                 'revenue',
                 'other'
               )),
  occurred_on  DATE NOT NULL,
  value        NUMERIC,
  -- For 'revenue': whether this line counts toward the non-grant share (T38).
  source_kind  TEXT CHECK (source_kind IS NULL OR source_kind IN ('grant', 'non_grant')),
  evidence_url TEXT CHECK (evidence_url IS NULL OR length(evidence_url) <= 1000),
  note         TEXT CHECK (note IS NULL OR length(note) <= 4000),
  recorded_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE impact_records IS
  'Attested §14 figures (T32 innovations adopted, T36 incidents, T38 revenue). Each row carries who asserted it and the evidence — these are claims, not measurements.';

CREATE INDEX IF NOT EXISTS idx_impact_records_kind
  ON impact_records(kind, occurred_on DESC);

ALTER TABLE impact_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Console holders can read impact records" ON impact_records;
CREATE POLICY "Console holders can read impact records"
  ON impact_records FOR SELECT
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Operators can write impact records" ON impact_records;
CREATE POLICY "Operators can write impact records"
  ON impact_records FOR ALL
  USING (has_permission(auth.uid(), 'org:manage'))
  WITH CHECK (
    has_permission(auth.uid(), 'org:manage')
    -- Attribution is not optional, and it is not the writer's to choose.
    AND recorded_by = auth.uid()
  );

-- ============================================================
-- 3. The Phase 3 KPIs
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_phase3_pulse(
  p_period_start DATE DEFAULT date_trunc('month', now())::DATE,
  p_period_end   DATE DEFAULT (now() + INTERVAL '1 day')::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_total_revenue NUMERIC;
BEGIN
  -- NULL auth.uid() is the SERVICE ROLE (api/cron/kpi-snapshot.ts calling
  -- through snapshot_kpis), never an anonymous visitor: EXECUTE is revoked from
  -- PUBLIC and anon, so anon never reaches this body. Every authenticated caller
  -- has a uid and is checked normally.
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT SUM(value) INTO v_total_revenue
  FROM impact_records
  WHERE kind = 'revenue' AND occurred_on >= p_period_start AND occurred_on < p_period_end;

  RETURN jsonb_build_object(
    -- Latest sample wins rather than an average: uptime is reported over a
    -- window by the probe, and averaging two overlapping windows is meaningless.
    't36.uptime_pct', (
      SELECT uptime_pct FROM platform_health_samples
      WHERE uptime_pct IS NOT NULL AND observed_at >= p_period_start
      ORDER BY observed_at DESC LIMIT 1
    ),
    't36.error_rate_5xx', (
      SELECT error_rate_5xx FROM platform_health_samples
      WHERE error_rate_5xx IS NOT NULL AND observed_at >= p_period_start
      ORDER BY observed_at DESC LIMIT 1
    ),
    't36.p75_lcp_ms', (
      SELECT p75_lcp_ms FROM platform_health_samples
      WHERE p75_lcp_ms IS NOT NULL AND observed_at >= p_period_start
      ORDER BY observed_at DESC LIMIT 1
    ),

    't32.innovations_adopted', (
      SELECT COALESCE(SUM(COALESCE(value, 1)), 0) FROM impact_records
      WHERE kind = 'innovation_adopted'
        AND occurred_on >= p_period_start AND occurred_on < p_period_end
    ),

    't36.security_incidents', (
      SELECT COUNT(*) FROM impact_records
      WHERE kind = 'security_incident'
        AND occurred_on >= p_period_start AND occurred_on < p_period_end
    ),

    -- NULL, not 0, when no revenue was recorded: "0% of our revenue is
    -- non-grant" is a claim, and an empty table is not evidence for it.
    't38.non_grant_revenue_pct', CASE WHEN COALESCE(v_total_revenue, 0) > 0 THEN (
      SELECT ROUND(
        SUM(value) FILTER (WHERE source_kind = 'non_grant') * 100 / v_total_revenue, 1)
      FROM impact_records
      WHERE kind = 'revenue'
        AND occurred_on >= p_period_start AND occurred_on < p_period_end
    ) END
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.get_phase3_pulse(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_phase3_pulse(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_phase3_pulse(DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 4. Verification
--
--   -- an empty revenue table reports NULL, not 0%
--   SELECT get_phase3_pulse() ->> 't38.non_grant_revenue_pct';   -- null
--
--   -- a health reading cannot be forged from a user session
--   INSERT INTO platform_health_samples (source, window_label, uptime_pct)
--   VALUES ('spoof', '1h', 100);                                 -- refused, no INSERT policy
--
--   -- every impact record names its author
--   SELECT kind, occurred_on, recorded_by IS NOT NULL FROM impact_records;
-- ============================================================
