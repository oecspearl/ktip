-- ============================================================
-- Migration 061: Cross-entity content index + the personalization ranker
--
-- Ranking runs here rather than in the browser because the behaviour
-- signals it reads (likes, follows, RSVPs, applications) are RLS-scoped
-- to their owner and the badge tables are trigger-written. Pulling them
-- client-side would be six extra round trips per page load and would
-- still put a member's engagement history into a shared query cache.
--
-- Two entry points, one formula:
--   rank_content(p_entity, p_ids)  scores rows a list page has ALREADY
--                                  fetched and filtered. The existing
--                                  PostgREST filter chains never move
--                                  into SQL, so there is exactly one
--                                  implementation of "what is on this
--                                  page" and one of "how good is it".
--   get_personalized_feed(...)     a standalone normalized union for the
--                                  Dashboard / Discover rail, where
--                                  there are no user filters to respect.
--
-- SECURITY DEFINER because content_index and the behaviour tables are
-- read across RLS boundaries. NEITHER function takes a user id — both
-- derive the caller from auth.uid() — so neither can be turned into a
-- "read anyone's activity" oracle.
--
-- Requires 055 (user_personalization, expand_topics) and 060 (grants.tags).
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- Normalized view over the four content entities
--
-- Visibility is baked into each branch. The view is a classic
-- (non-security_invoker) view owned by the migration role and is
-- revoked from clients, so it exists only as an internal building block
-- for the two functions below and never becomes a PostgREST endpoint.
--
-- Consequence worth knowing: private projects shared with their
-- project_members are excluded from ranking. A members-aware branch
-- would need a correlated subquery per row, which is not worth it for a
-- soft ordering nudge.
-- ============================================================

DROP VIEW IF EXISTS content_index;
CREATE VIEW content_index AS
  SELECT 'project'::TEXT                       AS entity,
         p.id,
         p.title,
         p.summary,
         coalesce(p.hashtags, ARRAY[]::TEXT[]) AS tags,
         p.category::TEXT                      AS category,
         NULL::TEXT                            AS type_key,
         coalesce(p.is_climate_action, FALSE)  AS is_climate_action,
         coalesce(p.is_featured, FALSE)        AS is_featured,
         p.created_at,
         NULL::TIMESTAMPTZ                     AS occurs_at,
         NULL::TIMESTAMPTZ                     AS deadline_at,
         p.owner_id,
         coalesce(p.view_count, 0)::NUMERIC    AS popularity
    FROM projects p
   WHERE p.is_public

  UNION ALL

  SELECT 'resource'::TEXT,
         r.id,
         r.title,
         r.summary,
         coalesce(r.tags, ARRAY[]::TEXT[]),
         r.category::TEXT,
         r.resource_type::TEXT,
         coalesce(r.is_climate_action, FALSE),
         FALSE,
         r.created_at,
         NULL::TIMESTAMPTZ,
         NULL::TIMESTAMPTZ,
         r.author_id,
         0::NUMERIC
    FROM resources r
   WHERE r.is_published

  UNION ALL

  SELECT 'event'::TEXT,
         e.id,
         e.title,
         e.summary,
         coalesce(e.tags, ARRAY[]::TEXT[]),
         NULL::TEXT,
         e.event_type::TEXT,
         coalesce(e.is_climate_action, FALSE),
         FALSE,
         e.created_at,
         e.start_date,
         NULL::TIMESTAMPTZ,
         e.organizer_id,
         0::NUMERIC
    FROM events e
   WHERE e.status <> 'draft'

  UNION ALL

  SELECT 'grant'::TEXT,
         g.id,
         g.title,
         g.summary,
         coalesce(g.tags, ARRAY[]::TEXT[]),
         NULL::TEXT,
         g.grant_type::TEXT,
         coalesce(g.is_climate_action, FALSE),
         FALSE,
         g.created_at,
         NULL::TIMESTAMPTZ,
         g.deadline,
         NULL::UUID,
         0::NUMERIC
    FROM grants g
   WHERE g.is_active;

REVOKE ALL ON content_index FROM anon, authenticated;

-- ============================================================
-- The signal bag
--
-- Everything known about the caller, resolved ONCE per statement rather
-- than once per row. Returns NULL when personalization is off, which is
-- the single switch every caller checks.
-- ============================================================

