-- Migration 132: KPI readings, kept.
--
-- WHY A SNAPSHOT TABLE AT ALL — this is the whole argument, and it is not
-- obvious until you try to write the second weekly report.
--
-- About half the §14 KPIs are POINT-IN-TIME, not cumulative: MAU, DAU, active
-- projects, active mentors, retention. They are computed against "now" and
-- CANNOT be recomputed for a past week from current data. There is no query
-- that answers "what was MAU in week 3" once week 5 has arrived.
--
-- So without this table the Weekly Pulse is not a report, it is a live view
-- wearing a date. Open week 3 in April and you get April's numbers under a
-- March heading; a figure sent to the World Bank in March does not reproduce
-- when anyone checks it. That is the failure mode — quiet, plausible, and only
-- discovered when somebody compares two documents.
--
-- `value` is NULLABLE and that is deliberate. "We could not measure this that
-- week" is a legitimate historical record, and the one thing a snapshot must
-- never do is write a zero it does not mean. Same doctrine as
-- src/lib/measured.ts on the client.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. The table
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  period_kind  TEXT NOT NULL CHECK (period_kind IN ('week', 'month', 'quarter', 'year')),
  period_start DATE NOT NULL,
  kpi_key      TEXT NOT NULL,
  value        NUMERIC,
  -- Reserved for the public impact dashboard. Defaults FALSE: a figure becomes
  -- publishable by decision, never by being collected.
  is_public    BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period_kind, period_start, kpi_key)
);

COMMENT ON TABLE kpi_snapshots IS
  'Historical KPI readings. Point-in-time metrics (MAU, active projects) cannot be recomputed for a past period, so a report only reproduces if the reading was kept.';
COMMENT ON COLUMN kpi_snapshots.value IS
  'NULL means the metric could not be measured in that period. Never write 0 for an unreadable metric.';

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_key
  ON kpi_snapshots(kpi_key, period_start DESC);

ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Console holders can read KPI snapshots" ON kpi_snapshots;
CREATE POLICY "Console holders can read KPI snapshots"
  ON kpi_snapshots FOR SELECT
  USING (has_permission(auth.uid(), 'org:manage') OR is_public);

DROP POLICY IF EXISTS "Operators can write KPI snapshots" ON kpi_snapshots;
CREATE POLICY "Operators can write KPI snapshots"
  ON kpi_snapshots FOR ALL
  USING (has_permission(auth.uid(), 'org:manage'))
  WITH CHECK (has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 2. snapshot_kpis()
--
-- Runs get_platform_pulse() for the period and flattens its JSONB into rows.
-- Idempotent per (kind, start, key) so a re-run corrects a bad reading rather
-- than duplicating it, and a backfill is just a loop over past starts.
--
-- Only numeric fields are kept. The pulse also carries period_start,
-- period_end and computed_at, which are metadata about the reading rather than
-- readings, and jsonb_each_text would otherwise store them as failed casts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.snapshot_kpis(
  p_period_kind  TEXT,
  p_period_start DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_period_end DATE;
  v_pulse      JSONB;
  v_written    INTEGER := 0;
BEGIN
  -- Two callers, and the NULL branch is deliberate rather than an oversight.
  --
  -- A NULL auth.uid() here means the SERVICE ROLE — api/cron/kpi-snapshot.ts,
  -- which has no user session by construction. It cannot mean an anonymous
  -- visitor: EXECUTE is revoked from PUBLIC and anon below, so an anon session
  -- never reaches this body at all. Every `authenticated` caller has a uid and
  -- is checked normally.
  --
  -- Without this branch the weekly job fails silently forever and every
  -- point-in-time KPI is blank permanently — those readings cannot be
  -- reconstructed after the fact.
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_period_kind NOT IN ('week', 'month', 'quarter', 'year') THEN
    RAISE EXCEPTION 'unknown period kind: %', p_period_kind USING ERRCODE = '22023';
  END IF;

  v_period_end := (p_period_start + (
    CASE p_period_kind
      WHEN 'week'    THEN INTERVAL '7 days'
      WHEN 'month'   THEN INTERVAL '1 month'
      WHEN 'quarter' THEN INTERVAL '3 months'
      ELSE                INTERVAL '1 year'
    END
  ))::DATE;

  v_pulse := get_platform_pulse(p_period_start, v_period_end);

  INSERT INTO kpi_snapshots (period_kind, period_start, kpi_key, value, computed_at)
  SELECT p_period_kind, p_period_start, e.key,
         -- A non-numeric or absent value stores as NULL, which is the honest
         -- record. jsonb_typeof guards the cast rather than letting it raise
         -- and abandon the whole snapshot over one field.
         CASE WHEN jsonb_typeof(e.value) = 'number' THEN (e.value #>> '{}')::NUMERIC END,
         now()
  FROM jsonb_each(v_pulse) AS e(key, value)
  WHERE e.key NOT IN ('period_start', 'period_end', 'computed_at')
  ON CONFLICT (period_kind, period_start, kpi_key) DO UPDATE
    SET value = EXCLUDED.value, computed_at = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END; $fn$;

REVOKE ALL ON FUNCTION public.snapshot_kpis(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_kpis(TEXT, DATE) TO authenticated;
-- The weekly cron calls this with the service role and no user session.
GRANT EXECUTE ON FUNCTION public.snapshot_kpis(TEXT, DATE) TO service_role;

-- ============================================================
-- 3. read_kpi_history()
--
-- The Pulse page's series reader. A definer function rather than a direct
-- select so a future non-org:manage reporting seat can be given history without
-- being given the live pulse.
-- ============================================================

CREATE OR REPLACE FUNCTION public.read_kpi_history(
  p_period_kind TEXT,
  p_limit       INTEGER DEFAULT 26
)
RETURNS TABLE(period_start DATE, kpi_key TEXT, value NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT s.period_start, s.kpi_key, s.value
    FROM kpi_snapshots s
    WHERE s.period_kind = p_period_kind
      AND s.period_start IN (
        SELECT DISTINCT k.period_start FROM kpi_snapshots k
        WHERE k.period_kind = p_period_kind
        ORDER BY k.period_start DESC
        LIMIT GREATEST(p_limit, 1)
      )
    ORDER BY s.period_start DESC, s.kpi_key;
END; $fn$;

REVOKE ALL ON FUNCTION public.read_kpi_history(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_kpi_history(TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 4. Verification
--
--   -- take this week's reading (Monday-anchored)
--   SELECT snapshot_kpis('week', date_trunc('week', now())::DATE);
--
--   -- re-running corrects rather than duplicates
--   SELECT snapshot_kpis('week', date_trunc('week', now())::DATE);
--   SELECT count(*) FROM kpi_snapshots WHERE period_kind = 'week';
--
--   -- backfill the last twelve months
--   SELECT snapshot_kpis('month', d::DATE)
--     FROM generate_series(date_trunc('month', now()) - INTERVAL '11 months',
--                          date_trunc('month', now()), INTERVAL '1 month') AS d;
--   -- NOTE: point-in-time KPIs backfilled this way carry TODAY's reading under
--   -- a past date. Only cumulative ones (registrations, events, posts) are
--   -- genuinely historical. Backfill for shape, not for reporting.
-- ============================================================
