-- ============================================================================
-- 162_profile_section_visibility.sql — choose who sees each part of a profile
-- ============================================================================
-- 083 gave a member one switch: the whole profile open to every member, or
-- closed to everyone but accepted connections. A member who wanted their
-- achievements on show and their phone number not had to pick one.
--
-- profiles.section_visibility is a map of section -> 'public' | 'private' that
-- overrides profile_visibility for that one section. A section with no entry
-- follows profile_visibility, so every existing member reads exactly as before
-- and the master switch keeps meaning "the whole page" — the client clears the
-- map whenever it flips the master, which is what "make it all private" means.
--
--   about         bio
--   details       organization, industry, website, phone
--   skills / interests / languages / open_to
--   organisation  the verified employer card (public_employer_for_user)
--   cv            the published CV (public_resume, resumes RLS)
--   standing      level, points, rank (get_profile_stats, _batch)
--   achievements  the trophy shelf and the pinned showcase
--   projects / events
--
-- Private still means what it meant in 083: an accepted connection sees it, as
-- do the member and platform admins. The teaser — name, photo, banner, roles,
-- country, the tick, joined — is not a section and always shows.
--
-- profile_visibility keeps its other job unchanged: it is the messaging gate
-- (can_dm) and the member-suggestions filter. Opening every section of a
-- private profile does not open the inbox.
--
-- What this enforces server-side: the profile fields get_profile_view()
-- returns, the CV, the employer card, and the standing figures. Projects,
-- events and badges are public objects with their own pages; the profile
-- surfaces stop listing them for a viewer who may not see the section.
--
-- NOT enforced: the profiles table itself, which is readable by everyone
-- (000) because profile rows are embedded across the schema — the same
-- standing gap 083 documented. This migration does not widen it.
--
-- Idempotent — safe to re-run. Apply BEFORE deploying the client: the
-- directory selects section_visibility by name and PostgREST refuses an
-- unknown column.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

-- The section keys, in page order. One definition, read by the validator, the
-- resolver and anything that needs "all of them". src/lib/profile-visibility.ts
-- PROFILE_SECTIONS must list the same keys.
CREATE OR REPLACE FUNCTION profile_section_keys()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'about', 'details', 'skills', 'interests', 'languages', 'open_to',
    'organisation', 'cv', 'standing', 'achievements', 'projects', 'events'
  ]::TEXT[];
$$;

-- An object whose keys are known sections and whose values are 'public' or
-- 'private'. Anything else is a client bug, and a typo'd key would otherwise
-- sit there looking like a setting while protecting nothing.
CREATE OR REPLACE FUNCTION section_visibility_is_valid(p_sections JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_sections) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_sections) e
        WHERE NOT (e.key = ANY(profile_section_keys()))
           OR e.value NOT IN ('"public"'::JSONB, '"private"'::JSONB)
     );
$$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS section_visibility JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_section_visibility_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_section_visibility_check
      CHECK (section_visibility_is_valid(section_visibility));
  END IF;
END $$;

COMMENT ON COLUMN profiles.section_visibility IS
  'Per-section override of profile_visibility (162): {section: public|private}. Absent = follows profile_visibility. Keys: profile_section_keys().';

-- Self-editable with no further change: the self-UPDATE policy (063) is
-- column-agnostic and guard_profile_privileged_columns() (latest 150) is a
-- denylist this column is deliberately not on.

-- ---------------------------------------------------------------------------
-- 2. The resolver
-- ---------------------------------------------------------------------------

-- Which sections a profile keeps for connections, whoever is asking. Fails
-- closed: a value that is not exactly 'public' counts as private.
CREATE OR REPLACE FUNCTION profile_private_sections(p_visibility TEXT, p_sections JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(k ORDER BY ord), '{}'::TEXT[])
    FROM unnest(profile_section_keys()) WITH ORDINALITY AS s(k, ord)
   WHERE coalesce(p_sections->>k, p_visibility, 'public') <> 'public';
$$;

