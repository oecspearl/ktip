-- ============================================================================
-- 078_resume_design.sql — the member's chosen CV design
-- ============================================================================
-- 069 said a second look would be "a new `template` value". That turned out to
-- be wrong, and this migration is the correction.
--
-- `template` is the row key: UNIQUE (user_id, template), the upsert in
-- useResume.save conflict-targets it, public_resume() takes it as p_template,
-- and api/vc/sync.ts + api/auth/vc/callback.ts both write 'viridion' literally.
-- So writing a design choice into it would fork the document — every design
-- switch would land on a different row and abandon the member's edits.
--
-- Hence a separate, purely presentational column. Read `template` as "document
-- schema version / row key" and `design` as "how it is drawn". One document per
-- member, any number of looks, and switching can never lose a section.
--
-- No CHECK constraint, for the same reason 069 gave: a CHECK here would mean a
-- migration for every new design. Unknown values are resolved client-side by
-- resolveDesign() in src/lib/resume-designs.ts, which falls back to the default.
-- ============================================================================

-- 'signature' IS the design every existing row is already drawn in, so the
-- default backfills correctly and nobody's CV changes appearance on deploy.
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS design TEXT NOT NULL DEFAULT 'signature';

COMMENT ON COLUMN resumes.template IS
  'Row key / document schema version. Always ''viridion'' today — see 078. Not the look.';
COMMENT ON COLUMN resumes.design IS
  'Chosen presentation, resolved by src/lib/resume-designs.ts. Purely visual.';

-- CREATE OR REPLACE keeps the ownership and grants, but every property NOT
-- restated reverts to its default — omit SECURITY DEFINER and the anon path
-- silently returns nothing forever, omit SET search_path and a definer function
-- loses its pin. So all four are repeated verbatim from 069, and the parameter
-- names stay p_user / p_template because usePublicResume calls them by name.
CREATE OR REPLACE FUNCTION public_resume(p_user UUID, p_template TEXT DEFAULT 'viridion')
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', r.template,
    'design', r.design,
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

NOTIFY pgrst, 'reload schema';
