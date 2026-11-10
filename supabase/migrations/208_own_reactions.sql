-- Migration 208: profiles.reaction_emojis, a member's own call reactions
-- ============================================================================
--
-- The call's reaction button fans out the room's six standard reactions plus up
-- to three a member picks for themselves (decided 2026-11-10). They are saved
-- on the profile so they follow the member to every room and every device.
--
-- Private by construction. 168 revoked table-level SELECT on profiles, so a new
-- column is unreadable by clients until a migration grants it, and this one
-- grants nothing. The member reads and writes their own list through the two
-- functions below; nobody else can read it.
--
-- The rules match src/lib/own-reactions.ts: at most three, no repeats, each one
-- short and free of letters, digits, spaces and angle brackets. The client
-- checks properly (one grapheme, a pictograph or a flag); this is the backstop
-- that keeps anything text-like out of storage whatever a client sends.
--
-- Idempotent: safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reaction_emojis TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_reaction_emojis_max3;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_reaction_emojis_max3
  CHECK (cardinality(reaction_emojis) <= 3);

COMMENT ON COLUMN profiles.reaction_emojis IS
  'Up to three emoji the member added to their call reactions (208). Private: read and written only through my_reaction_emojis() and set_my_reaction_emojis().';

CREATE OR REPLACE FUNCTION my_reaction_emojis()
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT reaction_emojis FROM profiles WHERE id = auth.uid()), '{}'::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION set_my_reaction_emojis(p_emojis TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean TEXT[] := '{}';
  v_item TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOREACH v_item IN ARRAY coalesce(p_emojis, '{}'::TEXT[]) LOOP
    CONTINUE WHEN v_item IS NULL
      OR char_length(v_item) NOT BETWEEN 1 AND 16
      OR v_item ~ '[[:alnum:][:space:]<>]'
      OR v_item = ANY (v_clean);
    v_clean := array_append(v_clean, v_item);
    EXIT WHEN cardinality(v_clean) = 3;
  END LOOP;

  UPDATE profiles SET reaction_emojis = v_clean WHERE id = v_uid;
  RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION my_reaction_emojis() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_my_reaction_emojis(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_reaction_emojis() TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_reaction_emojis(TEXT[]) TO authenticated;
