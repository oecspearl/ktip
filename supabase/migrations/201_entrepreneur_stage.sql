-- 201: Entrepreneur stage
--
-- OECS asked for entrepreneurs to say where they are on the business journey
-- when they sign up, so programme staff can find and count them by stage:
--
--   aspiring      Aspiring Entrepreneur: developing an idea, no business yet
--   startup       Start-up: a new or emerging business
--   export_ready  Export-Ready: ready for regional or international markets,
--                 not yet exporting
--   exporter      Exporter: actively selling outside its home country
--
-- The labels and definitions live in the client (src/lib/constants.ts,
-- ENTREPRENEUR_STAGES); the database only knows the four values.
--
-- What this file does:
--   1. profiles.entrepreneur_stage, a text column with an inline CHECK. No
--      function in the CHECK: 162 did that and every signup failed until 173
--      pinned the helper's search_path, because the signup insert runs as
--      supabase_auth_admin with search_path = auth.
--   2. A trigger that clears the stage when the member is not an entrepreneur,
--      so a stage never outlives the role it describes.
--   3. handle_new_user() restated in full from 118, plus the stage from the
--      signup metadata.
--   4. The read surfaces: a column grant (public, like roles), member_profiles,
--      get_profile_view() and admin_member_rows().
--   5. get_entrepreneurs_by_stage() for the analytics hub.
--
-- Members set and change their own stage with a plain profiles UPDATE, like
-- organization and industry: 168 left UPDATE privileges alone, and neither
-- guard trigger looks at this column.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS entrepreneur_stage TEXT;

COMMENT ON COLUMN profiles.entrepreneur_stage IS
  'Where an entrepreneur is on the business journey (201): aspiring, startup, export_ready or exporter. NULL for everyone without the entrepreneur role, and for entrepreneurs who have not said.';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_entrepreneur_stage_valid;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_entrepreneur_stage_valid
  CHECK (entrepreneur_stage IS NULL
         OR entrepreneur_stage IN ('aspiring', 'startup', 'export_ready', 'exporter'));

-- The analytics count and the admin filter both narrow on this column.
CREATE INDEX IF NOT EXISTS idx_profiles_entrepreneur_stage
  ON profiles (entrepreneur_stage)
  WHERE entrepreneur_stage IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. The stage follows the role
-- ---------------------------------------------------------------------------
-- Triggers of the same timing fire in name order. This one is named to run
-- after guard_profile_insert_roles_trigger and
-- guard_profile_privileged_columns_trigger, so it tests the role list those
-- guards have already filtered, not the one the client sent.
CREATE OR REPLACE FUNCTION sync_profile_entrepreneur_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.entrepreneur_stage IS NOT NULL
     AND NOT ('entrepreneur' = ANY(coalesce(NEW.roles, ARRAY[]::TEXT[]))) THEN
    NEW.entrepreneur_stage := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_entrepreneur_stage_trigger ON profiles;
CREATE TRIGGER sync_profile_entrepreneur_stage_trigger
  BEFORE INSERT OR UPDATE OF roles, entrepreneur_stage ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_entrepreneur_stage();

-- ---------------------------------------------------------------------------
-- 3. Seeding from signup metadata
-- ---------------------------------------------------------------------------
-- Restated in full from 118, for the CREATE OR REPLACE reason 091 and 115 give:
-- the body is swapped whole, so restating an older text would drop what later
-- files added.
--
-- The one addition is entrepreneur_stage. Like every other metadata field it
-- is unvalidated client input, so anything but one of the four values becomes
-- NULL rather than an exception that would leave an auth user with no profile.
-- The CHECK would reject a bad value anyway; this keeps the reject from
-- costing somebody their account. Whether the stage survives is then up to
-- sync_profile_entrepreneur_stage(), which sees the role list after
-- guard_profile_insert_roles() has stripped it.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_dob DATE;
  v_consent_keys TEXT[];
  v_consent_locale TEXT;
  v_stage TEXT;
