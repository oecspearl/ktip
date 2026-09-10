-- ============================================================================
-- 153_personalization_schema.sql — the tables and columns the ranker was missing
-- ============================================================================
-- 061 built a ranker that could only read five behaviour tables, knew nothing
-- about where a member is, weighted five of twenty roles, and had no way for a
-- member to say "not this". This migration adds the schema; 154 rebuilds the
-- formula on top of it. Split so a problem in the formula can be rolled back
-- by re-running 154 alone without touching a table.
--
-- 1. events.country_code — geography for the one entity that has a place.
--    Projects, grants and resources carry NO geography BY DESIGN: a grant's
--    eligibility is free text ("OECS nationals"), a project belongs to its
--    owner rather than to an island, a PDF has no address. Do not file that
--    as a gap. profiles.country stays free text (058 says why); the ranker
--    joins it to countries.name, and every name the country picker offers for
--    the region appears verbatim in that table.
--
-- 2. content_views — the popularity signal the index was faking. 061 read
--    projects.view_count and hard-coded 0 for the other three entities, so
--    "popular" and "featured" were projects-only and the cold-start rail was
--    structurally a projects rail. analytics_events cannot fill this: its
--    page_view rows carry no entity id and the path segment is a slug. One
--    row per (entity, item, viewer, day), counted up, written only through a
--    definer function so a client can neither read the table nor forge rows
--    for someone else. Anonymous viewers count under the nil UUID.
--
-- 3. content_suppressions — "not interested". This deliberately overturns
--    061's "rank, never hide" for one case: an explicit choice by the member.
--    Inferred history (already liked, already applied) stays demoted rather
--    than hidden, exactly as before. A suppressed item is filtered out of
--    both entry points before scoring, and the member can unhide it from
--    Settings › Personalization.
--
-- 4. role_entity_affinity — the role term as data. 061's IF/ELSIF covered
--    investor, entrepreneur, student, faculty and mentor at 8 points and
--    nothing else, so fifteen roles had no term and a mentor who also
--    invests only ever hit the first branch. Every slug in role_definitions
--    is seeded here, including the alias 'oecs', and the ranker takes the
--    MAX weight across the roles in play rather than the first match.
--    Default 18: below the 25/topic and 30/category a member picks
--    explicitly, above the 12/hit inferred from profile fields. Admin-tier
--    seats browse rather than seek and sit at 10. Retunable with an UPDATE.
--
-- 5. user_personalization.prompt_dismissed_at — the "tell us your interests"
--    prompt used to remember its dismissal in localStorage, so a member who
--    closed it on their phone saw it again on their laptop and a member who
--    closed it once was never asked again on that device. Server-side, with
--    a re-prompt after thirty days if there are still no signals.
--
-- Requires 058 (countries), 061 (content_index), 063 (role_definitions).
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Event geography
-- ---------------------------------------------------------------------------

ALTER TABLE events ADD COLUMN IF NOT EXISTS country_code CHAR(2) REFERENCES countries(code);

COMMENT ON COLUMN events.country_code IS
  'ISO 3166-1 alpha-2, FK to countries. NULL for virtual events and for events whose country is unknown. Fed by the country picker on the event forms; scored by the ranker''s geo term (154).';

-- Best-effort backfill from the free-text location, guarded so a re-run never
-- overwrites a picker choice. Ambiguous locations stay NULL.
UPDATE events e
   SET country_code = c.code
  FROM countries c
 WHERE e.country_code IS NULL
   AND NOT coalesce(e.is_virtual, FALSE)
   AND e.location IS NOT NULL
   AND e.location ILIKE '%' || c.name || '%';

-- 'Antigua' alone appears in seed data; the table name is 'Antigua and Barbuda'.
UPDATE events
   SET country_code = 'AG'
 WHERE country_code IS NULL
   AND NOT coalesce(is_virtual, FALSE)
   AND location ILIKE '%antigua%';

-- ---------------------------------------------------------------------------
-- 2. Content views
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_views (
  entity     TEXT NOT NULL CHECK (entity IN ('project', 'resource', 'event', 'grant')),
  content_id UUID NOT NULL,
  -- The nil UUID stands for "not signed in". A NULL would break the primary
  -- key, and anonymous traffic is exactly the popularity we want counted.
  user_id    UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  day        DATE NOT NULL DEFAULT current_date,
  views      INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (entity, content_id, user_id, day)
);

COMMENT ON TABLE content_views IS
  'Detail-page views per (entity, item, viewer, day). Popularity for all four rankable entities and the caller''s own browsing signal. Written only by record_content_view(); no client policy.';

CREATE INDEX IF NOT EXISTS idx_content_views_item ON content_views (entity, content_id);
CREATE INDEX IF NOT EXISTS idx_content_views_viewer ON content_views (user_id, day DESC);

ALTER TABLE content_views ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: nothing reads or writes this table except the
-- definer functions below and in 154. RLS on with zero policies is "deny all".

-- A member's rows go when the member does. Not a FK — the nil UUID has no
-- profile — so it is a trigger on profiles instead.
CREATE OR REPLACE FUNCTION content_views_forget_member()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM content_views WHERE user_id = OLD.id;
  DELETE FROM content_suppressions WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_views_forget_member ON profiles;
