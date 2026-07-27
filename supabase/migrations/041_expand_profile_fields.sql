-- ============================================================
-- Migration 041: Expand Profile Fields
-- Adds organization, industry, interests, open_to columns to
-- profiles; seeds them from signup metadata via handle_new_user;
-- adds 'faculty' role to preregistrations CHECK constraint.
-- Idempotent -- safe to re-run.
-- ============================================================

-- New profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS open_to TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Indexes for future directory filtering (mirrors idx_profiles_skills from 014)
CREATE INDEX IF NOT EXISTS idx_profiles_interests ON profiles USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_profiles_open_to ON profiles USING GIN (open_to);

-- Seed all profile fields collected by the signup wizard from
-- auth metadata (email confirmation means no session exists at
-- signup time, so the trigger is the only write path).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, display_name, roles, bio, country, organization, industry,
    skills, interests, open_to
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
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
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Allow 'faculty' role in preregistrations
ALTER TABLE preregistrations DROP CONSTRAINT IF EXISTS preregistrations_role_check;
ALTER TABLE preregistrations ADD CONSTRAINT preregistrations_role_check
  CHECK (role IN ('student', 'mentor', 'investor', 'entrepreneur', 'private_sector', 'faculty'));
