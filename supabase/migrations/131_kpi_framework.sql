-- Migration 131: the roadmap's results framework, and the reasons the old
-- numbers could not be trusted.
--
-- From the feedback queue on 2026-09-01: "We need to refine the admin dashboard
-- to make sure the metrics being tracked are aligned with the action plan."
-- The action plan is §14 of `OECS SKIP KTIP Roadmap v1.1 July 2026`, Tables
-- 32-39 — around thirty KPIs with targets, cadences and reporting obligations,
-- none of which the dashboard expressed.
--
-- Before adding any of them, this migration fixes the reason the existing
-- numbers were not safe to report:
--
-- 1. THE SEVEN ANALYTICS RPCs RAN AS THE CALLER, WITH EXECUTE GRANTED TO
--    PUBLIC. Two consequences, both bad and in opposite directions. Any
--    anonymous session could call get_users_by_country() and read whatever the
--    public profiles policy exposed. And an admin calling
--    get_projects_by_category() got a chart with the private projects silently
--    missing — RLS filtered them out and nothing said so. The chart was simply
--    wrong, in a way that looked exactly like a correct chart.
--
--    Fixed by making them SECURITY DEFINER — which CHANGES THE ANSWER, and that
--    is the point — with an in-body org:manage guard that RAISES, and EXECUTE
--    revoked from PUBLIC. The guard is load-bearing, not decoration: a definer
--    function granted to `authenticated` without it would hand every member a
--    platform-wide census.
--
-- 2. THEY RETURNED AN EMPTY SET WHERE THEY SHOULD HAVE FAILED. A refused or
--    missing RPC arrived at the client as `[]` and rendered as "No data
--    available" — indistinguishable from a platform that genuinely has no
--    projects. Raising is what lets src/lib/measured.ts tell the two apart.
--
-- 3. THREE TABLES STILL GATE ON THE PRE-125 ROLE SLUG. `roles @> ARRAY['oecs']`
--    was correct when it was written. Since 125 `oecs` is an ALIAS resolved by
--    expand_roles(), and a modern super_admin's `roles` array does not contain
--    the literal string — so the platform's own analytics, pre-registrations
--    and topic aliases are unreadable by the two seats that own them. Combined
--    with (2), /admin/analytics rendered a confident zero for exactly the people
--    it was built for.
--
-- 4. get_user_growth DROPPED ZERO-SIGNUP MONTHS, so the growth chart's x-axis
--    was not evenly spaced in time and a quiet month looked like no month.
--
-- Then the framework itself: kpi_targets (the roadmap's numbers, as data) and
-- get_platform_pulse() (every Phase 1 KPI in one round trip).
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. The seven analytics RPCs, hardened
--
-- CREATE OR REPLACE cannot change a function's argument types or its
-- RETURNS TABLE column list — it creates an OVERLOAD, and PostgREST then
-- answers PGRST203 "could not choose the best candidate" for every call. The
-- signatures below are unchanged except for get_user_growth, which is dropped
-- first because its arguments move from TIMESTAMP to TIMESTAMPTZ.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_users_by_role()
RETURNS TABLE(role TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT unnest(p.roles), COUNT(*) FROM profiles p GROUP BY 1 ORDER BY 2 DESC;
END; $fn$;

-- No LIMIT, unlike 016's version. The OECS-coverage KPI (T33/T38) asks "have we
-- reached every member state", and a LIMIT 15 answers that question wrongly and
-- silently as soon as there are more than fifteen countries.
CREATE OR REPLACE FUNCTION public.get_users_by_country()
RETURNS TABLE(country TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT COALESCE(p.country, 'Unknown'), COUNT(*)
    FROM profiles p GROUP BY 1 ORDER BY 2 DESC;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_projects_by_category()
RETURNS TABLE(category TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT COALESCE(p.category, 'uncategorized'), COUNT(*)
    FROM projects p GROUP BY 1 ORDER BY 2 DESC;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_projects_by_phase()
RETURNS TABLE(phase TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.phase, COUNT(*) FROM projects p GROUP BY 1 ORDER BY 2 DESC;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_grant_application_pipeline()
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT ga.status, COUNT(*) FROM grant_applications ga GROUP BY 1 ORDER BY 2 DESC;
END; $fn$;

CREATE OR REPLACE FUNCTION public.get_events_by_type()
RETURNS TABLE(event_type TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.event_type, COUNT(*) FROM events e GROUP BY 1 ORDER BY 2 DESC;
END; $fn$;

-- Gap-filled over generate_series. 016's version grouped existing rows, so a
-- month with no signups was absent from the result entirely and the chart
-- silently closed the gap — twelve bars that are not twelve consecutive months.
DROP FUNCTION IF EXISTS public.get_user_growth(TIMESTAMP, TIMESTAMP);
DROP FUNCTION IF EXISTS public.get_user_growth(TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION public.get_user_growth(
  start_date TIMESTAMPTZ DEFAULT now() - INTERVAL '12 months',
  end_date   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(month TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT to_char(m, 'YYYY-MM'),
           (SELECT COUNT(*) FROM profiles p
             WHERE p.created_at >= m AND p.created_at < m + INTERVAL '1 month')
    FROM generate_series(
      date_trunc('month', start_date),
      date_trunc('month', end_date),
      INTERVAL '1 month'
    ) AS m
    ORDER BY 1;
END; $fn$;

REVOKE ALL ON FUNCTION public.get_users_by_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_users_by_country() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_projects_by_category() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_projects_by_phase() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_grant_application_pipeline() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_events_by_type() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_growth(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_users_by_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_country() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_projects_by_category() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_projects_by_phase() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_grant_application_pipeline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_events_by_type() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_growth(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- 2. The pre-125 role-slug policies
--
-- has_permission(auth.uid(), 'org:manage'), NOT is_platform_admin(). 116's
-- header makes the argument: the page a supervisor can see must be the page a
-- supervisor can write. /admin/analytics is gated on org:manage in the router
-- and in AdminLayout, so the policy has to ask the same question the route
-- asks. is_platform_admin() would hardcode the two seats and pre-emptively lock
-- out any future analytics delegate.
-- ============================================================

DROP POLICY IF EXISTS "Admins can view analytics" ON analytics_events;
CREATE POLICY "Admins can view analytics"
  ON analytics_events FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can delete analytics" ON analytics_events;
CREATE POLICY "Admins can delete analytics"
  ON analytics_events FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can view all preregistrations" ON preregistrations;
CREATE POLICY "Admins can view all preregistrations"
  ON preregistrations FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can update preregistrations" ON preregistrations;
CREATE POLICY "Admins can update preregistrations"
  ON preregistrations FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Admins can delete preregistrations" ON preregistrations;
CREATE POLICY "Admins can delete preregistrations"
  ON preregistrations FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "OECS admins manage topic aliases" ON topic_aliases;
CREATE POLICY "OECS admins manage topic aliases"
  ON topic_aliases FOR ALL
  USING (has_permission(auth.uid(), 'org:manage'))
  WITH CHECK (has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 3. kpi_targets — the roadmap's numbers, as data
--
-- The meaning of a KPI is code (src/lib/kpi-catalog.ts) because it must be
-- reviewed. Its TARGET is data, because §14's figures are year-by-year
-- (100/200/300/400/400 for T32) and will be renegotiated with the World Bank
-- without a deploy.
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_targets (
  kpi_key      TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  target_value NUMERIC NOT NULL,
  unit         TEXT NOT NULL,
  note         TEXT,
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kpi_key, period_start)
);

COMMENT ON TABLE kpi_targets IS
  'Roadmap v1.1 §14 targets (Tables 32-38). Editable by org:manage without a deploy; the KPI definitions themselves live in src/lib/kpi-catalog.ts.';

ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Console holders can read KPI targets" ON kpi_targets;
CREATE POLICY "Console holders can read KPI targets"
  ON kpi_targets FOR SELECT
  USING (has_permission(auth.uid(), 'org:manage'));

DROP POLICY IF EXISTS "Operators can set KPI targets" ON kpi_targets;
CREATE POLICY "Operators can set KPI targets"
  ON kpi_targets FOR ALL
  USING (has_permission(auth.uid(), 'org:manage'))
  WITH CHECK (has_permission(auth.uid(), 'org:manage'));

-- Seed from §14. ON CONFLICT DO NOTHING so a renegotiated target entered
-- through the console is never reverted by a re-run.
INSERT INTO kpi_targets (kpi_key, period_start, period_end, target_value, unit, note) VALUES
  -- T32 PAD evaluation metrics, annual to 2030
  ('t32.firms_participating', '2026-01-01', '2026-12-31', 100, 'count', 'PAD Table 32'),
  ('t32.firms_participating', '2027-01-01', '2027-12-31', 200, 'count', 'PAD Table 32'),
  ('t32.firms_participating', '2028-01-01', '2028-12-31', 300, 'count', 'PAD Table 32'),
  ('t32.firms_participating', '2029-01-01', '2029-12-31', 400, 'count', 'PAD Table 32'),
  ('t32.firms_participating', '2030-01-01', '2030-12-31', 400, 'count', 'PAD Table 32'),
  ('t32.innovations_adopted',  '2029-01-01', '2029-12-31', 2, 'count', 'PAD Table 32; attested, not measured'),
  ('t32.innovations_adopted',  '2030-01-01', '2030-12-31', 4, 'count', 'PAD Table 32; attested, not measured'),

  -- T33 Community growth
  ('t33.new_registrations_firms', '2026-01-01', '2026-12-31', 100, 'count', 'Table 33'),
  ('t33.new_registrations_total', '2026-01-01', '2026-12-31', 300, 'count', 'Table 33'),
  ('t33.verified_mentors_investors', '2026-01-01', '2026-12-31', 25, 'count', 'Table 33'),
  ('t33.active_mentors',   '2026-01-01', '2026-12-31', 15, 'count', 'Table 33'),
  ('t33.active_investors', '2026-01-01', '2026-12-31', 10, 'count', 'Table 33'),
  -- The roadmap says 12 member states; the countries table currently holds 11
  -- flagged rows. The DENOMINATOR is read from the table, never hardcoded — see
  -- get_platform_pulse below — and the discrepancy is a question for the
  -- programme lead, not something to paper over here.
  ('t33.oecs_state_coverage', '2026-01-01', '2026-12-31', 12, 'count', 'Table 33; reconcile with countries.is_oecs_member (11 rows)'),

  -- T34 User engagement
  ('t34.mau_pct',      '2026-01-01', '2026-12-31', 40, 'percent', 'Table 34'),
  ('t34.dau_pct',      '2026-01-01', '2026-12-31', 15, 'percent', 'Table 34'),
  ('t34.session_minutes', '2026-01-01', '2026-12-31', 8, 'minutes', 'Table 34; Phase 2'),
  ('t34.retention_pct', '2026-01-01', '2026-12-31', 90, 'percent', 'Table 34'),
  ('t34.nps',          '2026-01-01', '2026-12-31', 30, 'nps', 'Table 34; Phase 2'),

  -- T35 Platform activity
  ('t35.active_projects',        '2026-01-01', '2026-12-31', 50, 'count', 'Table 35'),
  ('t35.active_mentorships',     '2026-01-01', '2026-12-31', 20, 'count', 'Table 35; Phase 2'),
  ('t35.challenges_completed',   '2026-01-01', '2026-12-31', 2,  'count', 'Table 35'),
  ('t35.challenge_submissions',  '2026-01-01', '2026-12-31', 50, 'count', 'Table 35, per challenge'),
  ('t35.projects_per_month',     '2026-01-01', '2026-12-31', 5,  'count', 'Table 35'),
  ('t35.forum_posts_per_month',  '2026-01-01', '2026-12-31', 50, 'count', 'Table 35'),
  ('t35.events_per_month',       '2026-01-01', '2026-12-31', 4,  'count', 'Table 35'),
  ('t35.connections_per_active_user', '2026-01-01', '2026-12-31', 5, 'count', 'Table 35'),

  -- T36 Platform health
  ('t36.uptime_pct',        '2026-01-01', '2026-12-31', 99.5, 'percent', 'Table 36; Phase 3'),
  ('t36.error_rate_5xx',    '2026-01-01', '2026-12-31', 0.5,  'percent', 'Table 36; Phase 3, lower is better'),
  ('t36.ticket_hours',      '2026-01-01', '2026-12-31', 24,   'hours',   'Table 36, lower is better'),
  ('t36.satisfaction',      '2026-01-01', '2026-12-31', 4.0,  'rating',  'Table 36'),

  -- T37 Economic impact
  ('t37.users_connected_to_funding', '2026-01-01', '2026-12-31', 50, 'count', 'Table 37'),
  ('t37.capital_facilitated_xcd',    '2026-01-01', '2026-12-31', 1000000, 'currency_xcd', 'Table 37; Phase 2'),
  ('t37.grants_awarded',             '2026-01-01', '2026-12-31', 10, 'count', 'Table 37'),

  -- T38 Other
  ('t38.non_grant_revenue_pct', '2026-01-01', '2026-12-31', 25, 'percent', 'Table 38; Phase 3, attested'),
  ('t38.under_35_pct',          '2026-01-01', '2026-12-31', 60, 'percent', 'Table 38'),
  ('t38.female_pct',            '2026-01-01', '2026-12-31', 45, 'percent', 'Table 38; Phase 2')
ON CONFLICT (kpi_key, period_start) DO NOTHING;

-- ============================================================
-- 4. get_platform_pulse()
--
-- One JSONB blob rather than a twenty-query wave from the client, for the
-- reasons 114_member_stats_rpc.sql sets out: one round trip, each figure hard
-- scoped inside the function, and NULL — never 0 — for anything that could not
-- be read.
--
-- SECURITY DEFINER because several of these aggregate tables whose RLS is
-- own-rows-only. user_activity_days (066) is the important one: it holds one row
-- per member per active day, is written on every check_my_achievements() call,
-- and is therefore the consent-free source for MAU/DAU/retention.
-- analytics_events is NOT used for those — its inserts are consent-gated, so it
-- can only ever describe consenting sessions.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_platform_pulse(
  p_period_start DATE DEFAULT date_trunc('month', now())::DATE,
  p_period_end   DATE DEFAULT (now() + INTERVAL '1 day')::DATE
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_total_members BIGINT;
  v_oecs_states   BIGINT;
  v_mau           BIGINT;
  v_dau           BIGINT;
  v_result        JSONB;
BEGIN
  -- NULL auth.uid() is the SERVICE ROLE (api/cron/kpi-snapshot.ts calling
  -- through snapshot_kpis), never an anonymous visitor: EXECUTE is revoked from
  -- PUBLIC and anon, so anon never reaches this body. Every authenticated caller
  -- has a uid and is checked normally.
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total_members FROM profiles;

  -- The denominator for OECS coverage. Read from the table, never hardcoded to
  -- the roadmap's "12": src/lib/countries.ts lists 11 and countries has 11
  -- flagged rows, so a literal would make the KPI unfalsifiable.
  SELECT COUNT(*) INTO v_oecs_states FROM countries WHERE is_oecs_member;

  SELECT COUNT(DISTINCT user_id) INTO v_mau
  FROM user_activity_days WHERE activity_date > CURRENT_DATE - 30;

  SELECT COUNT(DISTINCT user_id) INTO v_dau
  FROM user_activity_days WHERE activity_date = CURRENT_DATE;

  v_result := jsonb_build_object(
    'period_start', p_period_start,
    'period_end',   p_period_end,
    'computed_at',  now(),

    'total_members', v_total_members,

    -- T32. "Actively participating" is undefined by the roadmap. Decided as:
    -- holds a firm/entrepreneur-tier role AND has at least one activity day
    -- inside the period. Registration alone is not participation, which is why
    -- this is not the same figure as t33.new_registrations_firms.
    't32.firms_participating', (
      SELECT COUNT(DISTINCT p.id) FROM profiles p
      JOIN user_activity_days a ON a.user_id = p.id
      WHERE p.roles && ARRAY['entrepreneur','private_sector','chamber_admin','ngo','sme']::TEXT[]
        AND a.activity_date >= p_period_start AND a.activity_date < p_period_end
    ),

    -- T33
    't33.new_registrations_total', (
      SELECT COUNT(*) FROM profiles
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),
    't33.new_registrations_firms', (
      SELECT COUNT(*) FROM profiles
      WHERE created_at >= p_period_start AND created_at < p_period_end
        AND roles && ARRAY['entrepreneur','private_sector','chamber_admin','ngo','sme']::TEXT[]
    ),
    't33.verified_mentors_investors', (
      SELECT COUNT(*) FROM profiles
      WHERE is_verified AND roles && ARRAY['mentor','investor']::TEXT[]
    ),
    -- "Active" is not defined by the roadmap. Decided here and documented in
    -- kpi-catalog.ts: holds the role AND has at least one activity day in the
    -- last 30.
    't33.active_mentors', (
      SELECT COUNT(DISTINCT p.id) FROM profiles p
      JOIN user_activity_days a ON a.user_id = p.id
      WHERE p.roles && ARRAY['mentor']::TEXT[] AND a.activity_date > CURRENT_DATE - 30
    ),
    't33.active_investors', (
      SELECT COUNT(DISTINCT p.id) FROM profiles p
      JOIN user_activity_days a ON a.user_id = p.id
      WHERE p.roles && ARRAY['investor']::TEXT[] AND a.activity_date > CURRENT_DATE - 30
    ),
    't33.oecs_state_coverage', (
      SELECT COUNT(DISTINCT c.name) FROM countries c
      WHERE c.is_oecs_member AND EXISTS (SELECT 1 FROM profiles p WHERE p.country = c.name)
    ),
    't33.oecs_state_total', v_oecs_states,

    -- T34
    't34.mau', v_mau,
    't34.dau', v_dau,
    't34.mau_pct', CASE WHEN v_total_members > 0
      THEN ROUND(v_mau::NUMERIC * 100 / v_total_members, 1) END,
    't34.dau_pct', CASE WHEN v_total_members > 0
      THEN ROUND(v_dau::NUMERIC * 100 / v_total_members, 1) END,
    -- Month-over-month retention: of the members active in the previous 30-day
    -- window, how many were also active in the current one.
    't34.retention_pct', (
      SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM user_activity_days b
          WHERE b.user_id = prior.user_id AND b.activity_date > CURRENT_DATE - 30
        ))::NUMERIC * 100 / COUNT(*), 1) END
      FROM (
        SELECT DISTINCT user_id FROM user_activity_days
        WHERE activity_date > CURRENT_DATE - 60 AND activity_date <= CURRENT_DATE - 30
      ) AS prior
    ),

    -- T35. "Active project" is undefined by the roadmap; decided as public,
    -- active and touched in the last 90 days.
    't35.active_projects', (
      SELECT COUNT(*) FROM projects
      WHERE is_public AND status = 'active' AND updated_at > now() - INTERVAL '90 days'
    ),
    't35.challenges_completed', (
      SELECT COUNT(*) FROM events
      WHERE event_type = 'challenge' AND status = 'completed'
        AND start_date >= p_period_start AND start_date < p_period_end
    ),
    't35.challenge_submissions', (SELECT COUNT(*) FROM event_solutions),
    't35.projects_created', (
      SELECT COUNT(*) FROM projects
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),
    't35.forum_posts', (
      SELECT COUNT(*) FROM forum_posts
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),
    't35.events_hosted', (
      SELECT COUNT(*) FROM events
      WHERE status IN ('published','completed')
        AND start_date >= p_period_start AND start_date < p_period_end
    ),
    't35.connections_made', (
      SELECT COUNT(*) FROM connections
      WHERE status = 'accepted' AND created_at >= p_period_start AND created_at < p_period_end
    ),
    't35.connections_per_active_user', CASE WHEN v_mau > 0 THEN (
      SELECT ROUND(COUNT(*)::NUMERIC / v_mau, 2) FROM connections
      WHERE status = 'accepted' AND created_at >= p_period_start AND created_at < p_period_end
    ) END,

    -- T36. `feedback` IS the ticket queue — 093 gave it a 1-5 rating and 127 a
    -- replied_at. No separate tickets table was invented for this.
    't36.satisfaction', (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM feedback WHERE rating IS NOT NULL),
    't36.ticket_hours', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (replied_at - created_at)) / 3600)::NUMERIC, 1)
      FROM feedback WHERE replied_at IS NOT NULL
    ),

    -- T37
    't37.users_connected_to_funding', (
      SELECT COUNT(DISTINCT user_id) FROM grant_applications
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),
    't37.grants_awarded', (
      SELECT COUNT(*) FROM grant_applications
      WHERE status = 'approved' AND updated_at >= p_period_start AND updated_at < p_period_end
    ),

    -- T38. account_age must never be joined into a query that returns rows
    -- (091's own instruction) — a COUNT out of a definer function is the whole
    -- of what leaves this table. The denominator is members who declared, not
    -- all members, so the figure is honest about its coverage.
    't38.under_35_declared', (SELECT COUNT(*) FROM account_age WHERE date_of_birth IS NOT NULL),
    't38.under_35_count', (
      SELECT COUNT(*) FROM account_age
      WHERE date_of_birth IS NOT NULL
        AND date_of_birth > (CURRENT_DATE - INTERVAL '35 years')
    )
  );

  RETURN v_result;
END; $fn$;

REVOKE ALL ON FUNCTION public.get_platform_pulse(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_pulse(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_pulse(DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 5. Verification
--
--   -- anonymous execute is gone
--   SELECT has_function_privilege('anon', 'get_users_by_country()', 'EXECUTE');  -- f
--
--   -- twelve consecutive months, gaps included
--   SELECT count(*) FROM get_user_growth();                                      -- 13
--
--   -- the coverage denominator comes from the table, not the roadmap
--   SELECT (get_platform_pulse() ->> 't33.oecs_state_total')::INT;               -- 11 today
--
--   -- a modern super_admin can read the analytics table again
--   SELECT count(*) FROM analytics_events;
--
--   -- targets are seeded and editable
--   SELECT count(*) FROM kpi_targets;                                            -- 37
-- ============================================================
