-- Migration 194: Homebase extras — shared docs, team calendar, milestones,
-- the challenge checklist, and a shared team timer
--
-- Everything here belongs to one team and is read and written by that team
-- and the venue's hosts, through can_use_team() from 190. Live updates ride
-- the team's own channel (ydoc:team:<id>); these tables are what a teammate
-- who arrives later loads.
--
--   team_docs            collaborative documents. ydoc_state is the Yjs
--                        document, base64-encoded, saved by whoever edited
--                        last. Yjs merges, so two saves of diverged copies
--                        lose nothing once the editors have synced.
--   team_calendar_items  the team's own blocks, shown beside the event's
--                        schedule (event_schedule).
--   team_milestones      the team's benchmarks: a title, a due time, done.
--   team_checklist       one tick per challenge objective or deliverable
--                        (event_criteria), so the team can see what the
--                        Submission Desk will ask for.
--   team_state           small shared state. Today only the team timer.
--
-- Needs 188 (event_teams) and 190 (can_use_team). Idempotent.

-- ============================================================
-- 1. Docs
-- ============================================================

CREATE TABLE IF NOT EXISTS team_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled' CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  ydoc_state TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ~1.5MB of base64 is a long document. The cap stops one paste of a
  -- screenshot into a doc from making every later load a slow download.
  CONSTRAINT team_docs_size CHECK (octet_length(ydoc_state) <= 2000000)
);
CREATE INDEX IF NOT EXISTS idx_team_docs_team ON team_docs(team_id, updated_at DESC);

-- ============================================================
-- 2. Calendar
-- ============================================================

CREATE TABLE IF NOT EXISTS team_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_calendar_order CHECK (ends_at > starts_at),
  CONSTRAINT team_calendar_length CHECK (ends_at - starts_at <= INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_team_calendar_team ON team_calendar_items(team_id, starts_at);

-- ============================================================
-- 3. Milestones and the challenge checklist
-- ============================================================

CREATE TABLE IF NOT EXISTS team_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  due_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_milestones_team ON team_milestones(team_id, position);

CREATE TABLE IF NOT EXISTS team_checklist (
  team_id UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES event_criteria(id) ON DELETE CASCADE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, criterion_id)
);

-- ============================================================
-- 4. Shared state (the team timer)
-- ============================================================

CREATE TABLE IF NOT EXISTS team_state (
  team_id UUID PRIMARY KEY REFERENCES event_teams(id) ON DELETE CASCADE,
  -- {label, duration_s, started_at (iso, null when paused), left_s}
  timer JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_state_timer_shape CHECK (jsonb_typeof(timer) = 'object' AND length(timer::text) <= 1000)
);

-- ============================================================
-- 5. Row level security: the team and the hosts, nobody else
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_docs', 'team_calendar_items', 'team_milestones', 'team_checklist', 'team_state']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team reads" ON %I', t);
    EXECUTE format('CREATE POLICY "Team reads" ON %I FOR SELECT USING (can_use_team(auth.uid(), team_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team adds" ON %I', t);
    EXECUTE format('CREATE POLICY "Team adds" ON %I FOR INSERT WITH CHECK (can_use_team(auth.uid(), team_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team changes" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "Team changes" ON %I FOR UPDATE USING (can_use_team(auth.uid(), team_id)) WITH CHECK (can_use_team(auth.uid(), team_id))',
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS "Team removes" ON %I', t);
    EXECUTE format('CREATE POLICY "Team removes" ON %I FOR DELETE USING (can_use_team(auth.uid(), team_id))', t);
  END LOOP;
END $$;

-- A checklist tick must name a criterion of the team's own event.
CREATE OR REPLACE FUNCTION check_team_checklist_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM event_criteria c
    JOIN event_teams t ON t.event_id = c.event_id
    WHERE c.id = NEW.criterion_id AND t.id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'that item is not part of this team''s challenge';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS team_checklist_event ON team_checklist;
CREATE TRIGGER team_checklist_event BEFORE INSERT OR UPDATE ON team_checklist
  FOR EACH ROW EXECUTE FUNCTION check_team_checklist_event();

NOTIFY pgrst, 'reload schema';
