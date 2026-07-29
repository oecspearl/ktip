-- ============================================================
-- Migration 055: Personalization settings + topic taxonomy
--
-- 1. user_personalization — the row behind Settings › Personalization:
--    a master switch, per-signal-group opt-outs, and the explicit
--    picks the member makes.
--
--    The picks are stored in the *content* vocabulary (real stored
--    tags, the shared project/resource category enum, and the
--    resource/event/grant type enums) rather than in the profile
--    suggestion vocabulary, so they can be compared to content rows
--    with `&&` instead of guessed at.
--
-- 2. topic_aliases + normalize_topic() + expand_topics() — the bridge
--    across the three disjoint vocabularies already in
--    src/lib/constants.ts: INTEREST_SUGGESTIONS ("AgriTech"),
--    SKILL_SUGGESTIONS ("Agriculture Technology") and INDUSTRIES
--    ("Agriculture & Agri-processing") all mean the content tag
--    "agriculture", and nothing in the codebase knows that.
--
--    Deliberately DATA, not code: an OECS admin retunes the mapping
--    with an INSERT or UPDATE, no deploy. And it only ever runs on
--    the *user* side of a comparison — content tags are never
--    rewritten, so there is no backfill and no sync obligation.
--
-- No scoring here; 061 adds that. Applying this file alone changes
-- nothing any existing screen renders.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_personalization (
  user_id              UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Master switch. When false the ranker returns nothing and every
  -- surface falls back to its existing server-side ordering.
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,

  -- Per-signal-group opt-outs, so a member can keep personalization
  -- on while excluding, say, their browsing behaviour.
  use_profile_signals  BOOLEAN NOT NULL DEFAULT TRUE,
  use_behavior_signals BOOLEAN NOT NULL DEFAULT TRUE,
  use_badge_signals    BOOLEAN NOT NULL DEFAULT TRUE,

  climate_focus        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Real stored tags: 'agriculture', 'blue economy', 'funding'.
  topics        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- projects.category and resources.category share one enum, so a
  -- single array covers both: 'technology' | 'healthcare' |
  -- 'education' | 'agriculture' | 'environment' | 'climate_action' |
  -- 'business' | 'other'
  categories    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Namespaced, because 'education' is BOTH a resource category and a
  -- grant type: 'resource:guide', 'event:workshop', 'grant:startup'.
  content_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_personalization_topics_len
    CHECK (coalesce(array_length(topics, 1), 0) <= 40),
  CONSTRAINT user_personalization_categories_len
    CHECK (coalesce(array_length(categories, 1), 0) <= 20),
  CONSTRAINT user_personalization_types_len
    CHECK (coalesce(array_length(content_types, 1), 0) <= 30)
);

CREATE INDEX IF NOT EXISTS idx_user_personalization_topics
  ON user_personalization USING GIN (topics);

DROP TRIGGER IF EXISTS set_user_personalization_updated_at ON user_personalization;
CREATE TRIGGER set_user_personalization_updated_at
  BEFORE UPDATE ON user_personalization
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_personalization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own personalization" ON user_personalization;
CREATE POLICY "Users can view own personalization"
  ON user_personalization FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own personalization" ON user_personalization;
CREATE POLICY "Users can create own personalization"
  ON user_personalization FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own personalization" ON user_personalization;
CREATE POLICY "Users can update own personalization"
  ON user_personalization FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- "Reset personalization" in Settings deletes the row rather than
-- writing empty arrays, so the defaults live in exactly one place:
-- the column definitions above.
DROP POLICY IF EXISTS "Users can delete own personalization" ON user_personalization;
CREATE POLICY "Users can delete own personalization"
  ON user_personalization FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Topic normalisation
-- ============================================================

-- Folds the punctuation differences between the vocabularies:
--   'UX/UI Design'                  -> 'ux ui design'
--   'Policy & Governance'           -> 'policy governance'
--   'Agriculture & Agri-processing' -> 'agriculture agri processing'
--   'climate_action'                -> 'climate action'
-- IMMUTABLE so it can be used in index expressions later if needed.
CREATE OR REPLACE FUNCTION normalize_topic(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_value, ''))), '[&/,._#-]+', ' ', 'g'),
      '\s+', ' ', 'g'
    ), '')
$$;

-- ============================================================
-- Alias dictionary
--
-- Composite PK rather than `alias` alone: one interest legitimately
-- fans out to several content tags ("Climate Adaptation" is climate
-- AND environment), and collapsing that to a single canonical would
-- throw away the broader match.
-- ============================================================

CREATE TABLE IF NOT EXISTS topic_aliases (
  alias      TEXT NOT NULL,   -- already normalized, i.e. normalize_topic() applied
  canonical  TEXT NOT NULL,   -- a real content tag or category value
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alias, canonical)
);

