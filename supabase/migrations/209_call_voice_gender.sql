-- Migration 209: profiles.gender, for the voice that reads a member's words in calls
-- ============================================================================
--
-- In a call, someone who reads another language hears the speaker's words
-- translated and read aloud by their own device. That voice was whatever the
-- device had, so a man could be read out in a woman's voice (asked for
-- 2026-11-10: use the gender on my profile, and my age).
--
-- A member may now say "woman" or "man" in Preferences. It is optional, and
-- private by construction: 168 revoked table-level SELECT on profiles, so a new
-- column is unreadable by clients until a migration grants it, and this one
-- grants nothing. The member reads and writes their own value through the
-- functions below; nobody else can read it.
--
-- What a call is told is narrower still. my_call_voice() answers one of four
-- words (woman, man, girl, boy) from the gender and from account_is_minor()
-- (091), and the member's own browser sends that word to the call they are in.
-- The date of birth never leaves account_age, and a member who has not said
-- gets NULL and the device's default voice, as before.
--
-- Idempotent: safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_gender_known;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_gender_known
  CHECK (gender IS NULL OR gender IN ('woman', 'man'));

COMMENT ON COLUMN profiles.gender IS
  'woman, man or NULL for not said (209). Private: read and written only through my_gender() and set_my_gender(). Used to pick the voice that reads the member''s translated words in calls.';

CREATE OR REPLACE FUNCTION my_gender()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gender FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION my_call_voice()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.gender IS NULL THEN NULL
    WHEN account_is_minor(p.id) THEN CASE p.gender WHEN 'woman' THEN 'girl' ELSE 'boy' END
    ELSE p.gender
  END
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

-- Returns the call voice that follows from the new value, so the client can
-- update what it tells calls without a second round trip.
CREATE OR REPLACE FUNCTION set_my_gender(p_gender TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE profiles
  SET gender = CASE WHEN p_gender IN ('woman', 'man') THEN p_gender ELSE NULL END
  WHERE id = v_uid;

  RETURN my_call_voice();
END;
$$;

REVOKE ALL ON FUNCTION my_gender() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION my_call_voice() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_my_gender(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_gender() TO authenticated;
GRANT EXECUTE ON FUNCTION my_call_voice() TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_gender(TEXT) TO authenticated;
