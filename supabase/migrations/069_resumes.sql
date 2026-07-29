-- Migration 069: CV / résumé documents
--
-- KTIP had no CV concept at all. A member's evidence of work was scattered
-- across profiles.skills, achievements, projects and — for anyone arriving from
-- the Virtual Campus — a course history that lived entirely on another domain.
-- None of it could be handed to an employer.
--
-- One row per user per template. The document itself is a JSONB blob rather
-- than six normalised tables, for one reason: the renderer is a port of an
-- existing résumé template whose section shapes (Role, Education, SkillGroup)
-- are already settled. Storing that shape verbatim means the components need no
-- mapping layer, and adding a second template later is a new `template` value
-- rather than a schema migration.
--
-- The interesting column is `sources`.
--
-- The Virtual Campus sync is re-runnable — a learner finishes a course, presses
-- "Sync", and the new course should appear. But by then they may have rewritten
-- their own summary, reordered their experience, or deleted a course they do
-- not want on this CV. A blind overwrite would destroy that work, and a
-- never-overwrite rule would make sync useless after the first run.
--
-- `sources` maps a dot-path in `data` to the authority that last wrote it:
--
--   {"profile.name": "vc", "profile.about": "manual", "courses": "vc"}
--
-- Sync writes a path only when its source is 'vc' or absent. The moment a user
-- edits a field the editor stamps 'manual' and sync stops touching it. That one
-- rule is what makes the button safe to press repeatedly, and it is enforced in
-- api/_lib/cv-build.ts rather than here because it is a merge policy, not an
-- integrity constraint.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Keyed to the renderer in src/lib/resume-templates.ts. Constrained loosely
  -- on purpose: a new template ships as a client-side registry entry, and a
  -- CHECK here would mean a migration for every design.
  template TEXT NOT NULL DEFAULT 'viridion',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Off by default. A CV holds more personal detail than a profile does, and a
  -- learner arriving through SSO never chose to publish anything.
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  vc_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template)
);

CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_public ON resumes(user_id) WHERE is_public;

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- Ownership rules mirror profiles (post-063): USING *and* WITH CHECK on every
-- write policy. 063 exists because a missing WITH CHECK on profiles let a user
-- rewrite a column they should not have been able to reach; the same omission
-- here would let a user move their row onto somebody else's user_id.

DROP POLICY IF EXISTS "Owners can view their own resume" ON resumes;
CREATE POLICY "Owners can view their own resume"
  ON resumes FOR SELECT
  USING (auth.uid() = user_id);

-- A suspended account must not keep serving a public document, so the public
-- read is gated on 063's is_suspended() rather than on is_public alone — same
-- predicate the leaderboard and directory use, not a second copy of the rule.
DROP POLICY IF EXISTS "Public resumes are viewable by everyone" ON resumes;
CREATE POLICY "Public resumes are viewable by everyone"
  ON resumes FOR SELECT
  USING (is_public = TRUE AND NOT is_suspended(user_id));

DROP POLICY IF EXISTS "Users can create their own resume" ON resumes;
CREATE POLICY "Users can create their own resume"
  ON resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own resume" ON resumes;
CREATE POLICY "Users can update their own resume"
  ON resumes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own resume" ON resumes;
CREATE POLICY "Users can delete their own resume"
  ON resumes FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION touch_resume_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_resume_updated_at_trigger ON resumes;
CREATE TRIGGER touch_resume_updated_at_trigger
  BEFORE UPDATE ON resumes
  FOR EACH ROW
  EXECUTE FUNCTION touch_resume_updated_at();

-- Used by /u/:id/cv. A public résumé has to open for a signed-out visitor, and
-- doing that through a function keeps the anon path a single round trip that
-- returns nothing at all when the document is private.
CREATE OR REPLACE FUNCTION public_resume(p_user UUID, p_template TEXT DEFAULT 'viridion')
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', r.template,
    'data', r.data,
    'updated_at', r.updated_at,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )
  FROM resumes r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user
    AND r.template = p_template
    AND r.is_public = TRUE
    AND NOT is_suspended(r.user_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public_resume(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resume(UUID, TEXT) TO anon, authenticated, service_role;
