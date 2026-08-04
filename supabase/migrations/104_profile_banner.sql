-- ===========================================================================
-- 104: Profile banner
-- ===========================================================================
-- Members can set a banner for their public surfaces: the member page hero,
-- their directory card, the member drawer cover and their own dashboard hero.
--
-- One JSONB column rather than a bare URL because a banner is not always an
-- image: it is one of three shapes, discriminated by `kind` —
--   { "kind": "image",    "url": "...", "pos": { "card": {"x":50,"y":40}, ... } }
--   { "kind": "preset",   "id": "banner-03", "pos": { ... } }
--   { "kind": "gradient", "colors": ["#...", "#..."], "seed": 7 }
-- `pos` is per-surface object-position percentages (drag-positioned in the
-- Banner Studio). The client is the source of truth for the shape; the column
-- stores it verbatim. See src/lib/banner.ts.
--
-- No RLS or trigger work: the self-UPDATE policy on profiles is
-- column-agnostic, and guard_profile_privileged_columns() (063) guards a named
-- denylist this column is deliberately not on — same reasoning as 082.
-- ===========================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner JSONB;

COMMENT ON COLUMN profiles.banner IS
  'Profile banner spec (kind: image|preset|gradient) — see src/lib/banner.ts. NULL = seeded stock art.';

-- ---------------------------------------------------------------------------
-- get_profile_view(): banner rides along as a TEASER field, beside avatar_url.
-- A private member''s card and drawer still show their name, photo and cover —
-- the banner is part of that face, not part of the gated detail.
--
-- Restated in full from 091 (return-type changes need DROP + CREATE); the only
-- change is the trailing banner column.
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
  banner JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_allowed := can_view_profile(p_user_id);

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
    CASE WHEN v_allowed THEN p.bio END,
    CASE WHEN v_allowed THEN p.skills END,
    CASE WHEN v_allowed THEN p.interests END,
    CASE WHEN v_allowed THEN p.open_to END,
    CASE WHEN v_allowed THEN p.organization END,
    CASE WHEN v_allowed THEN p.industry END,
    CASE WHEN v_allowed THEN p.phone END,
    CASE WHEN v_allowed THEN p.website END,
    CASE WHEN v_allowed THEN p.languages END,
    -- Authoritative, not the cached column: this one is read to decide whether
    -- to render a button, and a stale answer renders one that fails.
    account_is_minor(p.id),
    p.banner
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