CREATE INDEX IF NOT EXISTS idx_topic_aliases_canonical ON topic_aliases (canonical);

ALTER TABLE topic_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Topic aliases readable by everyone" ON topic_aliases;
CREATE POLICY "Topic aliases readable by everyone"
  ON topic_aliases FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "OECS admins manage topic aliases" ON topic_aliases;
CREATE POLICY "OECS admins manage topic aliases"
  ON topic_aliases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.roles @> ARRAY['oecs']::text[]
    )
  );

-- Seed: every INTEREST_SUGGESTIONS / SKILL_SUGGESTIONS / INDUSTRIES
-- value with a plausible equivalent in CONTENT_TAG_SUGGESTIONS,
-- PROJECT_CATEGORIES or RESOURCE_CATEGORY_LABELS. Aliases are written
-- pre-normalized so the lookup is a plain equality join.
INSERT INTO topic_aliases (alias, canonical) VALUES
  -- --- interests -------------------------------------------------
  ('agritech',                        'agriculture'),
  ('climate adaptation',              'climate'),
  ('climate adaptation',              'environment'),
  ('digital transformation',          'technology'),
  ('youth entrepreneurship',          'startup'),
  ('sustainable tourism',             'tourism'),
  ('sustainable tourism',             'environment'),
  ('blue economy',                    'blue economy'),
  ('blue economy',                    'environment'),
  ('renewable energy',                'renewable energy'),
  ('renewable energy',                'environment'),
  ('social innovation',               'community'),
  ('social innovation',               'policy'),
  ('artificial intelligence',         'technology'),
  ('artificial intelligence',         'data'),
  ('circular economy',                'environment'),
  ('food security',                   'agriculture'),
  ('health innovation',               'healthtech'),
  ('health innovation',               'healthcare'),
  ('creative industries',             'creative industries'),
  ('financial inclusion',             'fintech'),
  ('smart cities',                    'technology'),
  ('ocean conservation',              'blue economy'),
  ('ocean conservation',              'environment'),

  -- --- skills ----------------------------------------------------
  ('software development',            'technology'),
  ('software development',            'open source'),
  ('data science',                    'data'),
  ('data science',                    'technology'),
  ('ux ui design',                    'technology'),
  ('project management',              'business'),
  ('marketing',                       'business'),
  ('finance',                         'fintech'),
  ('finance',                         'funding'),
  ('agriculture technology',          'agriculture'),
  ('marine conservation',             'blue economy'),
  ('climate resilience',              'climate'),
  ('education technology',            'education'),
  ('healthcare innovation',           'healthtech'),
  ('healthcare innovation',           'healthcare'),
  ('tourism innovation',              'tourism'),
  ('business strategy',               'business'),
  ('community development',           'community'),
  ('policy governance',               'policy'),
  ('creative arts',                   'creative industries'),
  ('supply chain',                    'business'),
  ('water management',                'environment'),
  ('disaster preparedness',           'climate'),

  -- --- industries ------------------------------------------------
  ('agriculture agri processing',     'agriculture'),
  ('tourism hospitality',             'tourism'),
  ('ict digital services',            'technology'),
  ('blue economy fisheries',          'blue economy'),
  ('health wellness',                 'healthcare'),
  ('education training',              'education'),
  ('financial services',              'fintech'),
  ('manufacturing',                   'business'),
  ('climate resilience environment',  'climate'),
  ('climate resilience environment',  'environment'),
  ('transport logistics',             'business'),

  -- --- category enum <-> tag reconciliation ----------------------
  -- resources.category = 'climate_action' normalizes to
  -- 'climate action'; the tag corpus spells it 'climate'.
  ('climate action',                  'climate'),
  ('climate',                         'climate action')
ON CONFLICT (alias, canonical) DO NOTHING;

-- Expand a raw list (profile interests/skills/industry, or the
-- member's own topic picks) into the canonical content vocabulary.
-- Always keeps the normalized original, so an exact tag match still
-- works for anything the dictionary has never heard of.
CREATE OR REPLACE FUNCTION expand_topics(p_values TEXT[])
RETURNS TEXT[]
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.t), ARRAY[]::TEXT[])
  FROM (
    SELECT normalize_topic(v) AS t
      FROM unnest(coalesce(p_values, ARRAY[]::TEXT[])) v
    UNION
    SELECT normalize_topic(a.canonical)
      FROM unnest(coalesce(p_values, ARRAY[]::TEXT[])) v
      JOIN topic_aliases a ON a.alias = normalize_topic(v)
  ) s
  WHERE s.t IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION normalize_topic(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION expand_topics(TEXT[])  TO anon, authenticated;

-- PostgREST caches the schema; without this the new table is invisible.
NOTIFY pgrst, 'reload schema';
