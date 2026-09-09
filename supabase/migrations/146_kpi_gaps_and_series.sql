-- Migration 146: the indicators the roadmap states outside §14's tables, a
-- time-series reader for the analytics hub, and a feeder for health samples.
--
-- Audited the six documents in the repo root against src/lib/kpi-catalog.ts.
-- The §14 tables (32–38) were covered by 131–134. What was not:
--
--   §3 objectives            knowledge resources published; partners integrated
--   Table 15 (Phase 1)       event registrations; library reach; grants listed;
--                            grants directory reach; users via partnerships
--   Table 16/17              challenge submissions from >= 7 states; diaspora
--   §5 / §6                  flagged content reviewed within 24h; complaint
--                            volumes "published in the monthly and quarterly
--                            report"
--   Table 36                 p75 page load and security incidents — which
--                            get_phase3_pulse already emits and nothing rendered
--
-- Three things here, and the split matters:
--
--   1. get_phase4_pulse()    the readings, same contract as 131–134
--   2. get_kpi_series()      a metric over time, zero-filled, optional country
--   3. sample_platform_health()
--                            the only writer of platform_health_samples (134):
--                            p75 LCP from real-user beacons, uptime and 5xx
--                            rate accepted from an external probe and stored
--                            NULL otherwise. Service role only.
--
-- snapshot_kpis() is redefined to merge all four pulses. Until now it wrote
-- Phase 1 only, so every Phase 2/3 figure was blank in the history matrix even
-- where its collector had data.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. Targets (ON CONFLICT DO NOTHING — a renegotiated target entered through
--    the console is never reverted by a re-run)
-- ============================================================

INSERT INTO kpi_targets (kpi_key, period_start, period_end, target_value, unit, note) VALUES
  ('t33.resources_published',        '2026-01-01', '2026-12-31', 50,   'count',        '§3, Table 15: 50+ curated resources'),
  ('t33.partners_integrated',        '2026-01-01', '2026-12-31', 10,   'count',        '§3: 10+ partners formally integrated'),
  ('t33.partner_onboarded_users',    '2026-01-01', '2026-12-31', 50,   'count',        'Table 15: 50+ users onboarded through partnerships (100+ by Month 6, Table 16)'),
  ('t33.diaspora_members',           '2026-01-01', '2026-12-31', 50,   'count',        'Table 17; Phase 2'),
  ('t35.event_registrations',        '2026-01-01', '2026-12-31', 500,  'count',        'Table 15: 500+ event registrations'),
  ('t35.resource_reach_pct',         '2026-01-01', '2026-12-31', 70,   'percent',      'Table 15: resources accessed by 70%+ of users; consenting sessions only'),
  ('t35.challenge_submission_states','2026-01-01', '2026-12-31', 7,    'count',        'Table 16: submissions from >= 7 OECS states'),
  ('t36.p75_lcp_ms',                 '2026-01-01', '2026-12-31', 3000, 'milliseconds', 'Table 36: <3 seconds on 3G; lower is better'),
  ('t36.security_incidents',         '2026-01-01', '2026-12-31', 0,    'count',        'Table 36: zero critical breaches; lower is better'),
  ('t36.moderation_review_hours',    '2026-01-01', '2026-12-31', 24,   'hours',        '§5: flagged content reviewed within 24 hours; lower is better'),
  ('t37.grants_listed',              '2026-01-01', '2026-12-31', 20,   'count',        'Table 15: 20+ funding opportunities listed'),
  ('t37.grants_directory_reach_pct', '2026-01-01', '2026-12-31', 60,   'percent',      'Table 15: directory accessed by >= 60% of active users monthly; consenting sessions only'),
  ('t37.projects_reached_revenue',   '2026-01-01', '2026-12-31', 5,    'count',        '§3: 5 projects tracked to early-stage revenue; Phase 3, attested')
ON CONFLICT (kpi_key, period_start) DO NOTHING;