CREATE TRIGGER trg_content_views_forget_member
  AFTER DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION content_views_forget_member();

CREATE OR REPLACE FUNCTION record_content_view(p_entity TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
BEGIN
  IF p_id IS NULL OR p_entity IS NULL
     OR p_entity NOT IN ('project', 'resource', 'event', 'grant') THEN
    RETURN;
  END IF;

  -- Only things that exist and are visible count, so the table cannot be
  -- used to probe for ids or to inflate a draft.
  IF NOT EXISTS (SELECT 1 FROM content_index ci WHERE ci.entity = p_entity AND ci.id = p_id) THEN
    RETURN;
  END IF;

  INSERT INTO content_views (entity, content_id, user_id, day, views)
  VALUES (p_entity, p_id, v_user, current_date, 1)
  ON CONFLICT (entity, content_id, user_id, day)
  DO UPDATE SET views = content_views.views + 1;
END;
$$;

REVOKE ALL ON FUNCTION record_content_view(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_content_view(TEXT, UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suppressions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_suppressions (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity     TEXT NOT NULL CHECK (entity IN ('project', 'resource', 'event', 'grant')),
  content_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity, content_id)
);

COMMENT ON TABLE content_suppressions IS
  'Items a member marked "not interested". Filtered out of rank_content and get_personalized_feed before scoring; listed and reversible from Settings › Personalization.';

ALTER TABLE content_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own suppressions" ON content_suppressions;
CREATE POLICY "Members read own suppressions"
  ON content_suppressions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members add own suppressions" ON content_suppressions;
CREATE POLICY "Members add own suppressions"
  ON content_suppressions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members remove own suppressions" ON content_suppressions;
CREATE POLICY "Members remove own suppressions"
  ON content_suppressions FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Role affinity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS role_entity_affinity (
  role_slug TEXT NOT NULL,
  entity    TEXT NOT NULL CHECK (entity IN ('project', 'resource', 'event', 'grant')),
  weight    INT  NOT NULL CHECK (weight BETWEEN 0 AND 30),
  PRIMARY KEY (role_slug, entity)
);

COMMENT ON TABLE role_entity_affinity IS
  'How strongly each role tends to want each content entity. Read by personalization_contributions (154), max over the roles in play. Tune with UPDATE; no deploy needed.';

INSERT INTO role_entity_affinity (role_slug, entity, weight) VALUES
  -- Learners and educators: the library and the calendar.
  ('student',              'resource', 18), ('student',              'event', 18), ('student',              'project', 10),
  ('faculty',              'resource', 18), ('faculty',              'event', 18), ('faculty',              'project', 10),
  ('educational_partner',  'event',    18), ('educational_partner',  'resource', 14), ('educational_partner', 'project', 10),
  -- Research: what is being built, what is being written, what funds it.
  ('researcher',           'resource', 18), ('researcher',           'project', 18), ('researcher',          'grant', 12),
  ('research_institution', 'project',  18), ('research_institution', 'grant',   18), ('research_institution','resource', 12),
  -- Mentors follow projects; the calendar is where they meet founders.
  ('mentor',               'project',  18), ('mentor',               'event',   12), ('mentor',              'resource', 10),
  -- Money and the people asking for it.
  ('investor',             'grant',    18), ('investor',             'project', 18),
  ('entrepreneur',         'grant',    18), ('entrepreneur',         'project', 18), ('entrepreneur',        'event', 10), ('entrepreneur', 'resource', 10),
  ('private_sector',       'grant',    18), ('private_sector',       'project', 14), ('private_sector',      'event', 12),
  ('chamber_admin',        'project',  18), ('chamber_admin',        'event',   14), ('chamber_admin',       'grant', 10),
  ('ngo',                  'grant',    18), ('ngo',                  'project', 14), ('ngo',                 'event', 10),
  ('government',           'grant',    18), ('government',           'project', 12), ('government',          'event', 12),
  ('igo',                  'grant',    18), ('igo',                  'project', 12), ('igo',                 'event', 12),
  ('diaspora',             'grant',    18), ('diaspora',             'project', 14), ('diaspora',            'event', 10),
  -- Admin tier browses rather than seeks. Low and flat.
  ('super_admin',          'project',  10), ('super_admin',          'event',   10),
  ('oecs',                 'project',  10), ('oecs',                 'event',   10),
  ('admin',                'project',  10), ('admin',                'event',   10),
  ('people_supervisor',    'project',  10), ('people_supervisor',    'event',   10),
  ('programme_supervisor', 'project',  10), ('programme_supervisor', 'event',   10),
  ('safety_admin',         'project',  10), ('safety_admin',         'event',   10)
ON CONFLICT (role_slug, entity) DO NOTHING;

ALTER TABLE role_entity_affinity ENABLE ROW LEVEL SECURITY;
-- Read by definer functions only; nothing for a client to see or change.

-- ---------------------------------------------------------------------------
-- 5. Server-side prompt dismissal
-- ---------------------------------------------------------------------------

ALTER TABLE user_personalization ADD COLUMN IF NOT EXISTS prompt_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN user_personalization.prompt_dismissed_at IS
  'When the member last closed the "tell us what you are interested in" prompt. The rail re-asks after 30 days while there are still no signals. NULL = never dismissed.';

NOTIFY pgrst, 'reload schema';
