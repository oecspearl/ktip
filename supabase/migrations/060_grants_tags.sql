-- ============================================================
-- Migration 060: grants.tags
--
-- Grants were left out of 050_summaries_and_tags.sql and are now the
-- only content entity with no tag vocabulary. Everything tag-driven
-- therefore skips them: the filter chips, useTagVocabulary, and — once
-- 061 lands — the personalization ranker, which would be left scoring
-- grants on grant_type and deadline alone. That is the highest-value
-- content on the platform, so it is the worst place to have the
-- weakest signal.
--
-- Mirrors 050 exactly: TEXT[] + GIN + a tags_text() computed column so
-- `tags_text.ilike.%x%` can sit inside the same .or(...) group as
-- title/description/eligibility.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE grants ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_grants_tags ON grants USING GIN (tags);

CREATE OR REPLACE FUNCTION public.tags_text(grants) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

GRANT EXECUTE ON FUNCTION public.tags_text(grants) TO anon, authenticated;

-- Bootstrap a starting vocabulary from what is already known about each
-- grant, so the column is not dead on arrival and the chips have
-- something to show on day one. Both statements are guarded so a re-run
-- never clobbers tags an admin has curated since.
UPDATE grants
   SET tags = ARRAY['climate']
 WHERE is_climate_action = TRUE
   AND coalesce(array_length(tags, 1), 0) = 0;

UPDATE grants
   SET tags = array_append(coalesce(tags, ARRAY[]::TEXT[]), grant_type)
 WHERE grant_type IS NOT NULL
   AND NOT (grant_type = ANY(coalesce(tags, ARRAY[]::TEXT[])));

-- PostgREST caches the schema; without this `tags` and the computed
-- `tags_text` are invisible and every filter referencing them returns 400.
NOTIFY pgrst, 'reload schema';
