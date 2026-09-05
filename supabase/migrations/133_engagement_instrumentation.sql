-- Migration 133: the collectors §14 needs and the platform did not have.
--
-- Phase 1 (131) shipped every KPI that was already computable. This migration
-- builds the four that were not, and the boundary matters: these produce
-- nothing useful on deploy day. Their first meaningful reading is weeks out,
-- which is exactly why they have to land before the reporting period they are
-- meant to describe rather than when the report is due.
--
--   nps_responses          T34 — no NPS instrument existed
--   grant award columns    T37 — no award amount existed anywhere
--   mentorships            T35 — mentorship:offer was a permission with no schema
--   member_demographics    T38 — no gender field existed
--
-- Three judgement calls stated up front:
--
-- 1. NPS IS 0-10 AND IS NOT uat_responses.q5_recommend_rating. That column is
--    1-5 (023). Rescaling a 1-5 satisfaction question into a 0-10 promoter
--    score produces a number that looks like an NPS, moves like an NPS, and is
--    not one. A new instrument is the only honest option.
--
-- 2. THE AWARD AMOUNT IS STORED IN EC$ EXPLICITLY, NEVER CONVERTED.
--    grants.amount_min/max describes the CALL, not the award, and
--    grants.currency defaults to 'USD'. T37 asks for EC$1M facilitated; deriving
--    that from a USD call range with an implied rate would be a fabricated
--    figure in a World Bank report.
--
-- 3. GENDER IS A SEPARATE TABLE, NOT A COLUMN ON profiles. It is
--    special-category data, and 091 already built the pattern for exactly this
--    shape — declared, sensitive, readable only as an aggregate out of a
--    definer function. A profiles column would be joined into a public query
--    within a month.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. NPS (T34)
--
-- user_id is nullable: an anonymous response is still a response, and forcing
-- attribution on a satisfaction survey suppresses exactly the candid answers
-- the score exists to catch.
-- ============================================================

CREATE TABLE IF NOT EXISTS nps_responses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  score       SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment     TEXT CHECK (comment IS NULL OR length(comment) <= 2000),
  -- Which run of the bi-annual survey this belongs to, e.g. '2026-H1'.
  survey_wave TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE nps_responses IS
  'Net promoter score, 0-10 (roadmap §14 T34). NOT derived from uat_responses.q5_recommend_rating, which is a 1-5 satisfaction question and is not an NPS.';

-- One response per member per wave. Without this a single unhappy member can
-- move the score by answering repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nps_one_per_wave
  ON nps_responses(user_id, survey_wave) WHERE user_id IS NOT NULL;

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can submit an NPS response" ON nps_responses;
CREATE POLICY "Members can submit an NPS response"
  ON nps_responses FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Deliberately no member SELECT policy. A respondent reading back other
-- people's scores is not part of the instrument, and their own score tells them
-- nothing they did not just type.
DROP POLICY IF EXISTS "Operators can read NPS responses" ON nps_responses;
CREATE POLICY "Operators can read NPS responses"
  ON nps_responses FOR SELECT
  USING (has_permission(auth.uid(), 'org:manage'));

-- ============================================================
-- 2. Grant awards (T37)
--
-- On grant_applications, not grants: the award is a property of the decision,
-- and one call can award several applicants different amounts.
-- ============================================================

ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS awarded_amount   NUMERIC;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS awarded_currency TEXT NOT NULL DEFAULT 'XCD';
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS awarded_at       TIMESTAMPTZ;
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS awarded_by       UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN grant_applications.awarded_amount IS
  'What was actually awarded. grants.amount_min/max describes the call, not the award. Stored in awarded_currency, never converted for reporting.';

CREATE INDEX IF NOT EXISTS idx_grant_applications_awarded
  ON grant_applications(awarded_at DESC) WHERE awarded_amount IS NOT NULL;

