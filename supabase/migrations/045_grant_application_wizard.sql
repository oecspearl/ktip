-- Grant application wizard: draft support, resume step, RLS fix, drop proposals feature

-- 1. Allow 'draft' status on grant_applications
ALTER TABLE grant_applications DROP CONSTRAINT IF EXISTS grant_applications_status_check;
ALTER TABLE grant_applications ADD CONSTRAINT grant_applications_status_check
  CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected'));

-- 2. Track wizard progress for draft resume
ALTER TABLE grant_applications ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0;

-- 3. Replace INSERT policy: the original NOT EXISTS subquery referenced
-- grant_applications against itself (grant_id = grant_applications.grant_id is
-- always true for any existing row), blocking a user's application to a second
-- grant. UNIQUE(grant_id, user_id) already enforces one application per grant.
DROP POLICY IF EXISTS "Users can create applications" ON grant_applications;
CREATE POLICY "Users can create applications"
  ON grant_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Exclude drafts from the public application count
CREATE OR REPLACE FUNCTION get_grant_application_count(grant_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM grant_applications
  WHERE grant_id = grant_uuid AND status <> 'draft';
$$ LANGUAGE SQL STABLE;

-- 5. Remove standalone proposals feature
DROP TABLE IF EXISTS proposals CASCADE;
