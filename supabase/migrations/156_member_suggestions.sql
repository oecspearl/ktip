-- ============================================================================
-- 156_member_suggestions.sql — "members like you" and mentor suggestions
-- ============================================================================
-- The directory was alphabetical and the connections tab listed only what the
-- member already had. Nothing on the platform ever said "here is someone you
-- should meet", although profiles carry interests, skills, country, industry
-- and open_to — collected at signup, displayed on a panel, used for nothing.
--
-- suggest_members(p_limit, p_role) scores every other visible member against
-- the caller and returns the top few with reasons, in the same {code, w,
-- params} shape the content ranker (154) uses so one chip component renders
-- both.
--
--   interest   6 per shared normalized interest (cap 3)
--   skill      4 per shared normalized skill    (cap 3)
--   country    5 same country (exact name match, both free text)
--   industry   5 same industry
--   open_to    3 a complementary ask: they seek funding and you may post it,
--                or you both seek co-founders
--
-- Excluded: the caller, anyone already connected or with a pending request in
-- either direction, private profiles (083), deactivated accounts (140),
-- suspended accounts, and students — a student is never surfaced as a
-- suggestion to anyone, the same safeguarding line the leaderboard draws.
--
-- p_role narrows the pool to one role slug ('mentor' for mentor matching).
--
-- SECURITY DEFINER because it reads across profiles; the caller is auth.uid()
-- and nothing about the OTHER member is returned beyond what the public
-- directory card already shows. Requires 033 (connections), 083, 140.
-- Idempotent — safe to re-run.

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
    SELECT p.*
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
      FROM pool p
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
