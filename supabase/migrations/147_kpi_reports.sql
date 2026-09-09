-- Migration 147: the periodic reports (roadmap §14 Table 39).
--
-- The roadmap's reporting pulse names a Monthly Report ("detailed KPI
-- performance; user stories; risk updates, ticket summary"), a Quarterly
-- Report and an Annual State of Ecosystem Report, and Table 15 makes
-- "monthly dashboard reports shared with OECS Commission" a Phase 1 success
-- criterion. Until now the platform recorded readings (132) and rendered a
-- matrix; nothing narrated a period and nothing was delivered.
--
-- A report is a ROW, written by a scheduled job on the first of the month
-- from the readings the platform took, with commentary drafted by a model and
-- reviewed by a person before anyone outside sees it. Three things about the
-- shape are deliberate:
--
--   fact_pack     the exact figures the model was shown, kept with the report.
--                 A narrative whose inputs cannot be produced is not evidence.
--   status        draft until a named administrator publishes it. Roadmap §7:
--                 AI-assisted content requires human review before publication
--                 and its role is disclosed.
--   INSERT        service role only. The job and the admin route write; a user
--                 session, however privileged, edits and publishes what exists.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. kpi_reports
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_reports (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_kind        TEXT NOT NULL CHECK (period_kind IN ('month', 'quarter', 'year')),
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),

  -- What the model saw, verbatim. Never edited after generation.
  fact_pack          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The editable parts. NULL summary means the model was unavailable and the
  -- report carries figures only — still a report, honestly blank.
  summary_md         TEXT,
  sections           JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_actions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  at_risk            JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_quality_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlights         JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Provenance: which model, which prompt, when. NULL model means no model ran.
  model              TEXT,
  prompt_version     TEXT,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  published_at       TIMESTAMPTZ,
  published_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at            TIMESTAMPTZ,
  sent_to            JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (period_kind, period_start),
  -- A published report names who published it. An anonymous publication is
  -- the thing an audit finds.
  CONSTRAINT kpi_reports_published_is_attributed CHECK (
    status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL)
  )
);

COMMENT ON TABLE kpi_reports IS
  'Roadmap §14 Table 39 periodic reports. Drafted from kpi readings by a scheduled job (commentary by a model), reviewed and published by an administrator. fact_pack is what the model saw.';

CREATE INDEX IF NOT EXISTS idx_kpi_reports_kind_start ON kpi_reports(period_kind, period_start DESC);

ALTER TABLE kpi_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Console holders can read reports" ON kpi_reports;
CREATE POLICY "Console holders can read reports"
  ON kpi_reports FOR SELECT
  USING (has_permission(auth.uid(), 'org:manage'));

-- Editing is allowed on a draft only. Publishing goes through
-- publish_kpi_report() so the publisher is recorded as auth.uid() and never
-- chosen by the writer; a published report is read-only from a session.
DROP POLICY IF EXISTS "Operators can edit draft reports" ON kpi_reports;
CREATE POLICY "Operators can edit draft reports"
  ON kpi_reports FOR UPDATE
  USING (has_permission(auth.uid(), 'org:manage') AND status = 'draft')
  WITH CHECK (has_permission(auth.uid(), 'org:manage') AND status = 'draft');

DROP POLICY IF EXISTS "Operators can delete draft reports" ON kpi_reports;
CREATE POLICY "Operators can delete draft reports"
  ON kpi_reports FOR DELETE
  USING (has_permission(auth.uid(), 'org:manage') AND status = 'draft');

-- No INSERT policy: only the service role writes a report.

DROP TRIGGER IF EXISTS kpi_reports_touch ON kpi_reports;
CREATE OR REPLACE FUNCTION public.kpi_reports_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $fn$;
CREATE TRIGGER kpi_reports_touch
  BEFORE UPDATE ON kpi_reports
  FOR EACH ROW EXECUTE FUNCTION public.kpi_reports_touch_updated_at();

