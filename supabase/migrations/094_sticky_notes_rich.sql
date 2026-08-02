-- ============================================================
-- Migration 094: Sticky notes become documents, and can be filed
--
-- 093 shipped a note as a coloured box with a line of text in it. This is the
-- rest of the idea: a note has a title and formatted content, a size the owner
-- chose, a page it belongs to, and can be dropped onto another note to make a
-- folder.
--
-- Why a page rather than a global pin: a note written on the grant application
-- is about the grant application, and having it follow you onto the events
-- calendar is noise. `pinned` opts a note out of that — pinned notes ride along
-- everywhere, which is the behaviour people expect from a sticky note they
-- deliberately kept.
--
-- Colours move from five names to any hex from the palette. Storing the value
-- rather than the name means the palette can change without a migration, and
-- the header shade is derived from it in CSS.
--
-- Sizes are pixels but positions stay fractions (093's reasoning is unchanged):
-- a note's box is authored, its place on screen is relative.
--
-- Idempotent — safe to re-run, and safe to run on a database where 093 already
-- has rows in it.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Folders
--
-- A group is not a note with children: it has no body, and it is positioned
-- and dragged independently of the notes inside it. Notes point at it rather
-- than the other way round, so a note can only ever be in one folder and
-- removing one is a single UPDATE.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sticky_note_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Folder',
  color TEXT NOT NULL DEFAULT '#fef08a' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  page_path TEXT,
  x REAL NOT NULL DEFAULT 0.5 CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL DEFAULT 0.5 CHECK (y >= 0 AND y <= 1),
  minimized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sticky_note_groups_user
  ON sticky_note_groups(user_id, created_at DESC);

COMMENT ON TABLE sticky_note_groups IS
  'A folder of sticky notes; positioned like a note but holding no content of its own.';

DROP TRIGGER IF EXISTS set_sticky_note_groups_updated_at ON sticky_note_groups;
CREATE TRIGGER set_sticky_note_groups_updated_at
  BEFORE UPDATE ON sticky_note_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE sticky_note_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own folders" ON sticky_note_groups;
CREATE POLICY "Members read their own folders"
  ON sticky_note_groups FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members create their own folders" ON sticky_note_groups;
CREATE POLICY "Members create their own folders"
  ON sticky_note_groups FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members edit their own folders" ON sticky_note_groups;
CREATE POLICY "Members edit their own folders"
  ON sticky_note_groups FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members delete their own folders" ON sticky_note_groups;
CREATE POLICY "Members delete their own folders"
  ON sticky_note_groups FOR DELETE
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. A note grows a title, a body, a box and a home
-- ------------------------------------------------------------

ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'New note';
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 300;
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 260;
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS page_path TEXT;
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS minimized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS group_id UUID
  REFERENCES sticky_note_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sticky_notes_group ON sticky_notes(group_id);

ALTER TABLE sticky_notes DROP CONSTRAINT IF EXISTS sticky_notes_size_check;
ALTER TABLE sticky_notes
  ADD CONSTRAINT sticky_notes_size_check
  CHECK (width BETWEEN 240 AND 1600 AND height BETWEEN 180 AND 1600);

COMMENT ON COLUMN sticky_notes.content IS
  'Rich text as HTML. Written by the owner only, and sanitised client-side before it is rendered.';
COMMENT ON COLUMN sticky_notes.page_path IS
  'Route the note was written on. NULL or pinned = shown everywhere.';
COMMENT ON COLUMN sticky_notes.pinned IS
  'Ride along on every page instead of living on page_path.';

-- ------------------------------------------------------------
-- 3. Carry 093's rows across
--
-- 093 stored one plain-text field called `body` and a colour *name*. Both are
-- translated in place, then the old columns are dropped — nothing reads them
-- after this migration, and leaving a stale `body` around invites a future
-- writer to use it.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sticky_notes' AND column_name = 'body'
  ) THEN
    -- Plain text becomes a single escaped paragraph: the old body could contain
    -- < or & and must not start rendering as markup after the move.
    UPDATE sticky_notes
       SET content = '<p>' || replace(replace(replace(body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
     WHERE content = '' AND COALESCE(body, '') <> '';

    ALTER TABLE sticky_notes DROP COLUMN body;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sticky_notes' AND column_name = 'collapsed'
  ) THEN
    UPDATE sticky_notes SET minimized = collapsed;
    ALTER TABLE sticky_notes DROP COLUMN collapsed;
  END IF;
END $$;

-- Colour names → the palette they stood for. Runs before the CHECK is swapped,
-- or the new constraint would reject the rows it is meant to protect.
ALTER TABLE sticky_notes DROP CONSTRAINT IF EXISTS sticky_notes_color_check;

UPDATE sticky_notes SET color = CASE color
  WHEN 'sun'      THEN '#fef08a'
  WHEN 'tropical' THEN '#bbf7d0'
  WHEN 'ocean'    THEN '#bfdbfe'
  WHEN 'red'      THEN '#fecaca'
  WHEN 'sand'     THEN '#fed7aa'
  ELSE color
END
WHERE color !~ '^#[0-9a-fA-F]{6}$';

ALTER TABLE sticky_notes ALTER COLUMN color SET DEFAULT '#fef08a';
ALTER TABLE sticky_notes
  ADD CONSTRAINT sticky_notes_color_check
  CHECK (color ~ '^#[0-9a-fA-F]{6}$');

-- ------------------------------------------------------------
-- 4. An empty folder is not a thing
--
-- Folders are made by dropping one note on another and unmade by taking the
-- notes back out. Rather than making every client remember to tidy up, the
-- last note leaving takes the folder with it.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION reap_empty_sticky_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_group UUID := OLD.group_id;
BEGIN
  IF v_old_group IS NULL THEN
    RETURN NULL;
  END IF;

  -- On UPDATE the row still exists, so the note that just moved must not be
  -- counted as still being in the folder it left.
  IF NOT EXISTS (
    SELECT 1 FROM sticky_notes
    WHERE group_id = v_old_group
      AND id <> OLD.id
  ) THEN
    DELETE FROM sticky_note_groups WHERE id = v_old_group;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reap_sticky_group_on_note_leave ON sticky_notes;
CREATE TRIGGER reap_sticky_group_on_note_leave
  AFTER DELETE OR UPDATE OF group_id ON sticky_notes
  FOR EACH ROW
  WHEN (OLD.group_id IS NOT NULL)
  EXECUTE FUNCTION reap_empty_sticky_group();

NOTIFY pgrst, 'reload schema';