-- grant:manage_funds, not grant:manage. The catalog already separates deciding
-- an application from moving money, and recording the figure that lands in a
-- World Bank report is squarely the latter.
CREATE OR REPLACE FUNCTION public.record_grant_award(
  p_application UUID,
  p_amount      NUMERIC,
  p_currency    TEXT DEFAULT 'XCD'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_applicant UUID;
  v_grant     TEXT;
BEGIN
  IF NOT has_permission(auth.uid(), 'grant:manage_funds') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_amount');
  END IF;

  SELECT ga.user_id, g.title INTO v_applicant, v_grant
  FROM grant_applications ga
  JOIN grants g ON g.id = ga.grant_id
  WHERE ga.id = p_application;

  IF v_applicant IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  UPDATE grant_applications SET
    awarded_amount   = p_amount,
    awarded_currency = COALESCE(p_currency, 'XCD'),
    awarded_at       = now(),
    awarded_by       = auth.uid(),
    -- Recording an award on an application still marked pending would leave the
    -- pipeline chart contradicting the economic-impact figure.
    status           = 'approved',
    updated_at       = now()
  WHERE id = p_application;

  PERFORM send_notification(
    v_applicant, 'grant_awarded', 'Funding awarded',
    'Your application to "' || v_grant || '" has been awarded.',
    '/grants/applications'
  );

  RETURN jsonb_build_object('ok', TRUE, 'awarded_amount', p_amount);
END; $fn$;

REVOKE ALL ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_grant_award(UUID, NUMERIC, TEXT) TO authenticated;

-- ============================================================
-- 3. Mentorships (T35)
--
-- The largest piece here, and it is a feature rather than a metric:
-- `mentorship:offer` has existed as a permission since 063 with no schema
-- behind it, so "20 active mentorship relationships" was never going to be
-- computable from anything.
--
-- Modelled on connections (033) — a directed request that the other party
-- accepts — because that is what a mentorship is, and members already
-- understand that interaction.
-- ============================================================

CREATE TABLE IF NOT EXISTS mentorships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentee_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'requested'
             CHECK (status IN ('requested', 'active', 'completed', 'declined')),
  focus      TEXT CHECK (focus IS NULL OR length(focus) <= 500),
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mentor_id <> mentee_id)
);

COMMENT ON TABLE mentorships IS
  'Mentor/mentee relationships (roadmap §14 T35). "Active" for KPI purposes means status = active.';

-- One live relationship per pair. A completed one may be restarted, so the
-- index is partial rather than a plain UNIQUE — otherwise a pair who worked
-- together last year could never work together again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentorships_live_pair
  ON mentorships(mentor_id, mentee_id) WHERE status IN ('requested', 'active');

CREATE INDEX IF NOT EXISTS idx_mentorships_mentor ON mentorships(mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_mentorships_mentee ON mentorships(mentee_id, status);

ALTER TABLE mentorships ENABLE ROW LEVEL SECURITY;

-- A mentee asks a mentor. The direction is fixed: the requester is always the
-- mentee, so a member cannot appoint themselves somebody's mentor.
DROP POLICY IF EXISTS "Mentees can request mentorship" ON mentorships;
CREATE POLICY "Mentees can request mentorship"
  ON mentorships FOR INSERT
  WITH CHECK (
    mentee_id = auth.uid()
    AND status = 'requested'
    AND has_permission(mentor_id, 'mentorship:offer')
  );

DROP POLICY IF EXISTS "Participants can read their mentorships" ON mentorships;
CREATE POLICY "Participants can read their mentorships"
  ON mentorships FOR SELECT
  USING (
    mentor_id = auth.uid()
    OR mentee_id = auth.uid()
    OR has_permission(auth.uid(), 'members:view')
  );

DROP POLICY IF EXISTS "Participants can update their mentorships" ON mentorships;
CREATE POLICY "Participants can update their mentorships"
  ON mentorships FOR UPDATE
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid())
  WITH CHECK (mentor_id = auth.uid() OR mentee_id = auth.uid());

-- Only the mentor may accept. The UPDATE policy above lets either party write
-- the row — which is right for ending or annotating one — so the accept step
-- needs its own guard, or a mentee could accept on the mentor's behalf.
CREATE OR REPLACE FUNCTION public.enforce_mentorship_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'requested'
     AND NEW.status IN ('active', 'declined')
     AND auth.uid() <> OLD.mentor_id
     AND NOT has_permission(auth.uid(), 'members:manage') THEN
    RAISE EXCEPTION 'only the mentor can accept or decline a request'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'active' AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  IF NEW.status IN ('completed', 'declined') AND NEW.ended_at IS NULL THEN
    NEW.ended_at := now();
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS enforce_mentorship_transition_trigger ON mentorships;
CREATE TRIGGER enforce_mentorship_transition_trigger
  BEFORE UPDATE ON mentorships
  FOR EACH ROW EXECUTE FUNCTION enforce_mentorship_transition();

