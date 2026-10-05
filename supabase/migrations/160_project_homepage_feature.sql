-- ============================================================================
-- 160_project_homepage_feature.sql — owners can put their project on the homepage
-- ============================================================================
-- The homepage hero's Projects tab showed the six newest public projects,
-- ranked for a signed-in member. An owner had no say in it. The only lever was
-- is_featured (024), an admin's star that since 061 adds +15 in the ranker and
-- does nothing at all for a signed-out visitor.
--
-- feature_on_homepage is the owner's opt-in. The homepage query orders opted-in
-- (and admin-starred) projects first, ranks within that group, and fills the
-- remaining slots with everything else, so the tab never runs empty. The
-- ordering lives in the app (useProjects' featuredFirst, homepageFirst() in
-- src/lib/personalization.ts); this column is only the flag.
--
-- It needs no guard: RLS already decides who may edit the row, and moderation
-- (122) hides a quarantined project from the SELECT policy whatever the flag
-- says. Private projects never reach the homepage query (is_public = true).
--
-- is_featured DOES need one, and never had it. The owner UPDATE policy (090)
-- gates the row, not its columns, so an owner or editor could star their own
-- project with a PATCH. Same shape as enforce_resource_review_columns (135):
-- PIN rather than RAISE, because the edit form sends whole rows back and must
-- not be refused over a column the member never touched. auth.uid() IS NULL
-- passes for the SQL editor, seeds and the service role.
--
-- Idempotent — safe to re-run. Apply BEFORE deploying the client: the homepage
-- query orders by feature_on_homepage, and PostgREST refuses an unknown column.
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS feature_on_homepage BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.projects.feature_on_homepage IS
  'Owner opt-in: list this project first in the homepage Projects tab. Ordering is applied client-side (useProjects featuredFirst).';

CREATE OR REPLACE FUNCTION public.pin_project_is_featured()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR has_permission(auth.uid(), 'project:manage_all') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_featured := FALSE;
  ELSE
    NEW.is_featured := OLD.is_featured;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pin_project_is_featured ON projects;
CREATE TRIGGER pin_project_is_featured
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION pin_project_is_featured();