-- ============================================================
-- 2. kpi_report_recipients — who a published report is sent to
--
-- Table 39 names the audiences: CBU, the two Technical Specialists, OECS TSIE
-- for the monthly report; RPIU for the quarterly. Their addresses are data,
-- edited from the console, not a deploy.
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_report_recipients (
  email      TEXT PRIMARY KEY CHECK (email = lower(email) AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  label      TEXT,
  -- Which reports they receive.
  kinds      TEXT[] NOT NULL DEFAULT ARRAY['month', 'quarter', 'year'],
  added_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kpi_report_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators manage report recipients" ON kpi_report_recipients;
CREATE POLICY "Operators manage report recipients"
  ON kpi_report_recipients FOR ALL
  USING (has_permission(auth.uid(), 'org:manage'))
  WITH CHECK (has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 3. publish_kpi_report()
-- ============================================================

CREATE OR REPLACE FUNCTION public.publish_kpi_report(p_id UUID)
RETURNS kpi_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row kpi_reports;
BEGIN
  IF auth.uid() IS NULL OR NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE kpi_reports
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = p_id AND status = 'draft'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'report not found or already published' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END; $fn$;

REVOKE ALL ON FUNCTION public.publish_kpi_report(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_kpi_report(UUID) TO authenticated;

-- ============================================================
-- 4. get_report_fact_pack()
--
-- Everything a period's report is built from, in one round trip: the merged
-- pulse for the period and for the one before it, the targets in force, the
-- snapshot history at that cadence, and the public highlights — the roadmap's
-- "user stories" — as titles only. No member record leaves this function; a
-- project title that is already public is the most personal thing in it.
--
-- Status and progress are NOT computed here. They come from kpiProgress() /
-- kpiStatus() in src/lib/kpi-catalog.ts, the same functions the tiles use,
-- so the report and the console cannot disagree.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_report_fact_pack(
  p_period_kind  TEXT,
  p_period_start DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_step        INTERVAL;
  v_period_end  DATE;
  v_prior_start DATE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_period_kind NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION 'unknown period kind: %', p_period_kind USING ERRCODE = '22023';
  END IF;

  v_step := CASE p_period_kind WHEN 'month' THEN INTERVAL '1 month'
                               WHEN 'quarter' THEN INTERVAL '3 months'
                               ELSE INTERVAL '1 year' END;
  v_period_end  := (p_period_start + v_step)::DATE;
  v_prior_start := (p_period_start - v_step)::DATE;

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'kind', p_period_kind, 'start', p_period_start, 'end', v_period_end,
      'prior_start', v_prior_start, 'prior_end', p_period_start
    ),
    'computed_at', now(),

    'pulse',
      get_platform_pulse(p_period_start, v_period_end)
      || COALESCE(get_phase2_pulse(p_period_start, v_period_end), '{}'::JSONB)
      || COALESCE(get_phase3_pulse(p_period_start, v_period_end), '{}'::JSONB)
      || COALESCE(get_phase4_pulse(p_period_start, v_period_end), '{}'::JSONB),
    'prior_pulse',
      get_platform_pulse(v_prior_start, p_period_start)
      || COALESCE(get_phase2_pulse(v_prior_start, p_period_start), '{}'::JSONB)
      || COALESCE(get_phase3_pulse(v_prior_start, p_period_start), '{}'::JSONB)
      || COALESCE(get_phase4_pulse(v_prior_start, p_period_start), '{}'::JSONB),

    'targets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'kpi_key', t.kpi_key, 'target_value', t.target_value, 'unit', t.unit,
        'period_start', t.period_start, 'period_end', t.period_end, 'note', t.note
      )), '[]'::JSONB)
      FROM kpi_targets t
      WHERE t.period_start <= p_period_start AND t.period_end >= p_period_start
    ),

    -- The last thirteen readings at this cadence, oldest first, so a trend
    -- can be stated from what was recorded rather than recomputed.
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'period_start', h.period_start, 'kpi_key', h.kpi_key, 'value', h.value
      ) ORDER BY h.period_start), '[]'::JSONB)
      FROM kpi_snapshots h
      WHERE h.period_kind = p_period_kind
        AND h.period_start IN (
          SELECT DISTINCT s.period_start FROM kpi_snapshots s
          WHERE s.period_kind = p_period_kind AND s.period_start <= p_period_start
          ORDER BY s.period_start DESC LIMIT 13
        )
    ),

    -- Public highlights only. Titles of things already visible to every member.
    'highlights', jsonb_build_object(
      'projects', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('title', p.title, 'category', p.category) ORDER BY p.created_at DESC), '[]'::JSONB)
        FROM (SELECT title, category, created_at FROM projects
              WHERE is_public AND created_at >= p_period_start AND created_at < v_period_end
              ORDER BY created_at DESC LIMIT 5) p
      ),
      'events', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('title', e.title, 'type', e.event_type, 'date', e.start_date::DATE) ORDER BY e.start_date DESC), '[]'::JSONB)
        FROM (SELECT title, event_type, start_date FROM events
              WHERE status IN ('published', 'completed')
                AND start_date >= p_period_start AND start_date < v_period_end
              ORDER BY start_date DESC LIMIT 5) e
      ),
      'resources', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('title', r.title, 'type', r.resource_type) ORDER BY r.created_at DESC), '[]'::JSONB)
        FROM (SELECT title, resource_type, created_at FROM resources
              WHERE is_published AND created_at >= p_period_start AND created_at < v_period_end
              ORDER BY created_at DESC LIMIT 5) r
      ),
      'grants_awarded', (
        SELECT COUNT(*) FROM grant_applications
        WHERE status = 'approved' AND updated_at >= p_period_start AND updated_at < v_period_end
      )
    ),

    'meta', jsonb_build_object(
      'total_members', (SELECT COUNT(*) FROM profiles),
      'oecs_states_flagged', (SELECT COUNT(*) FROM countries WHERE is_oecs_member),
      'roadmap_oecs_states', 12
    )
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.get_report_fact_pack(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_report_fact_pack(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_fact_pack(TEXT, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 5. Verification
--
--   -- a session cannot create a report
--   INSERT INTO kpi_reports (period_kind, period_start, period_end)
--   VALUES ('month', '2026-08-01', '2026-09-01');                       -- refused
--
--   -- a published report cannot be edited from a session
--   UPDATE kpi_reports SET summary_md = 'x' WHERE status = 'published'; -- 0 rows
--
--   -- the fact pack carries both windows and the targets
--   SELECT jsonb_object_keys(get_report_fact_pack('month', '2026-08-01'));
--   -- period, computed_at, pulse, prior_pulse, targets, history, highlights, meta
-- ============================================================
