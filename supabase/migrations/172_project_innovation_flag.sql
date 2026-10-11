-- ============================================================================
-- 172_project_innovation_flag.sql — owners can mark a project as an innovation
-- ============================================================================
-- Projects had a category, a phase, an admin's star (is_featured) and the
-- climate tag (013), but nothing that said "this is an innovation project".
-- The roadmap's "innovation projects tracked from ideation to early-stage
-- revenue" (KPI t37, src/lib/kpi-catalog.ts) had no set of projects to point
-- at.
--
-- is_innovation is the owner's own declaration. It puts an Innovation badge on
-- the card and a banner on the project page. It is a claim, not a vetting:
-- the t37 figure stays attested in impact_records (134), and nothing here
-- counts toward it.
--
-- No guard trigger, unlike is_featured (160). The owner UPDATE policy (090)
-- already decides who may write the row, and the flag grants no ranking boost
-- or placement that a member could abuse. The edit form shows the checkbox to
-- the owner only; an editor member's save leaves the column untouched.
--
-- Idempotent — safe to re-run. Apply BEFORE deploying the client. The forms
-- only send the column when it is set or changed, so a project create or edit
-- still works if the client lands first, but ticking the box would fail with
-- PostgREST's unknown-column error until this runs.
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_innovation BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.projects.is_innovation IS
  'Owner declaration: this is an innovation project. Drives the card badge and the project page banner; not a vetted status.';

CREATE INDEX IF NOT EXISTS idx_projects_innovation
  ON public.projects(is_innovation) WHERE is_innovation = TRUE;
