-- ============================================================
-- Migration 077: Grant ownership, and reaping uploads when a parent dies
--
-- Two loose ends, both about who owns a row and what happens when it goes.
--
-- 1. `grants` has never had a creator column. Migration 003 shipped
--    `USING (auth.uid() IS NOT NULL)` on UPDATE and DELETE with a comment
--    deferring the fix; migration 064 replaced that with
--    `USING (has_permission(auth.uid(), 'grant:post'))` and named the policies
--    "Users can update/delete grants they created". But the predicate never
--    checked creation, because there was nothing to check it against — so any
--    holder of `grant:post` could edit or delete anyone else's grant. The
--    policy names have been describing an intention, not a rule.
--
--    This adds `grants.created_by` and makes the policies mean what they say.
--
--    Rows that already exist get `created_by = NULL`, and NULL is deliberately
--    NOT treated as "anyone may manage it" — that is the exact hole being
--    closed. Legacy grants stay manageable by OECS admins, who are the only
--    people who have ever had a grant-creation UI (grants are created from
--    `AdminGrantFormModal`, never from a member-facing page), so in practice
--    nothing loses an owner it actually had.
--
-- 2. `entity_documents` (migration 048) is polymorphic: `entity_type` plus a
--    bare `entity_id` UUID with no foreign key, because one table serves both
--    grants and projects. That works for reads and breaks on delete — nothing
--    cascades, so deleting a project left its document rows behind, pointing
--    at an id that no longer resolves. They were unreachable from any page and
--    undeletable through any UI, and their `document_access` grants stayed
--    live. An AFTER DELETE trigger on each parent closes that.
--
--    The trigger reaps ROWS. It cannot reap the objects in the
--    `entity-documents` bucket: deleting from `storage.objects` in SQL removes
--    the record Supabase uses to list the bucket while leaving the blob in the
--    backing store, which is worse than the orphan it fixes. The client
--    removes blobs through the storage API before deleting the parent (see
--    `useDeleteProject` / `useDeleteGrant`). A parent deleted straight from
--    the SQL editor will therefore leave blobs behind — wasted bytes, no
--    broken references, no exposure, since the rows granting access are gone.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. grants.created_by
-- ============================================================

ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN grants.created_by IS
  'Who posted this grant. NULL on rows created before migration 077 — those are manageable by OECS admins only, never by any grant:post holder.';

-- Partial: the index exists to answer "my grants", and NULL is not a creator.
CREATE INDEX IF NOT EXISTS idx_grants_created_by
  ON grants(created_by, created_at DESC)
  WHERE created_by IS NOT NULL;

-- ============================================================
-- 2. is_oecs_admin()
--
-- Migration 012 inlines this EXISTS three times per table. It is needed three
-- more times below and once inside the reaper, so it becomes a function.
-- SECURITY DEFINER because it is called from policies on tables other than
-- `profiles`, and the caller may not be able to read the row it checks.
-- ============================================================

CREATE OR REPLACE FUNCTION is_oecs_admin(p_user UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user AND 'oecs' = ANY(roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_oecs_admin(UUID) IS
  'True when the user holds the oecs platform role. Replaces the inlined EXISTS from migration 012.';

REVOKE ALL ON FUNCTION is_oecs_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_oecs_admin(UUID) TO authenticated;

-- ============================================================
-- 3. Grant write policies that check ownership
--
-- INSERT additionally pins created_by to the caller, so a poster cannot file a
-- grant under someone else's name and then be unable to manage it (or, worse,
-- hand another user a row they did not create).
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can create grants" ON grants;
CREATE POLICY "Authenticated users can create grants"
  ON grants FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'grant:post')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update grants they created" ON grants;
CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE
  USING (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
    OR is_oecs_admin(auth.uid())
  )
  WITH CHECK (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
    OR is_oecs_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete grants they created" ON grants;
CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE
  USING (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
    OR is_oecs_admin(auth.uid())
  );

-- 012's OECS policies are now redundant with the OR arm above, but they are
-- harmless (policies are permissive and OR together) and dropping them would
-- make this migration harder to reason about against 012. Left in place.

-- ============================================================
-- 4. Reap entity_documents when the parent grant or project is deleted
--
-- SECURITY DEFINER: a project owner must be able to reap a document a
-- collaborator uploaded, and the documents SELECT/DELETE policies are
-- owner-scoped, so a plain trigger would silently reap only the deleter's own
-- rows and leave the rest.
-- ============================================================

CREATE OR REPLACE FUNCTION reap_entity_documents()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_type TEXT;
  v_count INT;
BEGIN
  -- Derived from the table the trigger fired on, never from a column, so a
  -- new parent type cannot silently reap the wrong entity_type.
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'projects' THEN 'project'
    WHEN 'grants'   THEN 'grant'
    ELSE NULL
  END;

  IF v_entity_type IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM entity_documents
  WHERE entity_type = v_entity_type
    AND entity_id = OLD.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    -- Surfaces in the SQL editor's notices pane, and in the Postgres log for a
    -- delete made from the app. The blobs those rows pointed at are the
    -- client's job; this is the record that there were some.
    RAISE NOTICE 'Reaped % entity_documents row(s) for % %', v_count, v_entity_type, OLD.id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION reap_entity_documents() IS
  'AFTER DELETE on grants/projects: removes entity_documents rows that no FK could cascade, because entity_documents is polymorphic. Storage objects are removed client-side.';

DROP TRIGGER IF EXISTS reap_documents_on_project_delete ON projects;
CREATE TRIGGER reap_documents_on_project_delete
  AFTER DELETE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION reap_entity_documents();

DROP TRIGGER IF EXISTS reap_documents_on_grant_delete ON grants;
CREATE TRIGGER reap_documents_on_grant_delete
  AFTER DELETE ON grants
  FOR EACH ROW
  EXECUTE FUNCTION reap_entity_documents();

-- ============================================================
-- 5. parent_upload_paths()
--
-- The client has to remove the blobs, and it cannot find them on its own.
-- `get_entity_documents` withholds `storage_path` from anyone without access
-- to that specific document, and the table's own SELECT policy is
-- `doc_access_role()`-scoped — both correct, and both mean a project owner
-- deleting their project cannot see the path of a document a collaborator
-- uploaded privately. Enumerating paths is therefore a separate, narrower
-- privilege than reading documents: you may learn the object keys of the
-- uploads attached to a parent you are about to delete, and nothing else.
--
-- Gated on the same condition as the parent's DELETE policy. Not on the
-- documents' policies — that is the whole point.
-- ============================================================

CREATE OR REPLACE FUNCTION parent_upload_paths(p_entity_type TEXT, p_entity_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR p_entity_id IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF p_entity_type = 'project' THEN
    SELECT TRUE INTO v_allowed FROM projects
     WHERE id = p_entity_id AND owner_id = auth.uid();
  ELSIF p_entity_type = 'grant' THEN
    SELECT TRUE INTO v_allowed FROM grants
     WHERE id = p_entity_id
       AND ((created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
            OR is_oecs_admin(auth.uid()));
  ELSE
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF NOT COALESCE(v_allowed, FALSE) THEN
    -- Silent empty rather than an exception: the caller is about to attempt the
    -- delete anyway, and RLS is what refuses it. Raising here would just turn
    -- one clear failure into two.
    RETURN ARRAY[]::TEXT[];
  END IF;

  RETURN COALESCE(
    (SELECT array_agg(storage_path)
       FROM entity_documents
      WHERE entity_type = p_entity_type
        AND entity_id = p_entity_id
        AND storage_path IS NOT NULL),
    ARRAY[]::TEXT[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION parent_upload_paths(TEXT, UUID) IS
  'Storage keys of the entity_documents attached to a grant or project, for the client to remove from the bucket before deleting the parent. Returns empty unless the caller could delete that parent.';

REVOKE ALL ON FUNCTION parent_upload_paths(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION parent_upload_paths(TEXT, UUID) TO authenticated;

-- ============================================================
-- 6. Existing orphans
--
-- One-off cleanup for rows already stranded by a delete that happened before
-- the trigger existed. Their blobs stay in the bucket; see the header.
-- ============================================================

DO $$
DECLARE v_count INT;
BEGIN
  DELETE FROM entity_documents d
  WHERE (d.entity_type = 'project' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = d.entity_id))
     OR (d.entity_type = 'grant'   AND NOT EXISTS (SELECT 1 FROM grants   g WHERE g.id = d.entity_id));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned % pre-existing orphaned entity_documents row(s).', v_count;
END $$;

-- ============================================================
-- 7. Verification — read-only, safe to run repeatedly
-- ============================================================

-- Expect one row: created_by, uuid, YES (nullable).
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'grants' AND column_name = 'created_by';

-- Expect the three policies below to mention created_by (INSERT/UPDATE/DELETE).
-- SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'grants' ORDER BY cmd, policyname;

-- Expect two rows.
-- SELECT tgname, tgrelid::regclass AS on_table
--   FROM pg_trigger WHERE tgname LIKE 'reap_documents_on_%';

-- Expect zero rows, now and forever.
-- SELECT d.id, d.entity_type, d.entity_id FROM entity_documents d
--  WHERE (d.entity_type = 'project' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = d.entity_id))
--     OR (d.entity_type = 'grant'   AND NOT EXISTS (SELECT 1 FROM grants   g WHERE g.id = d.entity_id));

NOTIFY pgrst, 'reload schema';