BEGIN
  -- Signup metadata is unvalidated user input (see 063), and a malformed date
  -- here would abort the whole INSERT and leave an auth user with no profile.
  -- A bad value is therefore treated exactly like an absent one: the account
  -- gets sent to onboarding to declare properly.
  BEGIN
    v_dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;

  IF v_dob IS NOT NULL AND (v_dob > CURRENT_DATE
                            OR v_dob <= DATE '1900-01-01'
                            OR v_dob > (CURRENT_DATE - INTERVAL '13 years')) THEN
    v_dob := NULL;
  END IF;

  -- Same treatment for the consent list: malformed metadata is treated as
  -- absent, which leaves requires_consent TRUE and routes the account to
  -- onboarding to be asked properly. Never an exception — an unparseable array
  -- must not cost somebody their account.
  BEGIN
    SELECT array_agg(x) INTO v_consent_keys
    FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'legal_consent') AS x;
  EXCEPTION WHEN OTHERS THEN
    v_consent_keys := NULL;
  END;

  v_consent_locale := COALESCE(NULLIF(NEW.raw_user_meta_data->>'legal_consent_locale', ''), 'en');
  IF v_consent_locale NOT IN ('en', 'fr', 'es', 'pseudo') THEN
    v_consent_locale := 'en';
  END IF;

  -- 201: the entrepreneur stage, NULL unless it is one of the four values.
  v_stage := NULLIF(NEW.raw_user_meta_data->>'entrepreneur_stage', '');
  IF v_stage IS NOT NULL
     AND v_stage NOT IN ('aspiring', 'startup', 'export_ready', 'exporter') THEN
    v_stage := NULL;
  END IF;

  INSERT INTO public.profiles (
    id, display_name, avatar_url, roles, bio, country, organization, industry,
    skills, interests, open_to, phone, website, languages,
    is_minor, requires_age_declaration, age_declared_at,
    requires_mfa_enrollment, mfa_enrolled_at, mfa_grandfathered,
    entrepreneur_stage
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.email
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
      THEN ARRAY[NEW.raw_user_meta_data->>'role']
      ELSE ARRAY[]::TEXT[]
    END,
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'organization',
    NEW.raw_user_meta_data->>'industry',
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'skills') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'interests') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'open_to') AS x),
      ARRAY[]::TEXT[]
    ),
    -- 'phone_number' first: that is the OIDC claim name the Virtual Campus
    -- callback forwards, and api/auth/vc/callback.ts sets it verbatim.
    COALESCE(
      NEW.raw_user_meta_data->>'phone_number',
      NEW.raw_user_meta_data->>'phone'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'website',
      NEW.raw_user_meta_data->>'profile_url'
    ),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'languages') AS x),
      ARRAY[]::TEXT[]
    ),
    COALESCE(v_dob > (CURRENT_DATE - INTERVAL '18 years'), FALSE),
    v_dob IS NULL,
    CASE WHEN v_dob IS NOT NULL THEN now() END,
    FALSE,
    NULL,
    FALSE,
    v_stage
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_dob IS NOT NULL THEN
    INSERT INTO public.account_age (user_id, date_of_birth, source)
    VALUES (NEW.id, v_dob, 'signup')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- The version comes from the register, never from the metadata, for the same
  -- reason record_consent() refuses a client-supplied one.
  IF v_consent_keys IS NOT NULL AND array_length(v_consent_keys, 1) > 0 THEN
    INSERT INTO public.user_consents (user_id, document_key, version, locale, context)
    SELECT NEW.id, d.key, d.version, v_consent_locale, 'signup'
    FROM public.legal_documents d
    WHERE d.is_current
      AND d.bundle = 'account'
      AND d.key = ANY(v_consent_keys)
    ON CONFLICT (user_id, document_key, version) DO NOTHING;
  END IF;

  PERFORM public.refresh_consent_state(NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Read surfaces
-- ---------------------------------------------------------------------------
-- Public, like roles: the stage is shown next to the Entrepreneur role on the
-- member's page and card, and the directory filters on it.
GRANT SELECT (entrepreneur_stage) ON profiles TO anon, authenticated;

-- member_profiles, restated from 167 with the stage appended. CREATE OR
-- REPLACE VIEW can only add columns at the end, so it goes last.
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
  h.hidden AS hidden_sections,
  p.entrepreneur_stage
FROM profiles p
CROSS JOIN LATERAL (SELECT profile_hidden_sections(p.id) AS hidden OFFSET 0) h;

REVOKE ALL ON member_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON member_profiles TO anon, authenticated;

-- get_profile_view(), restated from 169 with the stage appended. A return-type
-- change needs DROP + CREATE.
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
  profile_look JSONB,
  entrepreneur_stage TEXT
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
    p.profile_look,
    -- Not section-gated: it travels with roles, which are public.
    p.entrepreneur_stage
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

-- admin_member_rows(), restated from 167 with a stage filter and column. The
-- new parameter changes the signature, so the old one is dropped rather than
-- left behind as an overload.
DROP FUNCTION IF EXISTS admin_member_rows(TEXT, TEXT, BOOLEAN);
CREATE FUNCTION admin_member_rows(
  p_search TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_verified BOOLEAN DEFAULT NULL,
  p_stage TEXT DEFAULT NULL
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
  created_at TIMESTAMPTZ,
  entrepreneur_stage TEXT
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
  -- p_stage = 'not_set' finds the entrepreneurs who have not said yet.
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.country, p.roles,
         p.is_verified, p.is_suspended, p.suspended_until, p.suspension_reason,
         p.account_status, p.created_at, p.entrepreneur_stage
    FROM profiles p
   WHERE (p_search IS NULL OR p.display_name ILIKE '%' || p_search || '%')
     AND (p_role IS NULL OR p_role = ANY(coalesce(p.roles, ARRAY[]::TEXT[])))
     AND (p_verified IS NULL OR coalesce(p.is_verified, FALSE) = p_verified)
     AND (p_stage IS NULL
          OR (p_stage = 'not_set'
              AND p.entrepreneur_stage IS NULL
              AND 'entrepreneur' = ANY(coalesce(p.roles, ARRAY[]::TEXT[])))
          OR p.entrepreneur_stage = p_stage)
   ORDER BY p.created_at DESC NULLS LAST, p.id
   LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION admin_member_rows(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_member_rows(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Analytics: entrepreneurs by stage
-- ---------------------------------------------------------------------------
-- Every stage is a row, at zero if need be, plus not_set for entrepreneurs who
-- have not said. A chart that drops the empty stages hides the reading that
-- matters ("no exporters in Dominica yet"). p_country follows the analytics
-- hub's country scope; NULL means every country.
CREATE OR REPLACE FUNCTION get_entrepreneurs_by_stage(p_country TEXT DEFAULT NULL)
RETURNS TABLE(stage TEXT, count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT has_permission(auth.uid(), 'org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.stage, COUNT(p.id)
    FROM (VALUES (1, 'aspiring'), (2, 'startup'), (3, 'export_ready'),
                 (4, 'exporter'), (5, 'not_set')) s(ord, stage)
    LEFT JOIN profiles p
      ON 'entrepreneur' = ANY(coalesce(p.roles, ARRAY[]::TEXT[]))
     AND coalesce(p.entrepreneur_stage, 'not_set') = s.stage
     AND (p_country IS NULL OR p.country = p_country)
    GROUP BY s.ord, s.stage
    ORDER BY s.ord;
END; $fn$;

REVOKE ALL ON FUNCTION get_entrepreneurs_by_stage(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_entrepreneurs_by_stage(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification (run by hand after applying)
-- ---------------------------------------------------------------------------
-- A bad value is refused by the CHECK:
--   UPDATE profiles SET entrepreneur_stage = 'tycoon' WHERE id = '<entrepreneur>';
--   -- ERROR: violates check constraint "profiles_entrepreneur_stage_valid"
--
-- The stage follows the role:
--   UPDATE profiles SET entrepreneur_stage = 'startup' WHERE id = '<student>';
--   SELECT entrepreneur_stage FROM profiles WHERE id = '<student>';  -- NULL
--
-- Signup still works for every role (the 173 regression): sign up one
-- entrepreneur with a stage and one student with none, then
--   SELECT roles, entrepreneur_stage FROM profiles ORDER BY created_at DESC LIMIT 2;
--
-- The analytics count always has five rows:
--   SELECT * FROM get_entrepreneurs_by_stage();
