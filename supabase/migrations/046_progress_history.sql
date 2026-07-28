-- 046: Progress history for grant applications and projects.
-- Powers the dashboard timeline: every status/phase change is logged with a
-- timestamp so applicants and project owners can see how things move along.

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS grant_application_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected')),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ga_events_app ON grant_application_events(application_id, created_at);

CREATE TABLE IF NOT EXISTS project_phase_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('concept', 'prototype', 'funding', 'launch')),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_events_project ON project_phase_events(project_id, created_at);

-- ============================================================
-- RLS: read-only history. Writes happen exclusively via triggers,
-- so there are deliberately no INSERT/UPDATE/DELETE policies.
-- ============================================================

ALTER TABLE grant_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phase_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own application events" ON grant_application_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all application events" ON grant_application_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

CREATE POLICY "Users can view own project phase events" ON project_phase_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all project phase events" ON project_phase_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Triggers. SECURITY DEFINER is required: the event tables have no
-- INSERT policy, so without it the history insert would fail under
-- the acting user's RLS (breaking admin approve/reject entirely).
-- ============================================================

CREATE OR REPLACE FUNCTION log_grant_application_status()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO grant_application_events (application_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ga_status_history ON grant_applications;
CREATE TRIGGER trg_ga_status_history
  AFTER INSERT OR UPDATE OF status ON grant_applications
  FOR EACH ROW EXECUTE FUNCTION log_grant_application_status();

CREATE OR REPLACE FUNCTION log_project_phase()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.phase IS DISTINCT FROM NEW.phase THEN
    INSERT INTO project_phase_events (project_id, phase, changed_by)
    VALUES (NEW.id, NEW.phase, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_phase_history ON projects;
CREATE TRIGGER trg_project_phase_history
  AFTER INSERT OR UPDATE OF phase ON projects
  FOR EACH ROW EXECUTE FUNCTION log_project_phase();

-- ============================================================
-- Backfill existing rows. Two-row heuristic: the initial state at
-- created_at, plus the current state at updated_at when it differs,
-- so already-decided items don't render as instant decisions.
-- ============================================================

INSERT INTO grant_application_events (application_id, status, created_at)
SELECT id, CASE WHEN status = 'draft' THEN 'draft' ELSE 'pending' END, created_at
FROM grant_applications;

INSERT INTO grant_application_events (application_id, status, created_at)
SELECT id, status, updated_at
FROM grant_applications
WHERE status NOT IN ('draft', 'pending');

INSERT INTO project_phase_events (project_id, phase, created_at)
SELECT id, 'concept', created_at
FROM projects;

INSERT INTO project_phase_events (project_id, phase, created_at)
SELECT id, phase, updated_at
FROM projects
WHERE phase <> 'concept';
