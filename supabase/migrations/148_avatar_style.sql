-- ===========================================================================
-- 148: Avatar style (portrait cut-out)
-- ===========================================================================
-- Members can have the background cut out of their photo, in their own
-- browser, and dropped onto a backdrop. What every avatar on the platform reads
-- is still the single `avatar_url` image — the composite is baked at upload —
-- so no other query changes. This column records HOW that image was made, so
-- the studio can re-composite or revert without a re-upload, and so the member
-- page hero can draw the transparent cut-out large over its own aurora.
--
-- One JSONB spec, one of three shapes, discriminated by `kind`:
--   { "kind": "photo" }                                     the plain upload
--   { "kind": "backdrop", "id": "banner-03", "cutout": "https://…/avatar-cutout.webp",
--     "side": "right", "frame": {"x":0.2,"y":0.05,"s":0.6}, "animated": true }
--   { "kind": "gradient", "colors": ["#…","#…"], "seed": 7, "cutout": "…",
--     "side": "center", "frame": {…} }
-- `side` is where the head sits in the photo (left|center|right); the hero
-- puts the name on the other side. `frame` is the head-centred square crop
-- used for the diamond. The client owns the shape; see
-- src/lib/avatar-backdrop.ts, which degrades anything malformed to "photo".
--
-- No RLS or trigger work, for the same reason as 104: the self-UPDATE policy
-- on profiles is column-agnostic and guard_profile_privileged_columns() (063)
-- guards a denylist this column is deliberately not on.
-- ===========================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_style JSONB;

COMMENT ON COLUMN profiles.avatar_style IS
  'How avatar_url was made (kind: photo|backdrop|gradient, cutout URL, subject side, head frame) — see src/lib/avatar-backdrop.ts. NULL = plain photo.';

-- ---------------------------------------------------------------------------
-- get_profile_view(): avatar_style rides along as a TEASER field beside
-- avatar_url and banner. It describes the face the member already shows to
-- everyone; a private member's page draws the same cut-out their directory
-- card already implies. Restated in full from 104 (return-type changes need
-- DROP + CREATE); the only change is the trailing column.
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
  avatar_style JSONB
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
    p.banner,
    p.avatar_style
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
