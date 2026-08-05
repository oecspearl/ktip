-- Calendar accents and personal calendar notes.
--
-- Two things the calendar redesign needs a home for:
--
--   1. An event's colour. Until now the colour was derived from event_type, so
--      six hackathons in a week were six identical blue bars. The organiser can
--      now pick one. Deliberately a named key, not a hex: the palette re-points
--      itself in dark mode (see index.css), and a free hex would freeze one
--      value and let anyone choose an unreadable one.
--
--   2. Notes, tasks and reminders the viewer puts on their own calendar. These
--      are private by construction — there is no sharing, no assignment and no
--      organiser. Anything collaborative belongs on an event or a project.

-- ---------------------------------------------------------------------------
-- 1. Event accent
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'calendar_accent'
  ) THEN
    CREATE TYPE calendar_accent AS ENUM (
      'ocean',
      'tropical',
      'sun',
      'purple',
      'rose',
      'teal',
      'sand'
    );
  END IF;
END
$$;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS accent_color calendar_accent;

COMMENT ON COLUMN events.accent_color IS
  'Organiser-chosen calendar colour. NULL falls back to the event_type palette.';

-- ---------------------------------------------------------------------------
-- 2. Calendar notes
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'calendar_note_kind'
  ) THEN
    CREATE TYPE calendar_note_kind AS ENUM ('note', 'task', 'reminder');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS calendar_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         calendar_note_kind NOT NULL DEFAULT 'note',
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body         text CHECK (body IS NULL OR char_length(body) <= 4000),
  -- When it lands on the calendar. A note with no time sits at the top of its
  -- day; a reminder without one would have nothing to remind you at.
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  all_day      boolean NOT NULL DEFAULT false,
  accent_color calendar_accent NOT NULL DEFAULT 'sand',
  -- Tasks are the only kind that can be finished; the column is meaningless
  -- for the other two and simply stays false.
  is_done      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_notes_span CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

-- The calendar always reads one window for one person, so that is the index.
CREATE INDEX IF NOT EXISTS calendar_notes_user_window_idx
  ON calendar_notes (user_id, starts_at);

ALTER TABLE calendar_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own calendar notes" ON calendar_notes;
CREATE POLICY "Users read their own calendar notes"
  ON calendar_notes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create their own calendar notes" ON calendar_notes;
CREATE POLICY "Users create their own calendar notes"
  ON calendar_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own calendar notes" ON calendar_notes;
CREATE POLICY "Users update their own calendar notes"
  ON calendar_notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete their own calendar notes" ON calendar_notes;
CREATE POLICY "Users delete their own calendar notes"
  ON calendar_notes FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at maintenance, matching the trigger the other tables use.
CREATE OR REPLACE FUNCTION touch_calendar_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_notes_touch_updated_at ON calendar_notes;
CREATE TRIGGER calendar_notes_touch_updated_at
  BEFORE UPDATE ON calendar_notes
  FOR EACH ROW EXECUTE FUNCTION touch_calendar_notes_updated_at();