CREATE OR REPLACE FUNCTION personalization_bag(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref       user_personalization%ROWTYPE;
  v_prof       profiles%ROWTYPE;
  v_eng_cats   TEXT[] := ARRAY[]::TEXT[];
  v_eng_tags   TEXT[] := ARRAY[]::TEXT[];
  v_eng_owners UUID[] := ARRAY[]::UUID[];
  v_seen       UUID[] := ARRAY[]::UUID[];
  v_badges     TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_pref FROM user_personalization WHERE user_id = p_user;

  IF NOT FOUND THEN
    -- Never opened Settings: personalization is on with no explicit
    -- picks, so the score collapses to recency + urgency — i.e. very
    -- close to the ordering the page already had.
    v_pref.enabled              := TRUE;
    v_pref.use_profile_signals  := TRUE;
    v_pref.use_behavior_signals := TRUE;
    v_pref.use_badge_signals    := TRUE;
    v_pref.climate_focus        := FALSE;
    v_pref.topics               := ARRAY[]::TEXT[];
    v_pref.categories           := ARRAY[]::TEXT[];
    v_pref.content_types        := ARRAY[]::TEXT[];
  END IF;

  IF v_pref.enabled IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_prof FROM profiles WHERE id = p_user;

  IF v_pref.use_behavior_signals THEN
    WITH engaged AS (
      SELECT ci.category, ci.tags, ci.owner_id, ci.id
        FROM content_index ci
       WHERE ci.id IN (
                 SELECT project_id FROM project_likes      WHERE user_id = p_user
           UNION SELECT project_id FROM project_follows    WHERE user_id = p_user
           UNION SELECT id         FROM projects           WHERE owner_id = p_user
           UNION SELECT event_id   FROM event_rsvps        WHERE user_id = p_user
           UNION SELECT grant_id   FROM grant_applications WHERE user_id = p_user
       )
    ),
    agg AS (
      SELECT
        coalesce(array_agg(DISTINCT normalize_topic(e.category))
                 FILTER (WHERE e.category IS NOT NULL), ARRAY[]::TEXT[]) AS cats,
        coalesce(array_agg(DISTINCT e.owner_id)
                 FILTER (WHERE e.owner_id IS NOT NULL), ARRAY[]::UUID[]) AS owners,
        coalesce(array_agg(DISTINCT e.id), ARRAY[]::UUID[])              AS ids
      FROM engaged e
    ),
    tag_agg AS (
      SELECT coalesce(array_agg(DISTINCT normalize_topic(t))
                      FILTER (WHERE normalize_topic(t) IS NOT NULL),
                      ARRAY[]::TEXT[]) AS tags
      FROM engaged e, unnest(e.tags) t
    )
    SELECT agg.cats, tag_agg.tags, agg.owners, agg.ids
      INTO v_eng_cats, v_eng_tags, v_eng_owners, v_seen
      FROM agg, tag_agg;
  END IF;

  IF v_pref.use_badge_signals THEN
    SELECT coalesce(array_agg(b.slug), ARRAY[]::TEXT[]) INTO v_badges
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = p_user;
  END IF;

  RETURN jsonb_build_object(
    'topics',        to_jsonb(expand_topics(v_pref.topics)),
    'categories',    to_jsonb(coalesce(v_pref.categories, ARRAY[]::TEXT[])),
    'content_types', to_jsonb(coalesce(v_pref.content_types, ARRAY[]::TEXT[])),
    'climate',       coalesce(v_pref.climate_focus, FALSE),
    'country',       normalize_topic(v_prof.country),
    'roles',         to_jsonb(coalesce(v_prof.roles, ARRAY[]::TEXT[])),
    'verified',      coalesce(v_prof.is_verified, FALSE),
    'profile_topics',
      CASE WHEN v_pref.use_profile_signals THEN
        to_jsonb(expand_topics(
          coalesce(v_prof.interests, ARRAY[]::TEXT[]) ||
          coalesce(v_prof.skills,    ARRAY[]::TEXT[]) ||
          CASE WHEN v_prof.industry IS NULL
               THEN ARRAY[]::TEXT[]
               ELSE ARRAY[v_prof.industry] END))
      ELSE '[]'::JSONB END,
    'engaged_categories', to_jsonb(v_eng_cats),
    'engaged_topics',     to_jsonb(v_eng_tags),
    'engaged_owners',     to_jsonb(v_eng_owners),
    'seen',               to_jsonb(v_seen),
    'badges',             to_jsonb(v_badges)
  );
END;
$$;

-- ============================================================
-- The formula
--
-- Emits an array of {code, label, w} contributions. The caller derives
-- BOTH the score (sum of w) and the "why this matched" chip (the
-- positive contributions) from this one array, so the explanation on a
-- card can never disagree with the ordering that produced it.
--
-- Rough envelope: personal terms reach ~185, context terms ~78. A
-- perfect topic + category match on a six-month-old item still outranks
-- an untargeted grant closing tomorrow, while a partially matched grant
-- closing tomorrow outranks a stale near-perfect match. Retuning is one
-- CREATE OR REPLACE with no client deploy.
-- ============================================================

CREATE OR REPLACE FUNCTION personalization_contributions(
  p_bag         JSONB,
  p_entity      TEXT,
  p_id          UUID,
  p_tags        TEXT[],
  p_category    TEXT,
  p_type_key    TEXT,
  p_climate     BOOLEAN,
  p_featured    BOOLEAN,
  p_created_at  TIMESTAMPTZ,
  p_occurs_at   TIMESTAMPTZ,
  p_deadline_at TIMESTAMPTZ,
  p_owner_id    UUID,
  p_popularity  NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  c         JSONB  := '[]'::JSONB;
  v_topics  TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'topics', '[]'::JSONB)));
  v_ptopics TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'profile_topics', '[]'::JSONB)));
  v_cats    TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'categories', '[]'::JSONB)));
  v_types   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'content_types', '[]'::JSONB)));
  v_ecats   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'engaged_categories', '[]'::JSONB)));
  v_etags   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'engaged_topics', '[]'::JSONB)));
  v_badges  TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'badges', '[]'::JSONB)));
  v_roles   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'roles', '[]'::JSONB)));
  v_seen    JSONB  := coalesce(p_bag->'seen', '[]'::JSONB);
  v_owners  JSONB  := coalesce(p_bag->'engaged_owners', '[]'::JSONB);
  v_surface TEXT[];   -- the row's tags + category, normalized
  v_ns_type TEXT;     -- 'resource:guide', 'event:workshop', …
  v_hit     TEXT[];
  v_n       INT;
  v_days    NUMERIC;
