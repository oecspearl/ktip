-- Migration 207: venue_rooms.live_translation, the organiser's per-room switch
-- ============================================================================
--
-- Calls now translate on their own: a listener says "follow along in my
-- language", and the speaker's browser transcribes them and asks
-- /api/captions/translate for that language only. Decided 2026-11-10:
-- organisers can turn that off for a single room (a judging room where the
-- panel wants exactly what was said, a sponsor booth under NDA), and it is on
-- everywhere by default.
--
-- What the switch covers, and what it does not:
--
--   - Off stops TRANSLATION. /api/captions/translate answers an empty result
--     for a room with this off, so a client that ignores the flag still gets
--     nothing translated, and nothing is billed to the free tier.
--   - Off does NOT stop same-language subtitles. Reading along in the language
--     being spoken is an accessibility need, not a translation, and an
--     organiser must not be able to switch it off by accident.
--
-- Written by the existing organiser-only UPDATE policy on venue_rooms, the
-- same path that opens and closes a room. save_venue_map() (188) upserts with
-- an explicit column list that leaves this column out, so saving the floor
-- plan in the editor never resets a host's choice.
--
-- Idempotent: safe to re-run.

ALTER TABLE venue_rooms
  ADD COLUMN IF NOT EXISTS live_translation BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN venue_rooms.live_translation IS
  'Organiser switch (207). False: call captions in this room are never translated (enforced in api/captions/translate.ts). Same-language subtitles still work.';