-- ============================================================
-- 2. get_phase4_pulse()
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_phase4_pulse(
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
  v_mau BIGINT;
BEGIN
  -- NULL auth.uid() is the SERVICE ROLE (the cron through snapshot_kpis), never
  -- an anonymous visitor: EXECUTE is revoked from PUBLIC and anon below.
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- The same MAU 131 reports, as the denominator for the two reach figures.
  SELECT COUNT(DISTINCT user_id) INTO v_mau
  FROM user_activity_days WHERE activity_date > CURRENT_DATE - 30;

  RETURN jsonb_build_object(
    -- §3 / Table 15. Cumulative: the roadmap counts a library, not a month.
    't33.resources_published', (SELECT COUNT(*) FROM resources WHERE is_published),

    -- "Formally integrated" is undefined; a completed verification is the
    -- closest thing recorded to a signed MOU, and both tables require the
    -- verifier's name and date (058, 064).
    't33.partners_integrated', (
      (SELECT COUNT(*) FROM institutions WHERE status = 'verified')
      + (SELECT COUNT(*) FROM employers WHERE verification_status = 'verified')
    ),

    -- Arrived through the Virtual Campus, or approved into an institution.
    't33.partner_onboarded_users', (
      SELECT COUNT(*) FROM (
        SELECT user_id FROM vc_identities
        UNION
        SELECT user_id FROM institution_members WHERE status = 'approved'
      ) u
    ),

    't33.diaspora_members', (
      SELECT COUNT(*) FROM profiles WHERE roles && ARRAY['diaspora']::TEXT[]
    ),

    't35.event_registrations', (
      SELECT COUNT(*) FROM event_rsvps
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),

    -- Consent-gated numerator over a consent-free denominator: this reads low
    -- by construction and the catalog says so. LEAST() because a consenting
    -- reader who is somehow not in user_activity_days would push it past 100.
    't35.resource_reach_pct', CASE WHEN v_mau > 0 THEN (
      SELECT LEAST(100, ROUND(COUNT(DISTINCT user_id)::NUMERIC * 100 / v_mau, 1))
      FROM analytics_events
      WHERE event_type = 'page_view' AND user_id IS NOT NULL
        AND page_path LIKE '/resources%'
        AND created_at >= p_period_start AND created_at < p_period_end
    ) END,
    't37.grants_directory_reach_pct', CASE WHEN v_mau > 0 THEN (
      SELECT LEAST(100, ROUND(COUNT(DISTINCT user_id)::NUMERIC * 100 / v_mau, 1))
      FROM analytics_events
      WHERE event_type = 'page_view' AND user_id IS NOT NULL
        AND page_path LIKE '/grants%'
        AND created_at >= p_period_start AND created_at < p_period_end
    ) END,

    't35.challenge_submission_states', (
      SELECT COUNT(DISTINCT p.country) FROM event_solutions s
      JOIN profiles p ON p.id = s.author_id
      WHERE p.country IS NOT NULL
        AND s.created_at >= p_period_start AND s.created_at < p_period_end
    ),

    -- T36. Real-user p75 LCP from the consent-gated beacon (useAnalytics.ts).
    -- NULL when nobody consented in the period — not 0 ms.
    't36.p75_lcp_ms_rum', (
      SELECT ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY (properties ->> 'ms')::NUMERIC))::INTEGER
      FROM analytics_events
      WHERE event_type = 'feature_use' AND event_name = 'web_vitals:lcp'
        AND properties ->> 'ms' ~ '^[0-9]+(\.[0-9]+)?$'
        AND created_at >= p_period_start AND created_at < p_period_end
    ),

    't36.moderation_review_hours', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::NUMERIC, 1)
      FROM content_reports
      WHERE resolved_at IS NOT NULL
        AND resolved_at >= p_period_start AND resolved_at < p_period_end
    ),

    -- §6. Filed in the period, by channel, plus what is still open now.
    't36.complaints_moderation', (
      SELECT COUNT(*) FROM content_reports
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),
    't36.complaints_takedowns', (
      SELECT COUNT(*) FROM takedown_notices
      WHERE kind = 'takedown' AND created_at >= p_period_start AND created_at < p_period_end
    ),
    't36.complaints_grievances', (
      SELECT COUNT(*) FROM grievances
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),
    't36.complaints_total', (
      (SELECT COUNT(*) FROM content_reports
        WHERE created_at >= p_period_start AND created_at < p_period_end)
      + (SELECT COUNT(*) FROM takedown_notices
        WHERE kind = 'takedown' AND created_at >= p_period_start AND created_at < p_period_end)
      + (SELECT COUNT(*) FROM grievances
        WHERE created_at >= p_period_start AND created_at < p_period_end)
    ),
    't36.complaints_open', (
      (SELECT COUNT(*) FROM content_reports WHERE status IN ('open', 'reviewing'))
      + (SELECT COUNT(*) FROM takedown_notices WHERE kind = 'takedown' AND resolved_at IS NULL)
      + (SELECT COUNT(*) FROM grievances WHERE resolved_at IS NULL)
    ),

    -- Table 15. Open at the start of the period: no deadline, or one not yet passed.
    't37.grants_listed', (
      SELECT COUNT(*) FROM grants
      WHERE is_active AND (deadline IS NULL OR deadline >= p_period_start)
    )
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.get_phase4_pulse(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_phase4_pulse(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_phase4_pulse(DATE, DATE) TO service_role;

-- ============================================================
-- 3. snapshot_kpis() now records every phase
--
-- Same body as 132 with one change: the pulse is the merge of all four
-- functions. Later keys win on collision, and none collide — each phase owns
-- its keys. A phase function that raises would abandon the whole snapshot,
-- which is right: a half-written week is worse than a loud failure.
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

  v_pulse := get_platform_pulse(p_period_start, v_period_end)
          || COALESCE(get_phase2_pulse(p_period_start, v_period_end), '{}'::JSONB)
          || COALESCE(get_phase3_pulse(p_period_start, v_period_end), '{}'::JSONB)
          || COALESCE(get_phase4_pulse(p_period_start, v_period_end), '{}'::JSONB);

  INSERT INTO kpi_snapshots (period_kind, period_start, kpi_key, value, computed_at)
  SELECT p_period_kind, p_period_start, e.key,
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
GRANT EXECUTE ON FUNCTION public.snapshot_kpis(TEXT, DATE) TO service_role;

-- ============================================================
-- 4. get_kpi_series()
--
-- One metric, bucketed by day/week/month between two dates, optionally for one
-- country. Long format: (bucket, segment, value). Every bucket is present —
-- generate_series() cross-joined with the segment list — so an area chart
-- never has to guess whether a missing month is zero or unread. If the query
-- is refused it RAISES, and the client renders "couldn't load".
--
-- One function with a metric switch rather than thirteen, so there is one
-- auth block, one grant and one place a new metric is added.
-- ============================================================

-- The role tier a member is charted under. Highest-signal role wins: an
-- investor who is also a student is charted as an investor.
CREATE OR REPLACE FUNCTION public.kpi_role_tier(p_roles TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_roles && ARRAY['investor']::TEXT[] THEN 'Investors'
    WHEN p_roles && ARRAY['mentor']::TEXT[] THEN 'Mentors'
    WHEN p_roles && ARRAY['entrepreneur','private_sector','chamber_admin','ngo','sme']::TEXT[]
      THEN 'Entrepreneurs & firms'
    WHEN p_roles && ARRAY['faculty','researcher','educational_partner','research_institution',
                          'government','diaspora','igo']::TEXT[]
      THEN 'Institutions & partners'
    WHEN p_roles && ARRAY['student']::TEXT[] THEN 'Students'
    ELSE 'Other'
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_kpi_series(
  p_metric  TEXT,
  p_grain   TEXT DEFAULT 'month',
  p_start   DATE DEFAULT (date_trunc('month', now()) - INTERVAL '11 months')::DATE,
  p_end     DATE DEFAULT (now() + INTERVAL '1 day')::DATE,
  p_country TEXT DEFAULT NULL
)
RETURNS TABLE(bucket DATE, segment TEXT, value NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_step INTERVAL;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_grain NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'unknown grain: %', p_grain USING ERRCODE = '22023';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'empty period' USING ERRCODE = '22023';
  END IF;

  v_step := CASE p_grain WHEN 'day' THEN INTERVAL '1 day'
                         WHEN 'week' THEN INTERVAL '7 days'
                         ELSE INTERVAL '1 month' END;

  -- Postgres weeks are Monday-anchored, matching api/cron/kpi-snapshot.ts.
  CREATE TEMP TABLE IF NOT EXISTS _kpi_buckets (b DATE) ON COMMIT DROP;
  TRUNCATE _kpi_buckets;
  INSERT INTO _kpi_buckets
  SELECT DISTINCT date_trunc(p_grain, g)::DATE
  FROM generate_series(date_trunc(p_grain, p_start::TIMESTAMPTZ), p_end::TIMESTAMPTZ - INTERVAL '1 day', v_step) g;

  IF p_metric = 'registrations' THEN
    RETURN QUERY
    SELECT k.b, t.seg, COUNT(p.id)::NUMERIC
    FROM _kpi_buckets k
    CROSS JOIN (VALUES ('Entrepreneurs & firms'), ('Students'), ('Mentors'), ('Investors'),
                       ('Institutions & partners'), ('Other')) t(seg)
    LEFT JOIN profiles p
      ON date_trunc(p_grain, p.created_at)::DATE = k.b
     AND kpi_role_tier(p.roles) = t.seg
     AND (p_country IS NULL OR p.country = p_country)
     AND p.created_at >= p_start AND p.created_at < p_end
    GROUP BY k.b, t.seg ORDER BY k.b, t.seg;

  ELSIF p_metric = 'registrations_by_country' THEN
    -- Every OECS member state is a row, at zero if need be: "12 states, 9
    -- represented" is the reading, and a chart that only lists the nine
    -- hides the three that matter most.
    RETURN QUERY
    SELECT k.b, c.name, COUNT(p.id)::NUMERIC
    FROM _kpi_buckets k
    CROSS JOIN (SELECT name FROM countries WHERE is_oecs_member
                UNION ALL SELECT 'Other') c
    LEFT JOIN profiles p
      ON date_trunc(p_grain, p.created_at)::DATE = k.b
     AND COALESCE((SELECT oc.name FROM countries oc WHERE oc.is_oecs_member AND oc.name = p.country), 'Other') = c.name
     AND p.created_at >= p_start AND p.created_at < p_end
    GROUP BY k.b, c.name ORDER BY k.b, c.name;

  ELSIF p_metric = 'active_users' THEN
    -- Distinct members with an activity day in the bucket. At month grain this
    -- is MAU per month; the pulse's t34.mau is the trailing-30-day version.
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(DISTINCT a.user_id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN user_activity_days a
      ON date_trunc(p_grain, a.activity_date::TIMESTAMPTZ)::DATE = k.b
     AND a.activity_date >= p_start AND a.activity_date < p_end
    LEFT JOIN profiles p ON p.id = a.user_id
    WHERE p_country IS NULL OR p.country = p_country OR a.user_id IS NULL
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'daily_active' THEN
    -- Mean of the daily distinct counts inside the bucket.
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COALESCE(ROUND(AVG(d.n), 1), 0)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN (
      SELECT a.activity_date, COUNT(DISTINCT a.user_id) AS n
      FROM user_activity_days a
      LEFT JOIN profiles p ON p.id = a.user_id
      WHERE a.activity_date >= p_start AND a.activity_date < p_end
        AND (p_country IS NULL OR p.country = p_country)
      GROUP BY a.activity_date
    ) d ON date_trunc(p_grain, d.activity_date::TIMESTAMPTZ)::DATE = k.b
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'projects' THEN
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN projects x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.created_at >= p_start AND x.created_at < p_end
     AND (p_country IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.owner_id AND p.country = p_country))
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'events' THEN
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN events x
      ON date_trunc(p_grain, x.start_date)::DATE = k.b
     AND x.status IN ('published', 'completed')
     AND x.start_date >= p_start AND x.start_date < p_end
     AND (p_country IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.organizer_id AND p.country = p_country))
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'event_registrations' THEN
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN event_rsvps x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.created_at >= p_start AND x.created_at < p_end
     AND (p_country IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.user_id AND p.country = p_country))
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'grant_applications' THEN
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN grant_applications x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.created_at >= p_start AND x.created_at < p_end
     AND (p_country IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.user_id AND p.country = p_country))
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'forum_posts' THEN
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN forum_posts x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.created_at >= p_start AND x.created_at < p_end
     AND (p_country IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.author_id AND p.country = p_country))
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'connections' THEN
    -- A connection has two ends; the country filter takes the requester's.
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN connections x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.status = 'accepted'
     AND x.created_at >= p_start AND x.created_at < p_end
     AND (p_country IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.requester_id AND p.country = p_country))
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'content_reports' THEN
    RETURN QUERY
    SELECT k.b, t.seg, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    CROSS JOIN (VALUES ('Content reports'), ('Takedown notices'), ('Grievances')) t(seg)
    LEFT JOIN (
      SELECT id, created_at, 'Content reports'::TEXT AS seg FROM content_reports
      UNION ALL
      SELECT id, created_at, 'Takedown notices' FROM takedown_notices WHERE kind = 'takedown'
      UNION ALL
      SELECT id, created_at, 'Grievances' FROM grievances
    ) x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.seg = t.seg
     AND x.created_at >= p_start AND x.created_at < p_end
    GROUP BY k.b, t.seg ORDER BY k.b, t.seg;

  ELSIF p_metric = 'resources_published' THEN
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN resources x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.is_published
     AND x.created_at >= p_start AND x.created_at < p_end
    GROUP BY k.b ORDER BY k.b;

  ELSIF p_metric = 'page_views' THEN
    -- Consent-gated (022): describes consenting sessions only. No country
    -- filter — a page view carries no member country.
    RETURN QUERY
    SELECT k.b, 'all'::TEXT, COUNT(x.id)::NUMERIC
    FROM _kpi_buckets k
    LEFT JOIN analytics_events x
      ON date_trunc(p_grain, x.created_at)::DATE = k.b
     AND x.event_type = 'page_view'
     AND x.created_at >= p_start AND x.created_at < p_end
    GROUP BY k.b ORDER BY k.b;

  ELSE
    RAISE EXCEPTION 'unknown metric: %', p_metric USING ERRCODE = '22023';
  END IF;