BEGIN
  v_surface := ARRAY(
    SELECT DISTINCT normalize_topic(t)
      FROM unnest(
             coalesce(p_tags, ARRAY[]::TEXT[]) ||
             CASE WHEN p_category IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[p_category] END
           ) t
     WHERE normalize_topic(t) IS NOT NULL);

  v_ns_type := CASE WHEN p_type_key IS NULL THEN NULL ELSE p_entity || ':' || p_type_key END;

  -- ===== Explicit picks — the member literally chose these ==========
  v_hit := ARRAY(SELECT DISTINCT x FROM unnest(v_surface) x WHERE x = ANY(v_topics));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 3);
  IF v_n > 0 THEN
    c := c || jsonb_build_object(
      'code', 'topic', 'w', 25 * v_n,
      'label', 'Matches your topics: ' || array_to_string(v_hit[1:v_n], ', '));
  END IF;

  IF p_category IS NOT NULL AND p_category = ANY(v_cats) THEN
    c := c || jsonb_build_object('code', 'category', 'w', 30, 'label', 'In a category you follow');
  END IF;

  IF v_ns_type IS NOT NULL AND v_ns_type = ANY(v_types) THEN
    c := c || jsonb_build_object('code', 'type', 'w', 20, 'label', 'A content type you asked for');
  END IF;

  IF coalesce((p_bag->>'climate')::BOOLEAN, FALSE) AND p_climate THEN
    c := c || jsonb_build_object('code', 'climate', 'w', 15, 'label', 'Climate action');
  END IF;

  -- ===== Profile fields — inferred, so roughly half weight ==========
  v_hit := ARRAY(
    SELECT DISTINCT x FROM unnest(v_surface) x
     WHERE x = ANY(v_ptopics) AND NOT (x = ANY(v_topics)));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 3);
  IF v_n > 0 THEN
    c := c || jsonb_build_object(
      'code', 'profile', 'w', 12 * v_n,
      'label', 'Related to your profile: ' || array_to_string(v_hit[1:v_n], ', '));
  END IF;

  -- Role affinity: which entity a role tends to want. Small, never negative.
  IF ('investor' = ANY(v_roles) OR 'entrepreneur' = ANY(v_roles))
     AND p_entity IN ('grant', 'project') THEN
    c := c || jsonb_build_object('code', 'role', 'w', 8, 'label', 'Relevant to your role');
  ELSIF ('student' = ANY(v_roles) OR 'faculty' = ANY(v_roles))
     AND p_entity IN ('resource', 'event') THEN
    c := c || jsonb_build_object('code', 'role', 'w', 8, 'label', 'Relevant to your role');
  ELSIF 'mentor' = ANY(v_roles) AND p_entity = 'project' THEN
    c := c || jsonb_build_object('code', 'role', 'w', 8, 'label', 'Relevant to your role');
  END IF;

  -- ===== Behaviour =================================================
  IF p_owner_id IS NOT NULL AND v_owners ? p_owner_id::TEXT THEN
    c := c || jsonb_build_object(
      'code', 'author', 'w', 18, 'label', 'By someone whose work you follow');
  END IF;

  IF p_category IS NOT NULL AND normalize_topic(p_category) = ANY(v_ecats) THEN
    c := c || jsonb_build_object(
      'code', 'engaged_category', 'w', 10, 'label', 'Like things you have saved');
  END IF;

  v_hit := ARRAY(SELECT DISTINCT x FROM unnest(v_surface) x WHERE x = ANY(v_etags));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 2);
  IF v_n > 0 THEN
    c := c || jsonb_build_object(
      'code', 'engaged_topic', 'w', 8 * v_n, 'label', 'Similar to what you engage with');
  END IF;

  -- Already liked / RSVP'd / applied for. Demoted, never removed —
  -- "rank, never hide" applies to your own history too.
  IF v_seen ? p_id::TEXT THEN
    c := c || jsonb_build_object(
      'code', 'seen', 'w', -40, 'label', 'You have already seen this');
  END IF;

  -- ===== Badges — nudges toward the next useful step ================
  IF NOT ('first_project' = ANY(v_badges))
     AND p_entity = 'resource'
     AND (p_type_key IN ('guide', 'template') OR 'getting started' = ANY(v_surface)) THEN
    c := c || jsonb_build_object(
      'code', 'badge_starter', 'w', 14, 'label', 'A good starting point for your first project');
  END IF;

  IF NOT ('first_connection' = ANY(v_badges))
     AND p_entity = 'event'
     AND p_type_key IN ('meetup', 'conference') THEN
    c := c || jsonb_build_object(
      'code', 'badge_connect', 'w', 10, 'label', 'A good place to meet people');
  END IF;

  IF NOT ('event_goer' = ANY(v_badges))
     AND p_entity = 'event'
     AND p_occurs_at > now() THEN
    c := c || jsonb_build_object(
      'code', 'badge_event', 'w', 8, 'label', 'Your first event is coming up');
  END IF;

  IF coalesce((p_bag->>'verified')::BOOLEAN, FALSE) AND p_entity = 'grant' THEN
    c := c || jsonb_build_object(
      'code', 'badge_verified', 'w', 12, 'label', 'You are verified — you can apply');
  END IF;

  IF 'popular_project' = ANY(v_badges) AND p_entity = 'grant' THEN
    c := c || jsonb_build_object(
      'code', 'badge_traction', 'w', 10, 'label', 'Your project has traction — worth funding');
  END IF;

  -- ===== Context — recency, urgency, popularity =====================
  -- Capped well below the personal terms so a strong topic match still
  -- beats pure novelty, but large enough that an expiring grant can
  -- never be buried under a stale perfect match.
  v_days := extract(epoch FROM (now() - p_created_at)) / 86400.0;
  IF v_days IS NOT NULL AND v_days >= 0 THEN
    c := c || jsonb_build_object(
      'code', 'recency', 'w', round((20 * exp(-v_days / 30.0))::NUMERIC, 2),
      'label', 'Recently added');
  END IF;

  IF p_deadline_at IS NOT NULL THEN
    v_days := extract(epoch FROM (p_deadline_at - now())) / 86400.0;
    IF v_days < 0 THEN
      c := c || jsonb_build_object('code', 'expired', 'w', -60, 'label', 'Deadline has passed');
    ELSIF v_days <= 45 THEN
      c := c || jsonb_build_object(
        'code', 'deadline',
        'w', round((35 * (1 - v_days / 45.0) + CASE WHEN v_days <= 14 THEN 25 ELSE 0 END)::NUMERIC, 2),
        'label', 'Closing in ' || greatest(round(v_days)::INT, 0) || ' days');
    END IF;
  END IF;

  IF p_occurs_at IS NOT NULL THEN
    v_days := extract(epoch FROM (p_occurs_at - now())) / 86400.0;
    IF v_days < -1 THEN
      c := c || jsonb_build_object('code', 'past', 'w', -60, 'label', 'Already happened');
    ELSIF v_days <= 30 THEN
      c := c || jsonb_build_object(
        'code', 'soon',
        'w', round((30 * (1 - greatest(v_days, 0) / 30.0))::NUMERIC, 2),
        'label', 'Happening soon');
    END IF;
  END IF;

  IF p_popularity > 0 THEN
    c := c || jsonb_build_object(
      'code', 'popular', 'w', least(round((6 * ln(1 + p_popularity))::NUMERIC, 2), 18),
      'label', 'Popular right now');
  END IF;

  IF p_featured THEN
    c := c || jsonb_build_object('code', 'featured', 'w', 15, 'label', 'Featured by OECS');
  END IF;

  RETURN c;
