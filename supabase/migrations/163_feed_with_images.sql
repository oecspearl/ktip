-- ============================================================================
-- 163_feed_with_images.sql — the "For You" rail in one round trip
-- ============================================================================
-- The rail cost three serial round trips before it could paint:
--
--   1. user_personalization, read client-side to decide whether to ask at all
--   2. get_personalized_feed (154)
--   3. four image lookups (projects, events, resources, grants), keyed on the
--      ids step 2 returned
--
-- At ~90 ms RTT that is ~800 ms of waiting on /dashboard; on a phone at
-- 250-300 ms it is two seconds.
--
-- Step 1 was never needed: personalization_bag() already returns NULL for a
-- member who switched personalization off, and the feed returns no rows for
-- them. Step 3 exists only because the feed carries no image columns. This
-- wrapper adds them, so the client asks once, as soon as it knows who is
-- signed in.
--
-- The image rules match each entity's own card (src/hooks/usePersonalizedFeed.ts
-- documents them): project and event use image_url, resource uses
-- thumbnail_url, and a grant has no image column: its artwork is picked
-- client-side from type_key, which the feed already returns.
--
-- A wrapper rather than a change to get_personalized_feed: the old signature
-- keeps working for any client that predates this, and the client falls back
-- to it (and to its own lookups) where this migration has not been applied.
-- SECURITY DEFINER like the feed itself; every row it decorates already
-- passed the feed's visibility rules (content_index lists only public
-- projects, active grants, and so on).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_personalized_feed_v2(
  p_limit    INT    DEFAULT 12,
  p_entities TEXT[] DEFAULT ARRAY['project', 'resource', 'event', 'grant']
) RETURNS TABLE (
  entity            TEXT,
  id                UUID,
  title             TEXT,
  summary           TEXT,
  category          TEXT,
  type_key          TEXT,
  tags              TEXT[],
  occurs_at         TIMESTAMPTZ,
  deadline_at       TIMESTAMPTZ,
  score             NUMERIC,
  reasons           JSONB,
  image_url         TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.entity, f.id, f.title, f.summary, f.category, f.type_key,
         f.tags, f.occurs_at, f.deadline_at, f.score, f.reasons,
         CASE f.entity
           WHEN 'project'  THEN (SELECT p.image_url     FROM projects  p WHERE p.id = f.id)
           WHEN 'event'    THEN (SELECT e.image_url     FROM events    e WHERE e.id = f.id)
           WHEN 'resource' THEN (SELECT r.thumbnail_url FROM resources r WHERE r.id = f.id)
         END
    -- WITH ORDINALITY keeps the feed's own ranking; a join may not.
    FROM get_personalized_feed(p_limit, p_entities) WITH ORDINALITY AS f
   ORDER BY f.ordinality
$$;

REVOKE ALL ON FUNCTION get_personalized_feed_v2(INT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_personalized_feed_v2(INT, TEXT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
