-- ============================================================================
-- 082_profile_contact_fields.sql — phone, website and languages on profiles
-- ============================================================================
-- The CV document (src/types/resume.ts) has always had `profile.phone`,
-- `profile.socials` and `languages`, and `profiles` has never had a column for
-- any of them. So the only ways to fill those three were a Virtual Campus claim
-- or typing them into /cv/edit — which meant a member who signed up by email had
-- a CV with no phone number and no languages on it, and no place in the app to
-- put them where anything else could read them.
--
-- Adding them to `profiles` rather than only to `resumes.data` is the point:
-- the CV generator, the member directory and a future public profile all read
-- the profile, and a value that lives inside one CV blob is invisible to every
-- one of them.
--
-- No CHECK on `phone`. OECS members hold numbers from a dozen national plans
-- plus diaspora numbers, and a regex tight enough to be worth having would
-- reject somebody's real number. The CV renders it as typed and links it with
-- whitespace stripped (see ContactList in SheetFrame.tsx).
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}';

-- Same treatment skills/interests/open_to got in 041: the directory filters on
-- array containment, and a GIN index is what stops that being a seq scan.
CREATE INDEX IF NOT EXISTS idx_profiles_languages ON profiles USING GIN (languages);

COMMENT ON COLUMN profiles.phone IS
  'Contact number as the member typed it. No format enforced — see 082.';
COMMENT ON COLUMN profiles.website IS
  'Personal or organisational URL. Rendered as the "Website" social on the CV.';
COMMENT ON COLUMN profiles.languages IS
  'Languages the member speaks. Beats the single-language guess the VC locale claim gives.';

-- No RLS change. The existing self-UPDATE policy on profiles is column-agnostic,
-- and guard_profile_privileged_columns() (063) guards a named list of privileged
-- columns that these three are deliberately not on — they are the member's own
-- contact details, not a grant of anything.

-- ---------------------------------------------------------------------------
-- Seed the new columns from signup/OAuth metadata
-- ---------------------------------------------------------------------------
-- Restated in full from 044 rather than patched: CREATE OR REPLACE keeps grants
-- but every property not restated reverts to its default, so SECURITY DEFINER
-- has to be repeated or the trigger loses the privilege it needs to insert into
-- public.profiles. The only additions are phone, website and languages.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, display_name, avatar_url, roles, bio, country, organization, industry,
    skills, interests, open_to, phone, website, languages
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
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

NOTIFY pgrst, 'reload schema';