END;
$$;

-- ============================================================
-- Entry point 1: score rows a list page has already fetched
-- ============================================================

CREATE OR REPLACE FUNCTION rank_content(p_entity TEXT, p_ids UUID[])
RETURNS TABLE (id UUID, score NUMERIC, reasons JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bag JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF p_ids IS NULL OR coalesce(array_length(p_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF array_length(p_ids, 1) > 300 THEN
    RAISE EXCEPTION 'rank_content: at most 300 ids per call';
  END IF;

  IF p_entity IS NULL OR p_entity NOT IN ('project', 'resource', 'event', 'grant') THEN
    RAISE EXCEPTION 'rank_content: unknown entity %', p_entity;
  END IF;

  v_bag := personalization_bag(auth.uid());

  -- Personalization off. Returning nothing makes the caller keep the
  -- server ordering it already has, which is the degradation guarantee.
  IF v_bag IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ci.id, s.score, s.reasons
    FROM content_index ci
   CROSS JOIN LATERAL (
     SELECT coalesce(sum((e->>'w')::NUMERIC), 0) AS score,
            coalesce(
              jsonb_agg(e ORDER BY (e->>'w')::NUMERIC DESC)
                FILTER (WHERE (e->>'w')::NUMERIC > 0),
              '[]'::JSONB) AS reasons
       FROM jsonb_array_elements(
              personalization_contributions(
                v_bag, ci.entity, ci.id, ci.tags, ci.category, ci.type_key,
                ci.is_climate_action, ci.is_featured, ci.created_at,
                ci.occurs_at, ci.deadline_at, ci.owner_id, ci.popularity)) e
   ) s
   WHERE ci.entity = p_entity
     AND ci.id = ANY(p_ids);
END;
$$;

-- ============================================================
-- Entry point 2: the cross-entity rail for Dashboard / Discover
-- ============================================================

CREATE OR REPLACE FUNCTION get_personalized_feed(
  p_limit    INT    DEFAULT 12,
  p_entities TEXT[] DEFAULT ARRAY['project', 'resource', 'event', 'grant']
) RETURNS TABLE (
  entity      TEXT,
  id          UUID,
  title       TEXT,
  summary     TEXT,
  category    TEXT,
  type_key    TEXT,
  tags        TEXT[],
  occurs_at   TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  score       NUMERIC,
  reasons     JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bag   JSONB;
  v_limit INT := least(greatest(coalesce(p_limit, 12), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_bag := personalization_bag(auth.uid());

  IF v_bag IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ci.entity, ci.id, ci.title, ci.summary, ci.category, ci.type_key,
         ci.tags, ci.occurs_at, ci.deadline_at, s.score, s.reasons
    FROM content_index ci
   CROSS JOIN LATERAL (
     SELECT coalesce(sum((e->>'w')::NUMERIC), 0) AS score,
            coalesce(
              jsonb_agg(e ORDER BY (e->>'w')::NUMERIC DESC)
                FILTER (WHERE (e->>'w')::NUMERIC > 0),
              '[]'::JSONB) AS reasons
       FROM jsonb_array_elements(
              personalization_contributions(
                v_bag, ci.entity, ci.id, ci.tags, ci.category, ci.type_key,
                ci.is_climate_action, ci.is_featured, ci.created_at,
                ci.occurs_at, ci.deadline_at, ci.owner_id, ci.popularity)) e
   ) s
   WHERE ci.entity = ANY(coalesce(p_entities, ARRAY['project', 'resource', 'event', 'grant']))
     -- A rail is a "what next" surface, so unlike the list pages it does
     -- drop things that have already happened.
     AND (ci.occurs_at   IS NULL OR ci.occurs_at   > now() - INTERVAL '1 day')
     AND (ci.deadline_at IS NULL OR ci.deadline_at > now())
     AND (ci.created_at > now() - INTERVAL '18 months'
          OR ci.occurs_at IS NOT NULL
          OR ci.deadline_at IS NOT NULL)
   ORDER BY s.score DESC, ci.created_at DESC, ci.id
   LIMIT v_limit;
END;
$$;

-- The bag and the formula are internal building blocks; only the two
-- entry points, which resolve the caller from auth.uid(), are callable.
REVOKE ALL ON FUNCTION personalization_bag(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION personalization_contributions(
  JSONB, TEXT, UUID, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rank_content(TEXT, UUID[])            TO authenticated;
GRANT EXECUTE ON FUNCTION get_personalized_feed(INT, TEXT[])    TO authenticated;

NOTIFY pgrst, 'reload schema';
