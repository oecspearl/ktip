-- ============================================================================
-- 167_member_profiles_read_surface.sql — read paths that respect sections
-- ============================================================================
-- First half of closing the profiles-table gap that 083 and 162 documented:
-- every column of every profile is readable with the anon key, closed
-- sections and operational columns (suspension_reason, mfa_method, is_minor,
-- purge_after, ...) alike. 168 revokes that. This migration adds the read
-- paths the client moves to first, so nothing breaks when it does:
--
--   get_my_profile()     the member's own row, every column
--   member_profiles      other members: teaser columns, each section field
--                        NULL when the caller may not see that section
--   admin_member_rows()  the admin users list, which shows suspension details
--
-- and gates the two achievement tables on the 'achievements' section, which
-- 162 enforced on the profile page only.
--
-- member_profiles is a security-definer view on purpose (security_invoker is
-- off): after 168 the caller cannot read bio or skills off the table, and the
-- view is what reads them, then hands back only what profile_hidden_sections()
-- allows. Supabase's linter flags this; it is the point of the view.
--
-- Known limit: with achievements public and standing private, a visitor can
-- still add up badge points by hand. Showing the badges at all allows that.
--
-- Idempotent — safe to re-run. Purely additive: nothing loses access here.
-- Apply BEFORE deploying the client that reads these, and the client BEFORE
-- 168.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The member's own row
-- ---------------------------------------------------------------------------
-- Every column, for the member only. AuthContext, the data export and the CV
-- generator read the whole row; after 168 they can only do it through here.
-- `SELECT *` in a SQL-language body is expanded at each call, so a column
-- added to profiles later comes through without restating this.
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS SETOF profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Other members, section by section
-- ---------------------------------------------------------------------------
-- The same rule get_profile_view() applies (162), as a view so the directory,
-- search and pickers can keep filtering and ordering through PostgREST. A
-- filter on skills or bio matches only what this caller may see, so a
-- connection finds a member by a skill kept for connections and a stranger
-- does not.
--
-- badge_slugs exists for the directory's badge filter; the cards' badges come
-- from user_badges, which section 4 gates the same way.
--
-- OFFSET 0 keeps the lateral subquery from being flattened, which would
-- repeat profile_hidden_sections() once per CASE instead of once per row.
CREATE OR REPLACE VIEW member_profiles
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.avatar_style,
  p.banner,
  p.country,
  p.roles,
  p.active_role,
  p.is_verified,
  p.verified_at,
  p.created_at,
  p.updated_at,
  p.profile_visibility,
  p.section_visibility,
  p.is_suspended,
  p.account_status,
  CASE WHEN 'about'     = ANY(h.hidden) THEN NULL ELSE p.bio          END AS bio,
  CASE WHEN 'details'   = ANY(h.hidden) THEN NULL ELSE p.organization END AS organization,
  CASE WHEN 'details'   = ANY(h.hidden) THEN NULL ELSE p.industry     END AS industry,
  CASE WHEN 'details'   = ANY(h.hidden) THEN NULL ELSE p.phone        END AS phone,
  CASE WHEN 'details'   = ANY(h.hidden) THEN NULL ELSE p.website      END AS website,
  CASE WHEN 'skills'    = ANY(h.hidden) THEN NULL ELSE p.skills       END AS skills,
  CASE WHEN 'interests' = ANY(h.hidden) THEN NULL ELSE p.interests    END AS interests,
  CASE WHEN 'languages' = ANY(h.hidden) THEN NULL ELSE p.languages    END AS languages,
  CASE WHEN 'open_to'   = ANY(h.hidden) THEN NULL ELSE p.open_to      END AS open_to,
  CASE WHEN 'achievements' = ANY(h.hidden) THEN NULL ELSE ARRAY(
    SELECT b.slug
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = p.id
  ) END AS badge_slugs,
  h.hidden AS hidden_sections
FROM profiles p
CROSS JOIN LATERAL (SELECT profile_hidden_sections(p.id) AS hidden OFFSET 0) h;

COMMENT ON VIEW member_profiles IS
  'Other members as the caller may see them (167): teaser columns, each section field NULL when profile_hidden_sections() lists its section. Security-definer by design; read-only.';

-- Supabase's default privileges hand new relations ALL; this one is read-only.
REVOKE ALL ON member_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON member_profiles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The admin users list
-- ---------------------------------------------------------------------------
-- The one screen that shows another member's operational columns. Gated on
-- the key the page itself requires (AdminLayout: members:view), and refused
-- outright otherwise rather than returning an empty list that reads as "no
-- members".
CREATE OR REPLACE FUNCTION admin_member_rows(
  p_search TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_verified BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  country TEXT,
  roles TEXT[],
  is_verified BOOLEAN,
  is_suspended BOOLEAN,
  suspended_until TIMESTAMPTZ,
  suspension_reason TEXT,
  account_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT has_permission(auth.uid(), 'members:view') THEN
    RAISE EXCEPTION 'members:view required' USING ERRCODE = '42501';
  END IF;

  -- p_search arrives already escaped for ILIKE (escapeIlike on the client),
  -- exactly as the .ilike() filter it replaces received it.
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.country, p.roles,
         p.is_verified, p.is_suspended, p.suspended_until, p.suspension_reason,
         p.account_status, p.created_at
    FROM profiles p
   WHERE (p_search IS NULL OR p.display_name ILIKE '%' || p_search || '%')
     AND (p_role IS NULL OR p_role = ANY(coalesce(p.roles, ARRAY[]::TEXT[])))
     AND (p_verified IS NULL OR coalesce(p.is_verified, FALSE) = p_verified)
   ORDER BY p.created_at DESC NULLS LAST, p.id
   LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION admin_member_rows(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_member_rows(TEXT, TEXT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Badges and the showcase follow 'achievements'
-- ---------------------------------------------------------------------------
-- Were USING (true) (066). profile_hidden_sections() returns '{}' for the
-- member, an admin and a connection, so those three keep every row; the
-- definer functions that count or rank badges are unaffected.
DROP POLICY IF EXISTS "User badges are viewable by everyone" ON user_badges;
DROP POLICY IF EXISTS "User badges follow the achievements section" ON user_badges;
CREATE POLICY "User badges follow the achievements section"
  ON user_badges FOR SELECT
  USING (NOT ('achievements' = ANY(profile_hidden_sections(user_id))));

DROP POLICY IF EXISTS "Showcase is viewable by everyone" ON user_showcase;
DROP POLICY IF EXISTS "Showcase follows the achievements section" ON user_showcase;
CREATE POLICY "Showcase follows the achievements section"
  ON user_showcase FOR SELECT
  USING (NOT ('achievements' = ANY(profile_hidden_sections(user_id))));

NOTIFY pgrst, 'reload schema';
