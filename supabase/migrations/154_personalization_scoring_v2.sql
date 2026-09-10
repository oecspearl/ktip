-- ============================================================================
-- 154_personalization_scoring_v2.sql — the ranker, rebuilt on 153's schema
-- ============================================================================
-- Same shape as 061 — one formula, two entry points, score and explanation
-- derived from one contribution array — with these changes:
--
--   * Reasons are {code, w, params}, no English label. The client owns the
--     wording through its message catalogues; SQL cannot be translated and the
--     platform ships in three languages. `params` carries what the sentence
--     needs (days, role, country, matched topics).
--   * personalization_contributions takes (bag, row) as two JSONB values. The
--     13-positional-argument signature is DROPPED here — a CREATE OR REPLACE
--     with a different signature would have created an overload and left the
--     old, PUBLIC-revoked-only function in place.
--   * content_index fills the gaps 061 left: grants get their owner (077's
--     created_by), resources must be approved (135), popularity counts
--     content_views (153) for all four entities, and events carry
--     country_code and is_virtual.
--   * The bag knows active_role, the member's suppressions, and the topics
--     they have browsed (content_views, last 90 days, behaviour-gated).
--   * Role term reads role_entity_affinity: active role if one is set and
--     held, otherwise every held role; MAX weight, never a sum.
--   * Geography: +10 when an event is in the member's country, +4 when it is
--     online. Country compares countries.name to the free-text profile field,
--     normalized on both sides, because that is the vocabulary profiles hold.
--   * Browsed: +5 per browsed topic on the row, capped at two.
--   * Suppressed items are filtered before scoring in both entry points.
--   * The feed guarantees each requested entity a floor of slots
--     (ceil(limit / entities)) before filling the rest by score, so one
--     entity cannot fill the whole rail.
--   * `verified` (was badge_verified) reads profiles.is_verified, not a
--     badge, so it no longer sits under the badge toggle in name. The
--     badge_starter tag branch is now gated like its siblings.
--   * The deadline term is continuous: 35·(1 − d/45) + 25·(1 − d/14) for
--     d ≤ 14. Same maximum of 60 at d = 0, no 25-point cliff at day 14.
--   * `category` compares normalized values on both sides.
--
-- Envelope: personal terms reach ~230 on a grant for a verified member with a
-- popular project; context terms reach 60 (deadline) + 20 (recency) + 18
-- (popular) + 15 (featured). A strong stated interest still outranks pure
-- urgency; an untargeted grant closing tomorrow still floats.
--
-- Performance: content_index stays a plain view. Materialize (precedent:
-- platform_health_samples, 134) when SELECT count(*) FROM content_index passes
-- roughly two thousand rows — the feed scores every visible row before LIMIT.
--
-- Requires 061, 077 (grants.created_by), 135 (resources.approval_status), 153.
-- Idempotent — safe to re-run. Re-running 061 afterwards restores the old
-- formula but leaves the 13-arg overload in place; run this file again to
-- drop it.

-- ---------------------------------------------------------------------------
-- Retire the old signature first, while nothing depends on it.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS personalization_contributions(
  JSONB, TEXT, UUID, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, NUMERIC);

-- ---------------------------------------------------------------------------
-- The index, with 061's gaps filled
-- ---------------------------------------------------------------------------

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
         (coalesce(p.view_count, 0)
          + coalesce((SELECT sum(cv.views) FROM content_views cv
                       WHERE cv.entity = 'project' AND cv.content_id = p.id), 0))::NUMERIC AS popularity,
         NULL::CHAR(2)                         AS country_code,
         FALSE                                 AS is_virtual
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
         coalesce((SELECT sum(cv.views) FROM content_views cv
                    WHERE cv.entity = 'resource' AND cv.content_id = r.id), 0)::NUMERIC,
         NULL::CHAR(2),
         FALSE
    FROM resources r
   WHERE r.is_published
     AND coalesce(r.approval_status, 'approved') = 'approved'

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
         coalesce((SELECT sum(cv.views) FROM content_views cv
                    WHERE cv.entity = 'event' AND cv.content_id = e.id), 0)::NUMERIC,
         e.country_code,
         coalesce(e.is_virtual, FALSE)
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
         g.created_by,
         coalesce((SELECT sum(cv.views) FROM content_views cv
                    WHERE cv.entity = 'grant' AND cv.content_id = g.id), 0)::NUMERIC,
         NULL::CHAR(2),
         FALSE
    FROM grants g
   WHERE g.is_active;

