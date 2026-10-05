-- ============================================================================
-- 169_profile_look_tagline_links.sql — the editorial member page's own fields
-- ============================================================================
-- The member page was redesigned around one line under the name, a row of
-- links, and a look the member picks. Three columns hold them:
--
--   tagline       TEXT   one line under the name. A sentence the member
--                        writes, so it follows the 'about' section like bio.
--   social_links  JSONB  { linkedin?, x?, instagram?, facebook?, github? },
--                        each a full https URL. Contact-ish, so it follows
--                        'details' like website and phone.
--   profile_look  JSONB  { photo, tone, accent, align }. Presentation only,
--                        so it is a teaser field like avatar_style and banner:
--                        a private member's page still wears their look.
--
-- Reads, given 167/168 (the column-privilege model):
--   * profile_look is granted to anon + authenticated like the other teaser
--     columns, so cards and the drawer can read it off the table.
--   * tagline and social_links are NOT granted. Other members read them
--     through get_profile_view(), which nulls them per section; the owner
--     reads their own row through get_my_profile() (SELECT *), which picks
--     them up with no change.
-- The grant is harmless if 168 has not been applied yet (the table-wide grant
-- still stands) and required once it has. 168 revokes a named list of
-- sensitive columns, so this grant survives in either order.
--
-- get_profile_view() is restated in full from 162 (a return-type change needs
-- DROP + CREATE) with the three columns appended at the end. Nothing else in
-- its body changed.
--
-- Validation of profile_look's inner shape is client-side (parseProfileLook in
-- src/lib/profile-look.ts), the same as avatar_style (148) and banner (104):
-- a malformed value degrades to the default look, never to a broken page.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_look JSONB;

-- A link is a full https URL of sensible length, under a key the page knows
-- how to label. Anything else is refused at write time rather than rendered
-- as a link to somewhere unexpected.
CREATE OR REPLACE FUNCTION profile_social_links_valid(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_each(p) AS e(k, v)
        WHERE e.k NOT IN ('linkedin', 'x', 'instagram', 'facebook', 'github')
           OR jsonb_typeof(e.v) <> 'string'
           OR char_length(e.v #>> '{}') > 300
           OR (e.v #>> '{}') !~ '^https://'
     );
$$;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tagline_length;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_tagline_length CHECK (tagline IS NULL OR char_length(tagline) <= 120);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_social_links_valid;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_social_links_valid CHECK (profile_social_links_valid(social_links));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_profile_look_object;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_profile_look_object
  CHECK (profile_look IS NULL OR jsonb_typeof(profile_look) = 'object');

-- The teaser column is readable like avatar_style and banner (see header).
GRANT SELECT (profile_look) ON profiles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_profile_view(): the new fields, each following its section
-- ---------------------------------------------------------------------------
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
  hidden_sections TEXT[],
  tagline TEXT,
  social_links JSONB,
  profile_look JSONB
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
    v_hidden,
    CASE WHEN NOT ('about' = ANY(v_hidden)) THEN p.tagline END,
    CASE WHEN NOT ('details' = ANY(v_hidden)) THEN p.social_links END,
    p.profile_look
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;
