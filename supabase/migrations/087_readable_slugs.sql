-- Migration 087: Readable slugs for the public detail pages
--
-- Every public page is addressed by uuid today — /grants/4a6da97b-1872-…. Those
-- URLs get pasted into email and chat and say nothing about what they point at.
-- This gives grants, events, projects, resources and forum posts a slug, and
-- profiles a username, so a link reads as a name.
--
-- WHY THE ROUTES DO NOT CHANGE
-- ----------------------------
-- The client treats the existing :id route param as id-OR-slug: a uuid-shaped
-- segment is looked up by id, anything else by slug. So every uuid link ever
-- sent still resolves, including the notification rows minted by the triggers in
-- 051_submission_receipts.sql ('/grants/' || NEW.grant_id::text), which this
-- migration deliberately leaves alone.
--
-- WHY THE SLUG IS FROZEN AFTER INSERT
-- -----------------------------------
-- The trigger fires BEFORE INSERT only. Renaming a grant must not silently move
-- its URL out from under the links already in people's inboxes. Regenerating is
-- a deliberate act: set slug = NULL and save, and the next write re-derives it.
-- (An UPDATE trigger would also have to re-check uniqueness on every title edit,
-- which is cost paid on the wrong operation.)
--
-- WHY UNIQUENESS IS A PARTIAL INDEX ON lower(slug)
-- ------------------------------------------------
-- Partial (WHERE slug IS NOT NULL) so rows that predate the backfill — or rows
-- whose slug was cleared on purpose — never collide with each other. On
-- lower() because a URL is case-insensitive in practice and two slugs differing
-- only in case would be indistinguishable to anyone reading them.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. slugify()
-- ============================================================

-- IMMUTABLE so it can be used inside an index expression and inside the
-- window function in section 3 without Postgres re-evaluating it per row.
CREATE OR REPLACE FUNCTION public.slugify(p_text TEXT)
RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(
      btrim(
        regexp_replace(lower(COALESCE(p_text, '')), '[^a-z0-9]+', '-', 'g'),
        '-'
      ),
      ''
    ),
    'item'
  );
$$ LANGUAGE sql IMMUTABLE STRICT SET search_path = public;

COMMENT ON FUNCTION public.slugify(TEXT) IS 'Title → url segment. Non-ASCII is dropped rather than transliterated; the DB is authoritative for slugs so the client never has to reproduce this exactly';

-- Assign the first free slug in the base, base-2, base-3 … series.
-- Takes the table name so one function serves all five tables; the dynamic SQL
-- is safe because p_table is only ever passed a literal from a trigger below.
CREATE OR REPLACE FUNCTION public.unique_slug(
  p_table TEXT,
  p_base TEXT,
  p_scope_column TEXT DEFAULT NULL,
  p_scope_value UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_base TEXT := slugify(p_base);
  v_try  TEXT;
  v_n    INT := 1;
  v_hit  BOOLEAN;
BEGIN
  LOOP
    v_try := CASE WHEN v_n = 1 THEN v_base ELSE v_base || '-' || v_n END;

    IF p_scope_column IS NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE lower(slug) = $1)', p_table)
        INTO v_hit USING lower(v_try);
    ELSE
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I WHERE lower(slug) = $1 AND %I = $2)',
        p_table, p_scope_column
      ) INTO v_hit USING lower(v_try), p_scope_value;
    END IF;

    EXIT WHEN NOT v_hit;
    v_n := v_n + 1;
    -- Runaway guard. A title colliding 200 times is a bug, not a workload.
    IF v_n > 200 THEN
      RETURN v_base || '-' || substr(gen_random_uuid()::text, 1, 8);
    END IF;
  END LOOP;

  RETURN v_try;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Columns
-- ============================================================

ALTER TABLE grants      ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE events      ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE projects    ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE resources   ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE profiles    ADD COLUMN IF NOT EXISTS username TEXT;

COMMENT ON COLUMN grants.slug IS 'URL segment, frozen at insert. NULL is legal and falls back to the uuid route';
COMMENT ON COLUMN profiles.username IS 'Vanity segment for /u/<username>. display_name is neither unique nor stable, so it cannot be the URL';

-- ============================================================
-- 3. Backfill
-- ============================================================

-- One statement per table rather than a loop: the window function is what does
-- the de-duplication, numbering same-titled rows oldest-first so the original
-- keeps the clean slug and later duplicates take -2, -3.
WITH numbered AS (
  SELECT id,
         slugify(title) AS base,
         row_number() OVER (PARTITION BY slugify(title) ORDER BY created_at, id) AS n
  FROM grants
  WHERE slug IS NULL
)
UPDATE grants g
SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE g.id = n.id;

WITH numbered AS (
  SELECT id,
         slugify(title) AS base,
         row_number() OVER (PARTITION BY slugify(title) ORDER BY created_at, id) AS n
  FROM events
  WHERE slug IS NULL
)
UPDATE events e
SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE e.id = n.id;

WITH numbered AS (
  SELECT id,
         slugify(title) AS base,
         row_number() OVER (PARTITION BY slugify(title) ORDER BY created_at, id) AS n
  FROM projects
  WHERE slug IS NULL
)
UPDATE projects p
SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE p.id = n.id;

WITH numbered AS (
  SELECT id,
         slugify(title) AS base,
         row_number() OVER (PARTITION BY slugify(title) ORDER BY created_at, id) AS n
  FROM resources
  WHERE slug IS NULL
)
UPDATE resources r
SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE r.id = n.id;