REVOKE ALL ON content_index FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- The signal bag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION personalization_bag(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref        user_personalization%ROWTYPE;
  v_prof        profiles%ROWTYPE;
  v_eng_cats    TEXT[] := ARRAY[]::TEXT[];
  v_eng_tags    TEXT[] := ARRAY[]::TEXT[];
  v_eng_owners  UUID[] := ARRAY[]::UUID[];
  v_seen        UUID[] := ARRAY[]::UUID[];
  v_browsed     TEXT[] := ARRAY[]::TEXT[];
  v_badges      TEXT[] := ARRAY[]::TEXT[];
  v_suppressed  TEXT[] := ARRAY[]::TEXT[];
  v_roles       TEXT[];
BEGIN
  IF p_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_pref FROM user_personalization WHERE user_id = p_user;

  IF NOT FOUND THEN
    -- Never opened Settings: personalization is on with no explicit picks,
    -- so the score collapses to role + recency + urgency.
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

  -- The roles in play: the active context when set and actually held,
  -- otherwise everything the account holds. Same rule as the client's
  -- effectiveRoles(), so switching context changes ordering everywhere.
  v_roles := coalesce(v_prof.roles, ARRAY[]::TEXT[]);
  IF v_prof.active_role IS NOT NULL AND v_prof.active_role = ANY(v_roles) THEN
    v_roles := ARRAY[v_prof.active_role];
  END IF;

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

    -- What the member has opened lately. Weaker than a like — you open
    -- things to find out you are not interested — so it earns its own,
    -- smaller term rather than joining engaged_topics.
    SELECT coalesce(array_agg(DISTINCT normalize_topic(t))
                    FILTER (WHERE normalize_topic(t) IS NOT NULL), ARRAY[]::TEXT[])
      INTO v_browsed
      FROM content_views cv
      JOIN content_index ci ON ci.entity = cv.entity AND ci.id = cv.content_id,
           unnest(ci.tags || CASE WHEN ci.category IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[ci.category] END) t
     WHERE cv.user_id = p_user
       AND cv.day > current_date - 90;
  END IF;

  IF v_pref.use_badge_signals THEN
    SELECT coalesce(array_agg(b.slug), ARRAY[]::TEXT[]) INTO v_badges
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = p_user;
  END IF;

  SELECT coalesce(array_agg(s.entity || ':' || s.content_id::TEXT), ARRAY[]::TEXT[])
    INTO v_suppressed
    FROM content_suppressions s
   WHERE s.user_id = p_user;

  RETURN jsonb_build_object(
    'topics',        to_jsonb(expand_topics(v_pref.topics)),
    'categories',    to_jsonb(ARRAY(SELECT normalize_topic(c) FROM unnest(coalesce(v_pref.categories, ARRAY[]::TEXT[])) c)),
    'content_types', to_jsonb(coalesce(v_pref.content_types, ARRAY[]::TEXT[])),
    'climate',       coalesce(v_pref.climate_focus, FALSE),
    'country',       normalize_topic(v_prof.country),
    'country_name',  v_prof.country,
    'roles',         to_jsonb(v_roles),
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
    'browsed_topics',     to_jsonb(v_browsed),
    -- JSON null, not an empty array, when the toggle is off: the formula
    -- reads the type to know whether the badge nudges may fire at all.
    'badges',             CASE WHEN v_pref.use_badge_signals THEN to_jsonb(v_badges) ELSE NULL END,
    'suppressed',         to_jsonb(v_suppressed)
  );
END;
$$;

REVOKE ALL ON FUNCTION personalization_bag(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The formula
--
-- p_row is to_jsonb(content_index row). Emits [{code, w, params}]. The caller
-- derives the score (sum of w) and the reasons (positive w, ordered) from this
-- one array, so a chip can never disagree with the ordering it produced.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION personalization_contributions(p_bag JSONB, p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  c            JSONB  := '[]'::JSONB;
  v_topics     TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'topics', '[]'::JSONB)));
  v_ptopics    TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'profile_topics', '[]'::JSONB)));
  v_cats       TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'categories', '[]'::JSONB)));
  v_types      TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'content_types', '[]'::JSONB)));
  v_ecats      TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'engaged_categories', '[]'::JSONB)));
  v_etags      TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'engaged_topics', '[]'::JSONB)));
  v_browsed    TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'browsed_topics', '[]'::JSONB)));
  v_use_badges BOOLEAN := jsonb_typeof(p_bag->'badges') = 'array';
  v_badges     TEXT[] := CASE WHEN jsonb_typeof(p_bag->'badges') = 'array'
                              THEN ARRAY(SELECT jsonb_array_elements_text(p_bag->'badges'))
                              ELSE ARRAY[]::TEXT[] END;
  v_roles      TEXT[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_bag->'roles', '[]'::JSONB)));
  v_seen       JSONB  := coalesce(p_bag->'seen', '[]'::JSONB);
  v_owners     JSONB  := coalesce(p_bag->'engaged_owners', '[]'::JSONB);

  p_entity      TEXT        := p_row->>'entity';
  p_id          UUID        := (p_row->>'id')::UUID;
  p_tags        TEXT[]      := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_row->'tags', '[]'::JSONB)));
  p_category    TEXT        := p_row->>'category';
  p_type_key    TEXT        := p_row->>'type_key';
  p_climate     BOOLEAN     := coalesce((p_row->>'is_climate_action')::BOOLEAN, FALSE);
  p_featured    BOOLEAN     := coalesce((p_row->>'is_featured')::BOOLEAN, FALSE);
  p_created_at  TIMESTAMPTZ := (p_row->>'created_at')::TIMESTAMPTZ;
  p_occurs_at   TIMESTAMPTZ := (p_row->>'occurs_at')::TIMESTAMPTZ;
  p_deadline_at TIMESTAMPTZ := (p_row->>'deadline_at')::TIMESTAMPTZ;
  p_owner_id    UUID        := (p_row->>'owner_id')::UUID;
  p_popularity  NUMERIC     := coalesce((p_row->>'popularity')::NUMERIC, 0);
  p_country     TEXT        := p_row->>'country_code';
  p_virtual     BOOLEAN     := coalesce((p_row->>'is_virtual')::BOOLEAN, FALSE);

  v_surface  TEXT[];
  v_ns_type  TEXT;
  v_hit      TEXT[];
  v_n        INT;
  v_w        INT;
  v_role     TEXT;
  v_days     NUMERIC;
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
    c := c || jsonb_build_object('code', 'topic', 'w', 25 * v_n,
           'params', jsonb_build_object('topics', to_jsonb(v_hit[1:v_n])));
  END IF;

  IF p_category IS NOT NULL AND normalize_topic(p_category) = ANY(v_cats) THEN
    c := c || jsonb_build_object('code', 'category', 'w', 30,
           'params', jsonb_build_object('category', p_category));
  END IF;

  IF v_ns_type IS NOT NULL AND v_ns_type = ANY(v_types) THEN
    c := c || jsonb_build_object('code', 'type', 'w', 20,
           'params', jsonb_build_object('type', p_type_key));
  END IF;

  IF coalesce((p_bag->>'climate')::BOOLEAN, FALSE) AND p_climate THEN
    c := c || jsonb_build_object('code', 'climate', 'w', 15, 'params', '{}'::JSONB);
  END IF;

  -- ===== Profile fields — inferred, so roughly half weight ==========
  v_hit := ARRAY(
    SELECT DISTINCT x FROM unnest(v_surface) x
     WHERE x = ANY(v_ptopics) AND NOT (x = ANY(v_topics)));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 3);
  IF v_n > 0 THEN
    c := c || jsonb_build_object('code', 'profile', 'w', 12 * v_n,
           'params', jsonb_build_object('topics', to_jsonb(v_hit[1:v_n])));
  END IF;

  -- Role affinity from role_entity_affinity: max over the roles in play.
  SELECT a.weight, a.role_slug INTO v_w, v_role
    FROM role_entity_affinity a
   WHERE a.role_slug = ANY(v_roles) AND a.entity = p_entity
   ORDER BY a.weight DESC, a.role_slug
   LIMIT 1;
  IF v_w IS NOT NULL AND v_w > 0 THEN
    c := c || jsonb_build_object('code', 'role', 'w', v_w,
           'params', jsonb_build_object('role', v_role));
  END IF;

  -- ===== Geography ==================================================
  IF p_country IS NOT NULL AND p_bag->>'country' IS NOT NULL
     AND EXISTS (SELECT 1 FROM countries co
                  WHERE co.code = p_country
                    AND normalize_topic(co.name) = p_bag->>'country') THEN
    c := c || jsonb_build_object('code', 'geo', 'w', 10,
           'params', jsonb_build_object('country', p_bag->>'country_name'));
  END IF;

  IF p_virtual AND p_entity = 'event' THEN
    c := c || jsonb_build_object('code', 'online', 'w', 4, 'params', '{}'::JSONB);
  END IF;

  -- ===== Behaviour =================================================
  IF p_owner_id IS NOT NULL AND v_owners ? p_owner_id::TEXT THEN
    c := c || jsonb_build_object('code', 'author', 'w', 18, 'params', '{}'::JSONB);
  END IF;

  IF p_category IS NOT NULL AND normalize_topic(p_category) = ANY(v_ecats) THEN
    c := c || jsonb_build_object('code', 'engaged_category', 'w', 10,
           'params', jsonb_build_object('category', p_category));
  END IF;

  v_hit := ARRAY(SELECT DISTINCT x FROM unnest(v_surface) x WHERE x = ANY(v_etags));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 2);
  IF v_n > 0 THEN
    c := c || jsonb_build_object('code', 'engaged_topic', 'w', 8 * v_n,
           'params', jsonb_build_object('topics', to_jsonb(v_hit[1:v_n])));
  END IF;

  v_hit := ARRAY(SELECT DISTINCT x FROM unnest(v_surface) x
                  WHERE x = ANY(v_browsed) AND NOT (x = ANY(v_etags)) AND NOT (x = ANY(v_topics)));
  v_n := least(coalesce(array_length(v_hit, 1), 0), 2);
  IF v_n > 0 THEN
    c := c || jsonb_build_object('code', 'browsed', 'w', 5 * v_n,
           'params', jsonb_build_object('topics', to_jsonb(v_hit[1:v_n])));
  END IF;

  -- Already liked / RSVP'd / applied for. Demoted, never removed — an
  -- explicit "not interested" is the only thing that hides (153).
  IF v_seen ? p_id::TEXT THEN
    c := c || jsonb_build_object('code', 'seen', 'w', -40, 'params', '{}'::JSONB);
  END IF;

  -- ===== Badges — nudges toward the next useful step ================
  IF v_use_badges THEN
    IF NOT ('first_project' = ANY(v_badges))
       AND p_entity = 'resource'
       AND (p_type_key IN ('guide', 'template') OR 'getting started' = ANY(v_surface)) THEN
      c := c || jsonb_build_object('code', 'badge_starter', 'w', 14, 'params', '{}'::JSONB);
    END IF;

    IF NOT ('first_connection' = ANY(v_badges))
       AND p_entity = 'event'
       AND p_type_key IN ('meetup', 'conference') THEN
      c := c || jsonb_build_object('code', 'badge_connect', 'w', 10, 'params', '{}'::JSONB);
    END IF;

    IF NOT ('event_goer' = ANY(v_badges))
       AND p_entity = 'event'
       AND p_occurs_at > now() THEN
      c := c || jsonb_build_object('code', 'badge_event', 'w', 8, 'params', '{}'::JSONB);
    END IF;

    IF 'popular_project' = ANY(v_badges) AND p_entity = 'grant' THEN
      c := c || jsonb_build_object('code', 'badge_traction', 'w', 10, 'params', '{}'::JSONB);
    END IF;
  END IF;

  -- Not a badge: profiles.is_verified. Lives outside the badge toggle.
  IF coalesce((p_bag->>'verified')::BOOLEAN, FALSE) AND p_entity = 'grant' THEN
    c := c || jsonb_build_object('code', 'verified', 'w', 12, 'params', '{}'::JSONB);
  END IF;

  -- ===== Context — recency, urgency, popularity =====================
  v_days := extract(epoch FROM (now() - p_created_at)) / 86400.0;
  IF v_days IS NOT NULL AND v_days >= 0 THEN
    c := c || jsonb_build_object('code', 'recency',
           'w', round((20 * exp(-v_days / 30.0))::NUMERIC, 2), 'params', '{}'::JSONB);
  END IF;

  IF p_deadline_at IS NOT NULL THEN
    v_days := extract(epoch FROM (p_deadline_at - now())) / 86400.0;
    IF v_days < 0 THEN
      c := c || jsonb_build_object('code', 'expired', 'w', -60, 'params', '{}'::JSONB);
    ELSIF v_days <= 45 THEN
      c := c || jsonb_build_object('code', 'deadline',
             'w', round((35 * (1 - v_days / 45.0)
                         + CASE WHEN v_days <= 14 THEN 25 * (1 - v_days / 14.0) ELSE 0 END)::NUMERIC, 2),
             'params', jsonb_build_object('days', greatest(round(v_days)::INT, 0)));
    END IF;
  END IF;

  IF p_occurs_at IS NOT NULL THEN
    v_days := extract(epoch FROM (p_occurs_at - now())) / 86400.0;
    IF v_days < -1 THEN
      c := c || jsonb_build_object('code', 'past', 'w', -60, 'params', '{}'::JSONB);
    ELSIF v_days <= 30 THEN
      c := c || jsonb_build_object('code', 'soon',
             'w', round((30 * (1 - greatest(v_days, 0) / 30.0))::NUMERIC, 2),
             'params', jsonb_build_object('days', greatest(round(v_days)::INT, 0)));
    END IF;
  END IF;

  IF p_popularity > 0 THEN
    c := c || jsonb_build_object('code', 'popular',
           'w', least(round((6 * ln(1 + p_popularity))::NUMERIC, 2), 18), 'params', '{}'::JSONB);
  END IF;

  IF p_featured THEN
    c := c || jsonb_build_object('code', 'featured', 'w', 15, 'params', '{}'::JSONB);
  END IF;

  RETURN c;
