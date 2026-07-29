-- 050: Short summary one-liners + a tag vocabulary for resources, integrations,
-- events and projects.
--
-- Brings the remaining content entities in line with grants, which have had a
-- `summary` since 042_hero_summaries.sql. Tags follow the array pattern
-- established by 015_resource_library.sql (TEXT[] + GIN index).
--
-- Projects deliberately keep their existing `hashtags` column as the tag field
-- (001_create_projects_table.sql) — a second free-form array on the same table
-- would be ambiguous at every read site.
--
-- Idempotent: safe to re-run.

-- === Summary =================================================================
ALTER TABLE resources    ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS summary TEXT;
-- events and projects already got `summary` in 042 — these are no-ops, kept so
-- this file states the full end state.
ALTER TABLE events       ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE projects     ADD COLUMN IF NOT EXISTS summary TEXT;

-- === Tags ====================================================================
-- resources.tags exists (015) and projects.hashtags exists (001).
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE events       ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_integrations_tags ON integrations USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_events_tags       ON events       USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_projects_hashtags ON projects     USING GIN (hashtags);
-- idx_resources_tags already created in 015.

-- === Free-text search over tags ==============================================
-- `ilike` cannot be applied to a text[] column — PostgREST would emit
-- `"tags" ILIKE '%x%'` and Postgres raises 42883. A function taking the table's
-- composite type is exposed by PostgREST as a virtual, filterable column, so
-- `tags_text.ilike.%x%` can sit inside the same .or(...) as title/description.
-- Computed fields are not returned by `select('*')`, so this costs no payload.
CREATE OR REPLACE FUNCTION public.tags_text(resources) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(integrations) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(events) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.tags, ' ') $$;

CREATE OR REPLACE FUNCTION public.tags_text(projects) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT array_to_string($1.hashtags, ' ') $$;

GRANT EXECUTE ON FUNCTION public.tags_text(resources)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(integrations) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(events)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tags_text(projects)     TO anon, authenticated;

-- PostgREST caches the schema; without this the new computed fields are
-- invisible and every filter referencing them returns 400.
NOTIFY pgrst, 'reload schema';