-- Posts are scoped to their board: two boards may each have a "Welcome" thread.
WITH numbered AS (
  SELECT id,
         board_id,
         slugify(title) AS base,
         row_number() OVER (PARTITION BY board_id, slugify(title) ORDER BY created_at, id) AS n
  FROM forum_posts
  WHERE slug IS NULL
)
UPDATE forum_posts f
SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE f.id = n.id;

WITH numbered AS (
  SELECT id,
         slugify(COALESCE(NULLIF(btrim(display_name), ''), 'member')) AS base,
         row_number() OVER (
           PARTITION BY slugify(COALESCE(NULLIF(btrim(display_name), ''), 'member'))
           ORDER BY created_at, id
         ) AS n
  FROM profiles
  WHERE username IS NULL
)
UPDATE profiles p
SET username = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE p.id = n.id;

-- ============================================================
-- 4. Uniqueness
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_slug
  ON grants (lower(slug)) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug
  ON events (lower(slug)) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug
  ON projects (lower(slug)) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_slug
  ON resources (lower(slug)) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_posts_slug
  ON forum_posts (board_id, lower(slug)) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username
  ON profiles (lower(username)) WHERE username IS NOT NULL;

-- ============================================================
-- 5. Insert triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_slug_from_title()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    NEW.slug := unique_slug(TG_TABLE_NAME, NEW.title);
  ELSE
    -- A caller-supplied slug is still normalised, so nothing can put a space or
    -- a slash into a URL segment.
    NEW.slug := unique_slug(TG_TABLE_NAME, NEW.slug);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.assign_forum_post_slug()
RETURNS TRIGGER AS $$
BEGIN
  NEW.slug := unique_slug(
    'forum_posts',
    COALESCE(NULLIF(btrim(NEW.slug), ''), NEW.title),
    'board_id',
    NEW.board_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- unique_slug() reads `slug`, so profiles needs its own lookup against
-- `username`. Kept as a thin wrapper rather than parameterising the column,
-- because every other caller would then have to pass a column name it does not
-- care about.
CREATE OR REPLACE FUNCTION public.unique_username(p_base TEXT)
RETURNS TEXT AS $$
DECLARE
  v_base TEXT := slugify(p_base);
  v_try  TEXT;
  v_n    INT := 1;
BEGIN
  LOOP
    v_try := CASE WHEN v_n = 1 THEN v_base ELSE v_base || '-' || v_n END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE lower(username) = lower(v_try));
    v_n := v_n + 1;
    IF v_n > 200 THEN
      RETURN v_base || '-' || substr(gen_random_uuid()::text, 1, 8);
    END IF;
  END LOOP;
  RETURN v_try;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.assign_profile_username()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
    NEW.username := unique_username(COALESCE(NULLIF(btrim(NEW.display_name), ''), 'member'));
  ELSE
    NEW.username := unique_username(NEW.username);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS assign_grant_slug ON grants;
CREATE TRIGGER assign_grant_slug BEFORE INSERT ON grants
  FOR EACH ROW EXECUTE FUNCTION assign_slug_from_title();

DROP TRIGGER IF EXISTS assign_event_slug ON events;
CREATE TRIGGER assign_event_slug BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION assign_slug_from_title();

DROP TRIGGER IF EXISTS assign_project_slug ON projects;
CREATE TRIGGER assign_project_slug BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION assign_slug_from_title();

DROP TRIGGER IF EXISTS assign_resource_slug ON resources;
CREATE TRIGGER assign_resource_slug BEFORE INSERT ON resources
  FOR EACH ROW EXECUTE FUNCTION assign_slug_from_title();

DROP TRIGGER IF EXISTS assign_forum_post_slug_trigger ON forum_posts;
CREATE TRIGGER assign_forum_post_slug_trigger BEFORE INSERT ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION assign_forum_post_slug();

DROP TRIGGER IF EXISTS assign_profile_username_trigger ON profiles;
CREATE TRIGGER assign_profile_username_trigger BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION assign_profile_username();

-- ============================================================
-- 6. Grants
-- ============================================================

-- Postgres grants EXECUTE to PUBLIC by default; unique_slug() takes a table name
-- and runs dynamic SQL, so it is not something an anon client should be able to
-- call directly. The triggers run as the definer and do not need this grant.
REVOKE ALL ON FUNCTION public.unique_slug(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unique_username(TEXT) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification (run separately; read-only)
-- ============================================================
--
--   SELECT id, title, slug FROM grants ORDER BY created_at LIMIT 10;
--
--   -- Expect zero rows from each of these:
--   SELECT lower(slug), count(*) FROM grants      GROUP BY 1 HAVING count(*) > 1;
--   SELECT lower(slug), count(*) FROM events      GROUP BY 1 HAVING count(*) > 1;
--   SELECT lower(slug), count(*) FROM projects    GROUP BY 1 HAVING count(*) > 1;
--   SELECT lower(slug), count(*) FROM resources   GROUP BY 1 HAVING count(*) > 1;
--   SELECT board_id, lower(slug), count(*) FROM forum_posts GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT lower(username), count(*) FROM profiles GROUP BY 1 HAVING count(*) > 1;
--
--   -- And nothing should be left unslugged:
--   SELECT count(*) FROM grants WHERE slug IS NULL;