-- Which sections the CURRENT viewer may not see on p_user_id's profile.
-- Same exemptions as can_view_profile() (083): the member, a platform admin
-- (moderation must work on a closed profile), an accepted connection. A
-- signed-out caller gets the public sections and nothing else — the CV link a
-- member hands out has to keep working.
CREATE OR REPLACE FUNCTION profile_hidden_sections(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer UUID := auth.uid();
  v_private TEXT[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN profile_section_keys();
  END IF;
  IF v_viewer = p_user_id THEN
    RETURN '{}'::TEXT[];
  END IF;

  SELECT profile_private_sections(p.profile_visibility, p.section_visibility)
    INTO v_private
    FROM profiles p
   WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN profile_section_keys();
  END IF;
  -- The common case, and the cheap one: nothing is private, so there is no
  -- need to look anyone up. Every directory row goes through here.
  IF v_private = '{}'::TEXT[] OR v_viewer IS NULL THEN
    RETURN v_private;
  END IF;
  IF is_platform_admin(v_viewer) THEN
    RETURN '{}'::TEXT[];
  END IF;
  IF EXISTS (
    SELECT 1 FROM connections c
     WHERE c.status = 'accepted'
       AND (
         (c.requester_id = v_viewer AND c.addressee_id = p_user_id) OR
         (c.requester_id = p_user_id AND c.addressee_id = v_viewer)
       )
  ) THEN
    RETURN '{}'::TEXT[];
  END IF;

  RETURN v_private;
END;
$$;

REVOKE ALL ON FUNCTION profile_hidden_sections(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION profile_hidden_sections(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_profile_view(): each field follows its section
-- ---------------------------------------------------------------------------
-- Restated in full from 148 (return-type changes need DROP + CREATE). Two
-- changes: the detail CASEs test the field's section instead of can_view, and
-- hidden_sections rides along at the end so the page knows which blocks to
-- leave out and which queries not to issue.
--
-- can_view keeps its 083 meaning — the master gate — because the page reads it
-- to decide whether to offer Message, and can_dm() is still that rule.
DROP FUNCTION IF EXISTS get_profile_view(UUID);
CREATE FUNCTION get_profile_view(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  roles TEXT[],
  country TEXT,
  is_verified BOOLEAN,
  created_at TIMESTAMPTZ,
  profile_visibility TEXT,
  can_view BOOLEAN,
  bio TEXT,
  skills TEXT[],
  interests TEXT[],
  open_to TEXT[],
  organization TEXT,
  industry TEXT,
  phone TEXT,
  website TEXT,
  languages TEXT[],
  is_minor BOOLEAN,
  banner JSONB,
  avatar_style JSONB,
  hidden_sections TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_hidden TEXT[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_allowed := can_view_profile(p_user_id);
  v_hidden := profile_hidden_sections(p_user_id);

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.roles,
    p.country,
    p.is_verified,
    p.created_at,
    p.profile_visibility,
    v_allowed,
    CASE WHEN NOT ('about' = ANY(v_hidden)) THEN p.bio END,
    CASE WHEN NOT ('skills' = ANY(v_hidden)) THEN p.skills END,
    CASE WHEN NOT ('interests' = ANY(v_hidden)) THEN p.interests END,
    CASE WHEN NOT ('open_to' = ANY(v_hidden)) THEN p.open_to END,
    CASE WHEN NOT ('details' = ANY(v_hidden)) THEN p.organization END,
    CASE WHEN NOT ('details' = ANY(v_hidden)) THEN p.industry END,
    CASE WHEN NOT ('details' = ANY(v_hidden)) THEN p.phone END,
    CASE WHEN NOT ('details' = ANY(v_hidden)) THEN p.website END,
    CASE WHEN NOT ('languages' = ANY(v_hidden)) THEN p.languages END,
    -- Authoritative, not the cached column: this one is read to decide whether
    -- to render a button, and a stale answer renders one that fails.
    account_is_minor(p.id),
    p.banner,
    p.avatar_style,
    v_hidden
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The CV follows the 'cv' section
-- ---------------------------------------------------------------------------
-- Restated from 083. The old clause was "public profile, or can_view_profile";
-- for a member with no overrides the new one answers the same for every caller,
-- signed out included.
CREATE OR REPLACE FUNCTION public_resume(p_user UUID, p_template TEXT DEFAULT 'viridion')
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', r.template,
    'data', r.data,
    'updated_at', r.updated_at,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )
  FROM resumes r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user
    AND r.template = p_template
    AND r.is_public = TRUE
    AND NOT is_suspended(r.user_id)
    AND NOT ('cv' = ANY(profile_hidden_sections(r.user_id)))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public_resume(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resume(UUID, TEXT) TO anon, authenticated, service_role;

-- 069's public read was never brought into line with 083, so a private
-- member's published CV could be read straight off the table while
-- public_resume() refused it. Same predicate as the function now.
DROP POLICY IF EXISTS "Public resumes are viewable by everyone" ON resumes;
CREATE POLICY "Public resumes are viewable by everyone"
  ON resumes FOR SELECT
  USING (
    is_public = TRUE
    AND NOT is_suspended(user_id)
    AND NOT ('cv' = ANY(profile_hidden_sections(user_id)))
  );

-- ---------------------------------------------------------------------------
-- 5. The employer card follows 'organisation'
-- ---------------------------------------------------------------------------
-- Restated from 081. The employer is a public entity with its own page; what
-- the section hides is that THIS member belongs to it.
CREATE OR REPLACE FUNCTION public_employer_for_user(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  legal_name TEXT,
  trading_name TEXT,
  industry TEXT,
  website_url TEXT,
  logo_url TEXT,
  description TEXT,
  country_code CHAR(2),
  locality TEXT,
  verification_status TEXT,
  verified_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.legal_name, e.trading_name, e.industry, e.website_url,
         e.logo_url, e.description, e.country_code, e.locality,
         e.verification_status, e.verified_at, e.created_by, e.created_at
  FROM employers e
  WHERE (
      e.created_by = p_user_id
      OR EXISTS (
        SELECT 1 FROM employer_members m
        WHERE m.employer_id = e.id AND m.user_id = p_user_id
      )
    )
    AND (e.verification_status = 'verified' OR can_manage_employer(e.id, auth.uid()))
    AND NOT ('organisation' = ANY(profile_hidden_sections(p_user_id)))
  ORDER BY e.created_at
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_employer_for_user(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Standing and the showcase
-- ---------------------------------------------------------------------------
-- Restated from 066. 'standing' hides points and rank; 'achievements' hides the
-- pinned showcase. badge_count is in both — the meter prints it and the shelf
-- counts with it — so it goes only when both sections do, and then the whole
-- answer is NULL, exactly what a suspended account already returns.
CREATE OR REPLACE FUNCTION get_profile_stats(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INT;
  v_count INT;
  v_suspended BOOLEAN;
  v_hidden TEXT[];
  v_standing BOOLEAN;
  v_achievements BOOLEAN;
BEGIN
  SELECT COALESCE(is_suspended, FALSE) INTO v_suspended FROM profiles WHERE id = p_user;
  IF v_suspended IS NULL OR v_suspended THEN
    RETURN NULL;
  END IF;

  v_hidden := profile_hidden_sections(p_user);
  v_standing := NOT ('standing' = ANY(v_hidden));
  v_achievements := NOT ('achievements' = ANY(v_hidden));
  IF NOT v_standing AND NOT v_achievements THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(b.points), 0), COUNT(*)
  INTO v_points, v_count
  FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
  WHERE ub.user_id = p_user;

  RETURN jsonb_build_object(
    'user_id', p_user,
    'points', CASE WHEN v_standing THEN v_points END,
    'badge_count', v_count,
    'rank', CASE WHEN v_standing THEN member_rank(v_count) END,
    -- Streak is shown on your own profile only; on someone else's it
    -- reads as surveillance rather than achievement.
    'streak_days', CASE WHEN auth.uid() = p_user THEN current_streak(p_user) ELSE NULL END,
    'showcase', CASE WHEN v_achievements THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'position', us.position,
        'badge', to_jsonb(b)
      ) ORDER BY us.position), '[]'::JSONB)
      FROM user_showcase us JOIN badges b ON b.id = us.badge_id
      WHERE us.user_id = p_user
    ) ELSE '[]'::JSONB END
  );
END;
$$;

-- The directory's card figures. A member whose standing the caller may not see
-- has no row, which the card already treats as "nothing to show".
CREATE OR REPLACE FUNCTION get_profile_stats_batch(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, points BIGINT, badge_count BIGINT, level INT, rank_name TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(SUM(b.points), 0),
    COUNT(b.id),
    (member_rank(COUNT(b.id)::INT)->>'level')::INT,
    member_rank(COUNT(b.id)::INT)->>'name'
  FROM profiles p
  LEFT JOIN user_badges ub ON ub.user_id = p.id
  LEFT JOIN badges b ON b.id = ub.badge_id
  WHERE p.id = ANY(p_user_ids[1:200])
    AND COALESCE(p.is_suspended, FALSE) = FALSE
    AND NOT ('standing' = ANY(profile_hidden_sections(p.id)))
  GROUP BY p.id;
$$;

GRANT EXECUTE ON FUNCTION get_profile_stats(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profile_stats_batch(UUID[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Member suggestions stop quoting private sections
-- ---------------------------------------------------------------------------
-- Restated from 156. The pool still takes public profiles only and never
-- anyone already connected, so for every candidate "can the caller see this
-- section" is just "is it public". A private section neither scores nor
-- appears as a reason chip — "you both know GIS" would print a skill the
-- member chose to keep for connections — and organization and industry come
-- back NULL when 'details' is private.
CREATE OR REPLACE FUNCTION suggest_members(p_limit INT DEFAULT 6, p_role TEXT DEFAULT NULL)
RETURNS TABLE (
  id           UUID,
  username     TEXT,
  display_name TEXT,
  avatar_url   TEXT,
  country      TEXT,
  organization TEXT,
  industry     TEXT,
  roles        TEXT[],
  is_verified  BOOLEAN,
  score        NUMERIC,
  reasons      JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      profiles%ROWTYPE;
  v_limit   INT := least(greatest(coalesce(p_limit, 6), 1), 24);
  v_my_int  TEXT[];
  v_my_skl  TEXT[];
  v_my_roles TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_me FROM profiles WHERE profiles.id = auth.uid();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_my_int := ARRAY(SELECT DISTINCT normalize_topic(x) FROM unnest(coalesce(v_me.interests, ARRAY[]::TEXT[])) x
                     WHERE normalize_topic(x) IS NOT NULL);
  v_my_skl := ARRAY(SELECT DISTINCT normalize_topic(x) FROM unnest(coalesce(v_me.skills, ARRAY[]::TEXT[])) x
                     WHERE normalize_topic(x) IS NOT NULL);
  v_my_roles := coalesce(v_me.roles, ARRAY[]::TEXT[]);

  RETURN QUERY
  WITH pool AS (
    SELECT p.*,
           profile_private_sections(p.profile_visibility, p.section_visibility) AS private_sections
      FROM profiles p
     WHERE p.id <> v_me.id
       AND coalesce(p.profile_visibility, 'public') = 'public'
       AND coalesce(p.account_status, 'active') = 'active'
       AND NOT coalesce(p.is_suspended, FALSE)
       AND NOT ('student' = ANY(coalesce(p.roles, ARRAY[]::TEXT[])))
       AND (p_role IS NULL OR p_role = ANY(coalesce(p.roles, ARRAY[]::TEXT[])))
       AND NOT EXISTS (
             SELECT 1 FROM connections c
              WHERE (c.requester_id = v_me.id AND c.addressee_id = p.id)
                 OR (c.requester_id = p.id AND c.addressee_id = v_me.id))
  ),
  visible AS (
    SELECT p.id, p.username, p.display_name, p.avatar_url, p.country, p.roles, p.is_verified,
           CASE WHEN 'details'   = ANY(p.private_sections) THEN NULL ELSE p.organization END AS organization,
           CASE WHEN 'details'   = ANY(p.private_sections) THEN NULL ELSE p.industry END     AS industry,
           CASE WHEN 'interests' = ANY(p.private_sections) THEN NULL ELSE p.interests END    AS interests,
           CASE WHEN 'skills'    = ANY(p.private_sections) THEN NULL ELSE p.skills END       AS skills,
           CASE WHEN 'open_to'   = ANY(p.private_sections) THEN NULL ELSE p.open_to END      AS open_to
      FROM pool p
  ),
  scored AS (
    SELECT p.id, p.username, p.display_name, p.avatar_url, p.country, p.organization,
           p.industry, p.roles, p.is_verified,
           (SELECT ARRAY(SELECT DISTINCT normalize_topic(x)
                           FROM unnest(coalesce(p.interests, ARRAY[]::TEXT[])) x
                          WHERE normalize_topic(x) = ANY(v_my_int))) AS shared_int,
           (SELECT ARRAY(SELECT DISTINCT normalize_topic(x)
                           FROM unnest(coalesce(p.skills, ARRAY[]::TEXT[])) x
                          WHERE normalize_topic(x) = ANY(v_my_skl))) AS shared_skl,
           (p.country IS NOT NULL AND p.country = v_me.country) AS same_country,
           (p.industry IS NOT NULL AND p.industry = v_me.industry) AS same_industry,
           -- They want funding and I hold a funder role, or we both want co-founders.
           ((coalesce(p.open_to, ARRAY[]::TEXT[]) @> ARRAY['funding']
               AND v_my_roles && ARRAY['investor','ngo','government','igo','diaspora','private_sector'])
            OR (coalesce(p.open_to, ARRAY[]::TEXT[]) @> ARRAY['co_founders']
               AND coalesce(v_me.open_to, ARRAY[]::TEXT[]) @> ARRAY['co_founders'])) AS complementary
      FROM visible p
  ),
  weighted AS (
    SELECT s.*,
           6 * least(coalesce(array_length(s.shared_int, 1), 0), 3)
         + 4 * least(coalesce(array_length(s.shared_skl, 1), 0), 3)
         + CASE WHEN s.same_country  THEN 5 ELSE 0 END
         + CASE WHEN s.same_industry THEN 5 ELSE 0 END
         + CASE WHEN s.complementary THEN 3 ELSE 0 END AS total
      FROM scored s
  )
  SELECT w.id, w.username, w.display_name, w.avatar_url, w.country, w.organization,
         w.industry, w.roles, w.is_verified, w.total::NUMERIC AS score,
         (
           SELECT coalesce(jsonb_agg(r ORDER BY (r->>'w')::INT DESC), '[]'::JSONB)
             FROM (
               SELECT jsonb_build_object('code', 'shared_interests',
                        'w', 6 * least(coalesce(array_length(w.shared_int, 1), 0), 3),
                        'params', jsonb_build_object('topics', to_jsonb(w.shared_int[1:3]))) AS r
                WHERE coalesce(array_length(w.shared_int, 1), 0) > 0
               UNION ALL
               SELECT jsonb_build_object('code', 'shared_skills',
                        'w', 4 * least(coalesce(array_length(w.shared_skl, 1), 0), 3),
                        'params', jsonb_build_object('topics', to_jsonb(w.shared_skl[1:3])))
                WHERE coalesce(array_length(w.shared_skl, 1), 0) > 0
               UNION ALL
               SELECT jsonb_build_object('code', 'same_country', 'w', 5,
                        'params', jsonb_build_object('country', w.country))
                WHERE w.same_country
               UNION ALL
               SELECT jsonb_build_object('code', 'same_industry', 'w', 5,
                        'params', jsonb_build_object('industry', w.industry))
                WHERE w.same_industry
               UNION ALL
               SELECT jsonb_build_object('code', 'complementary', 'w', 3, 'params', '{}'::JSONB)
                WHERE w.complementary
             ) x
         ) AS reasons
    FROM weighted w
   WHERE w.total > 0
   ORDER BY w.total DESC, w.is_verified DESC, w.display_name, w.id
   LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION suggest_members(INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION suggest_members(INT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