END;
$$;

REVOKE ALL ON FUNCTION personalization_contributions(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entry point 1: score rows a list page has already fetched
-- ---------------------------------------------------------------------------

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
       FROM jsonb_array_elements(personalization_contributions(v_bag, to_jsonb(ci))) e
   ) s
   WHERE ci.entity = p_entity
     AND ci.id = ANY(p_ids)
     AND NOT (v_bag->'suppressed' ? (ci.entity || ':' || ci.id::TEXT));
END;
$$;

-- ---------------------------------------------------------------------------
-- Entry point 2: the cross-entity rail, with a per-entity floor
-- ---------------------------------------------------------------------------

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
  v_bag      JSONB;
  v_limit    INT    := least(greatest(coalesce(p_limit, 12), 1), 50);
  v_entities TEXT[] := coalesce(p_entities, ARRAY['project', 'resource', 'event', 'grant']);
  v_quota    INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_bag := personalization_bag(auth.uid());

  IF v_bag IS NULL THEN
    RETURN;
  END IF;

  -- Each requested entity is guaranteed this many slots (if it has that many
  -- fresh rows); the remainder is filled by score across all of them.
  v_quota := ceil(v_limit::NUMERIC / greatest(array_length(v_entities, 1), 1));

  RETURN QUERY
  WITH scored AS (
    SELECT ci.entity, ci.id, ci.title, ci.summary, ci.category, ci.type_key,
           ci.tags, ci.occurs_at, ci.deadline_at, ci.created_at, s.score, s.reasons
      FROM content_index ci
     CROSS JOIN LATERAL (
       SELECT coalesce(sum((e->>'w')::NUMERIC), 0) AS score,
              coalesce(
                jsonb_agg(e ORDER BY (e->>'w')::NUMERIC DESC)
                  FILTER (WHERE (e->>'w')::NUMERIC > 0),
                '[]'::JSONB) AS reasons
         FROM jsonb_array_elements(personalization_contributions(v_bag, to_jsonb(ci))) e
     ) s
     WHERE ci.entity = ANY(v_entities)
       AND NOT (v_bag->'suppressed' ? (ci.entity || ':' || ci.id::TEXT))
       -- A rail is a "what next" surface, so unlike the list pages it does
       -- drop things that have already happened.
       AND (ci.occurs_at   IS NULL OR ci.occurs_at   > now() - INTERVAL '1 day')
       AND (ci.deadline_at IS NULL OR ci.deadline_at > now())
       AND (ci.created_at > now() - INTERVAL '18 months'
            OR ci.occurs_at IS NOT NULL
            OR ci.deadline_at IS NOT NULL)
  ),
  ranked AS (
    SELECT sc.*,
           row_number() OVER (PARTITION BY sc.entity
                              ORDER BY sc.score DESC, sc.created_at DESC, sc.id) AS rn
      FROM scored sc
  )
  SELECT r.entity, r.id, r.title, r.summary, r.category, r.type_key,
         r.tags, r.occurs_at, r.deadline_at, r.score, r.reasons
    FROM ranked r
   ORDER BY (r.rn <= v_quota) DESC, r.score DESC, r.created_at DESC, r.id
   LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION rank_content(TEXT, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_personalized_feed(INT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rank_content(TEXT, UUID[])         TO authenticated;
GRANT EXECUTE ON FUNCTION get_personalized_feed(INT, TEXT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