-- 098's guard: send_notification RAISES on a NULL auth.uid(), so a trigger that
-- notifies must survive being fired by a job or a cascade.
CREATE OR REPLACE FUNCTION public.notify_mentorship_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM send_notification(
      NEW.mentor_id, 'mentorship_request', 'New mentorship request',
      'A member has asked you to mentor them.', '/dashboard/mentorship'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'requested' AND NEW.status = 'active' THEN
    PERFORM send_notification(
      NEW.mentee_id, 'mentorship_accepted', 'Mentorship accepted',
      'Your mentorship request was accepted.', '/dashboard/mentorship'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'requested' AND NEW.status = 'declined' THEN
    PERFORM send_notification(
      NEW.mentee_id, 'mentorship_declined', 'Mentorship request declined',
      'Your mentorship request was not taken up this time.', '/directory'
    );
  END IF;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS notify_mentorship_change_trigger ON mentorships;
CREATE TRIGGER notify_mentorship_change_trigger
  AFTER INSERT OR UPDATE ON mentorships
  FOR EACH ROW EXECUTE FUNCTION notify_mentorship_change();

-- ============================================================
-- 4. Declared demographics (T38)
--
-- 091's posture, applied to gender: its own table, declared by the member,
-- never joined into a query that returns rows, read only as a count out of a
-- definer function.
--
-- The vocabulary is open text with a short length cap rather than an enum. A
-- CHECK constraint listing permitted gender identities is a schema migration
-- every time someone is not on the list, and the KPI only needs one bucket.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_demographics (
  user_id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  gender_identity  TEXT CHECK (gender_identity IS NULL OR length(gender_identity) <= 60),
  self_declared_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE member_demographics IS
  'Self-declared, special-category. Same posture as account_age (091): never join into a query that returns rows; read as an aggregate from a SECURITY DEFINER function only.';

ALTER TABLE member_demographics ENABLE ROW LEVEL SECURITY;

-- Own row only, for everyone. There is deliberately NO administrator read
-- policy: nobody needs to see an individual's declaration, and the KPI reads
-- through the definer function below.
DROP POLICY IF EXISTS "Members manage their own demographics" ON member_demographics;
CREATE POLICY "Members manage their own demographics"
  ON member_demographics FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 5. The Phase 2 KPIs, as one readable block
--
-- Kept separate from get_platform_pulse rather than folded into it, so 131
-- stays deployable on its own and this function can be dropped if an instrument
-- is abandoned. The Pulse merges the two objects.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_phase2_pulse(
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
  v_declared BIGINT;
BEGIN
  -- NULL auth.uid() is the SERVICE ROLE (api/cron/kpi-snapshot.ts calling
  -- through snapshot_kpis), never an anonymous visitor: EXECUTE is revoked from
  -- PUBLIC and anon, so anon never reaches this body. Every authenticated caller
  -- has a uid and is checked normally.
  IF auth.uid() IS NOT NULL AND NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_declared
  FROM member_demographics WHERE gender_identity IS NOT NULL;

  RETURN jsonb_build_object(
    -- NPS = %promoters (9-10) minus %detractors (0-6). NULL, not 0, when nobody
    -- has answered: an NPS of zero is a real and quite bad score.
    't34.nps', (
      SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(
        (COUNT(*) FILTER (WHERE score >= 9)::NUMERIC
         - COUNT(*) FILTER (WHERE score <= 6)::NUMERIC) * 100 / COUNT(*), 0) END
      FROM nps_responses
      WHERE created_at >= p_period_start AND created_at < p_period_end
    ),

    't35.active_mentorships', (SELECT COUNT(*) FROM mentorships WHERE status = 'active'),

    -- Only rows actually denominated in EC$. Summing mixed currencies into one
    -- "capital facilitated" figure would be the fabrication this migration's
    -- header exists to prevent.
    't37.capital_facilitated_xcd', (
      SELECT COALESCE(SUM(awarded_amount), 0) FROM grant_applications
      WHERE awarded_amount IS NOT NULL AND awarded_currency = 'XCD'
        AND awarded_at >= p_period_start AND awarded_at < p_period_end
    ),
    't37.awards_in_other_currencies', (
      SELECT COUNT(*) FROM grant_applications
      WHERE awarded_amount IS NOT NULL AND awarded_currency <> 'XCD'
        AND awarded_at >= p_period_start AND awarded_at < p_period_end
    ),

    -- Denominator is declarations, not all members, so the figure is honest
    -- about its coverage rather than quietly diluted by everyone who skipped it.
    't38.gender_declared', v_declared,
    't38.female_count', (
      SELECT COUNT(*) FROM member_demographics
      WHERE lower(gender_identity) IN ('female', 'woman', 'f')
    ),

    -- Lower bound: computed from page-view timestamps within a session, so the
    -- last page of every session contributes nothing, and only consenting
    -- sessions are represented at all. Label it as such wherever it renders.
    't34.session_minutes', (
      SELECT ROUND(AVG(span)::NUMERIC / 60, 1) FROM (
        SELECT EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS span
        FROM analytics_events
        WHERE event_type = 'page_view'
          AND created_at >= p_period_start AND created_at < p_period_end
        GROUP BY session_id
        HAVING COUNT(*) > 1
      ) AS sessions
    )
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.get_phase2_pulse(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_phase2_pulse(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_phase2_pulse(DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 6. Verification
--
--   -- an NPS with no responses is NULL, not 0
--   SELECT get_phase2_pulse() ->> 't34.nps';                    -- null
--
--   -- a mentee cannot appoint themselves a mentor
--   INSERT INTO mentorships (mentor_id, mentee_id) VALUES (auth.uid(), '<other>');
--   -- refused by "Mentees can request mentorship"
--
--   -- awards in another currency are counted, not silently summed
--   SELECT get_phase2_pulse() ->> 't37.awards_in_other_currencies';
--
--   -- nobody can read another member's declaration
--   SELECT * FROM member_demographics;    -- own row only, even for super_admin
-- ============================================================