END; $fn$;

REVOKE ALL ON FUNCTION public.get_kpi_series(TEXT, TEXT, DATE, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kpi_series(TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kpi_series(TEXT, TEXT, DATE, DATE, TEXT) TO service_role;

-- ============================================================
-- 5. sample_platform_health()
--
-- The one writer of platform_health_samples (134). p75 LCP is computed here
-- from the real-user beacon; uptime and the 5xx rate are taken as arguments
-- because the platform cannot observe either about itself, and are stored
-- NULL when the caller has nothing — never defaulted to a healthy number.
--
-- Service role ONLY: a user session, however privileged, must not be able to
-- write a health reading. NULL auth.uid() is that role (see 132); anything
-- else is refused. EXECUTE is granted to service_role alone.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sample_platform_health(
  p_source          TEXT,
  p_window_label    TEXT DEFAULT '7d',
  p_uptime_pct      NUMERIC DEFAULT NULL,
  p_error_rate_5xx  NUMERIC DEFAULT NULL,
  p_window_days     INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lcp INTEGER;
  v_id  UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY (properties ->> 'ms')::NUMERIC))::INTEGER
  INTO v_lcp
  FROM analytics_events
  WHERE event_type = 'feature_use' AND event_name = 'web_vitals:lcp'
    AND properties ->> 'ms' ~ '^[0-9]+(\.[0-9]+)?$'
    AND created_at > now() - make_interval(days => GREATEST(p_window_days, 1));

  INSERT INTO platform_health_samples (source, window_label, uptime_pct, error_rate_5xx, p75_lcp_ms)
  VALUES (p_source, p_window_label, p_uptime_pct, p_error_rate_5xx, v_lcp)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'p75_lcp_ms', v_lcp,
    'uptime_pct', p_uptime_pct,
    'error_rate_5xx', p_error_rate_5xx
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.sample_platform_health(TEXT, TEXT, NUMERIC, NUMERIC, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sample_platform_health(TEXT, TEXT, NUMERIC, NUMERIC, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 6. Verification
--
--   -- the new readings arrive with the rest
--   SELECT jsonb_object_keys(get_phase4_pulse());                       -- 16 keys
--
--   -- a snapshot now carries every phase (was Phase 1 only)
--   SELECT snapshot_kpis('month', date_trunc('month', now())::DATE);   -- > 40
--   SELECT count(*) FROM kpi_snapshots
--   WHERE period_kind = 'month' AND kpi_key LIKE 't36.complaints%';    -- 5
--
--   -- twelve months, gaps included, every tier present
--   SELECT count(*) FROM get_kpi_series('registrations');              -- 72
--
--   -- every OECS state is a row even at zero
--   SELECT count(DISTINCT segment) FROM get_kpi_series('registrations_by_country');  -- 12
--
--   -- a user session cannot write a health reading
--   SELECT sample_platform_health('spoof');                            -- forbidden
-- ============================================================
