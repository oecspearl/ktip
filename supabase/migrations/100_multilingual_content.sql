-- ============================================================
-- 100: multilingual member-written content
-- ============================================================
--
-- 097 built the translation cache on one assumption: members write in English,
-- and French and Spanish are things we translate INTO. That is true of project
-- summaries and event copy. It is not true in a venue room during a hackathon,
-- where a participant from Martinique types French and a participant from
-- Saint Lucia has to read it — and where the translation therefore has to run in
-- the other direction, into English.
--
-- Translating in both directions needs one fact 097 never captured: what
-- language a given piece of text was actually written in. Detecting it per
-- render is possible but wasteful and wrong at the edges ("OK" is every
-- language). Recording it at write time, from the sender's own setting, is exact
-- and free.
--
-- Two changes, both additive and both nullable, so a deploy may run ahead of
-- this migration without breaking a page:
--
--   1. venue_room_messages.lang — what the sender was writing in
--   2. profiles.content_language / auto_translate — what the reader wants back
--
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. What language a room message was written in
-- ---------------------------------------------------------------------------
-- NULL is the honest answer for every row written before this column existed,
-- and for any client that has not been updated. The reader treats NULL as
-- English, which is what those rows overwhelmingly are — and being wrong about
-- one costs a redundant round trip that the provider answers with the source
-- text unchanged, not a wrong translation.
--
-- Deliberately NOT the same constraint list as a locale column elsewhere: this
-- is the set the app can translate between, and a value outside it would be
-- stored, read back, and then silently ignored by the client. Better rejected.
ALTER TABLE venue_room_messages ADD COLUMN IF NOT EXISTS lang TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_room_messages_lang_check'
  ) THEN
    ALTER TABLE venue_room_messages ADD CONSTRAINT venue_room_messages_lang_check
      CHECK (lang IS NULL OR lang IN ('en', 'fr', 'es'));
  END IF;
END $$;

COMMENT ON COLUMN venue_room_messages.lang IS
  'BCP-47 base code the sender wrote this in, taken from their own content-language '
  'setting at send time. NULL = unknown (pre-migration rows, or an older client); '
  'readers treat NULL as English. Used to decide whether a translation is needed at '
  'all, and in which direction — see src/lib/i18n/batcher.ts.';

-- No index. Every query that reads this already filters by room_id, and the
-- column is only ever read alongside the row it belongs to — an index here would
-- cost write throughput on the hottest insert path in the venue and buy nothing.

-- ---------------------------------------------------------------------------
-- 2. What the reader wants other people's writing turned into
-- ---------------------------------------------------------------------------
-- Separate from preferred_language (097) on purpose. Those are two different
-- questions and conflating them is a real papercut for the people this feature
-- exists for: a member whose French is stronger than their English may still
-- navigate an English UI out of habit, and the reverse is just as common. NULL —
-- the default, and what almost everyone will keep — means "follow the UI".
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS content_language TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_content_language_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_content_language_check
      CHECK (content_language IS NULL OR content_language IN ('en', 'fr', 'es'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.content_language IS
  'What OTHER members'' writing is translated into. NULL = follow preferred_language, '
  'then the UI language. Distinct from preferred_language because reading comfort and '
  'navigation habit are not the same preference. Self-service, like bio.';

-- The off switch. Some readers would rather see exactly what was typed —
-- mentors correcting someone's English, anyone who finds machine translation
-- more distracting than helpful. DEFAULT true because the entire point of the
-- feature is that a hackathon works without anyone configuring anything.
--
-- NOT NULL with a default rather than nullable: unlike the two columns above,
-- there is no third state here worth distinguishing. A client that predates this
-- column simply never sends it.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_translate BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN profiles.auto_translate IS
  'Whether to machine-translate other members'' writing into content_language. '
  'Default TRUE — a multilingual event has to work with nobody configuring anything. '
  'Turning it off shows every message exactly as it was typed.';

NOTIFY pgrst, 'reload schema';
