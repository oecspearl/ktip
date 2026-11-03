-- ============================================================================
-- 187_legal_archive.sql — deleted content is kept for 3 years, then purged
-- ============================================================================
-- Until now a delete on KTIP was final. Projects, events, messages, funding
-- applications and the rest were hard-deleted, and an account deletion
-- cascaded through all of it, so when a legal claim, a regulator or a
-- safeguarding case arrived after the fact there was nothing left to look at.
--
-- The fix is archive-on-delete rather than soft-delete. Turning every content
-- table into a soft-delete table would mean rewriting each delete path and
-- every RLS policy that reads those tables; one missed `deleted_at IS NULL`
-- and deleted content reappears on a page. Instead, a BEFORE DELETE trigger on
-- each table copies the row into legal_archive and lets the delete proceed.
-- Members see exactly what they saw before: the content is gone at once.
--
-- Row triggers also fire for rows removed by ON DELETE CASCADE, so an account
-- purge (140's purge_account, api/delete-account.ts, api/admin/delete-user.ts)
-- archives everything that cascades from the profile, with no change to those
-- paths.
--
--   legal_archive        one row per deleted record: the whole row as jsonb,
--                        who deleted it, when, and purge_after = +3 years.
--   legal-archive        a private storage bucket for files moved out of the
--                        member buckets by api/_lib/legal-archive.ts. No
--                        policies: only the service role can reach it.
--   set_legal_hold()     the one write the admin page makes. A held row is
--                        skipped by the purge until the hold is lifted.
--   purge_legal_archive  service role only; api/cron/purge-legal-archive.ts
--                        calls it daily and removes the returned files.
--
-- WHO CAN READ IT. Holders of audit:view: Super Admin and Admin (who hold
-- every key), People & Trust Supervisor and Safety Admin. NOT ip_legal, even
-- though the plan named it: ip_legal (158) is the member-tier role for outside
-- patent agents and IP lawyers, approved like an organisation account. The
-- archive holds other members' private messages, grievances and safeguarding
-- reports; opening it to them would contradict the Privacy Policy, which says
-- only OECS Commission staff can open it. can_read_legal_archive() is the one
-- place to change if counsel decides otherwise. No new permission key, so
-- default_role_permissions() is not restated.
--
-- DATA VOLUME. Every deleted row is copied whole, including large text such
-- as entity_documents' extracted markdown. An account purge writes one archive
-- row per cascaded message, post and consent record, so a heavy user's
-- deletion can write thousands of rows in one transaction. Rows live for
-- 3 years; expect the table to settle at roughly three years of deletions.
-- The purge works in batches (default 500) so one run never holds a long lock.
--
-- NOT COVERED. TRUNCATE (no row triggers); tables not in the list below
-- (project_comments, event_solutions, venue_room_messages, whiteboards,
-- snippets, profiles themselves); and files. Files are only archived where a
-- server path moves them with api/_lib/legal-archive.ts; see that file.
--
-- The legal-copy version bump that goes with this is at the very end, COMMENTED
-- OUT on purpose: it must ship in the same release as the client copy, or every
-- member is asked to accept a version their browser cannot record. Read the
-- note there before running it.
--
-- Requires 063 (has_permission), 115 (legal_documents), 140 (purge_account).
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The archive
-- ---------------------------------------------------------------------------
-- owner_id and deleted_by are plain uuids, deliberately not foreign keys: the
-- profile they name is usually the thing being deleted, and a second FK to
-- profiles would also break bare profiles(*) embeds (PGRST201).
CREATE TABLE IF NOT EXISTS legal_archive (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The source table name (TG_TABLE_NAME), or a label for a file-only row.
  entity_type     TEXT NOT NULL,
  -- The source row's id, as text so a non-uuid key still fits.
  entity_id       TEXT NOT NULL,
  owner_id        UUID,
  snapshot        JSONB NOT NULL,
  -- [{ "bucket": "legal-archive", "path": "<original bucket>/<original path>" }]
  storage_paths   JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- auth.uid() of whoever ran the delete. NULL for the service role (account
  -- deletion, the purge cron) and for cascades out of auth.users.
  deleted_by      UUID,
  -- Why the row went, where the deleting code says so (see purge_account).
  reason          TEXT,
  legal_hold      BOOLEAN NOT NULL DEFAULT FALSE,
  hold_reason     TEXT,
  hold_changed_by UUID,
  hold_changed_at TIMESTAMPTZ,
  purge_after     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 years')
);

CREATE INDEX IF NOT EXISTS idx_legal_archive_entity ON legal_archive(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_legal_archive_owner ON legal_archive(owner_id);
CREATE INDEX IF NOT EXISTS idx_legal_archive_purge ON legal_archive(purge_after) WHERE NOT legal_hold;
CREATE INDEX IF NOT EXISTS idx_legal_archive_deleted_at ON legal_archive(deleted_at DESC);

COMMENT ON TABLE legal_archive IS
  'Migration 187. A copy of every row deleted from the content tables, kept for 3 years for legal claims, regulators and safeguarding or copyright cases, then purged by api/cron/purge-legal-archive.ts unless legal_hold is set. Read by audit:view holders only.';

-- ---------------------------------------------------------------------------
-- 2. Who can read it
-- ---------------------------------------------------------------------------
-- One function so the RLS policy, set_legal_hold() and any later RPC agree.
CREATE OR REPLACE FUNCTION can_read_legal_archive(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND public.has_permission(p_user, 'audit:view');
$$;

REVOKE ALL ON FUNCTION can_read_legal_archive(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_read_legal_archive(UUID) TO authenticated;

ALTER TABLE legal_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_archive readable by audit staff" ON legal_archive;
CREATE POLICY "legal_archive readable by audit staff"
  ON legal_archive FOR SELECT
  TO authenticated
  USING (can_read_legal_archive(auth.uid()));

-- No INSERT, UPDATE or DELETE for any client role. Rows arrive through the
-- trigger, change through set_legal_hold(), and leave through the purge.
REVOKE ALL ON legal_archive FROM anon, authenticated;
GRANT SELECT ON legal_archive TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The trigger
-- ---------------------------------------------------------------------------
-- TG_ARGV[0], when given, names the column holding the owner's uuid. Read out
-- of the jsonb rather than OLD.<col> so one function serves every table.
--
-- Fully qualified, and search_path pinned: a delete that cascades out of
-- auth.users runs as supabase_auth_admin, whose search_path is `auth` (the
-- 173 lesson).
--
-- reason comes from the transaction-local setting ktip.archive_reason, which
-- purge_account() sets. Anything else leaves it NULL.
CREATE OR REPLACE FUNCTION archive_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   JSONB := to_jsonb(OLD);
  v_owner UUID;
  v_text  TEXT;
BEGIN
  IF TG_NARGS > 0 THEN
    v_text := v_row ->> TG_ARGV[0];
    IF v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_owner := v_text::UUID;
    END IF;
  END IF;

  INSERT INTO public.legal_archive (entity_type, entity_id, owner_id, snapshot, deleted_by, reason)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(v_row ->> 'id', ''),
    v_owner,
    v_row,
    auth.uid(),
    NULLIF(current_setting('ktip.archive_reason', TRUE), '')
  );

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION archive_before_delete() FROM PUBLIC, anon, authenticated;

-- Attach. Each table is checked first, so a database missing one (an old
-- branch, a partial restore) still applies the rest; the NOTICE names it.
-- The owner column is checked too: if it is missing the trigger is attached
-- without one and owner_id stays NULL.
--
-- Named zz_legal_archive so it fires LAST among BEFORE DELETE triggers. A
-- BEFORE trigger that returned NULL after this one had run would cancel the
-- delete but leave an archive row for a record that still exists.
DO $$
DECLARE
  v_target RECORD;
  v_owner  TEXT;
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      ('projects',           'owner_id'),
      ('events',             'organizer_id'),
      ('resources',          'author_id'),
      ('grants',             'created_by'),
      ('grant_applications', 'user_id'),
      ('forum_posts',        'author_id'),
      ('forum_replies',      'author_id'),
      ('messages',           'sender_id'),
      ('documents',          'owner_id'),
      ('entity_documents',   'owner_id'),
      ('user_consents',      'user_id'),
      ('content_reports',    'reporter_id'),
      ('takedown_notices',   'claimant_user_id'),
      ('grievances',         'reporter_id')
    ) AS t(tbl, owner_col)
  LOOP
    IF to_regclass('public.' || v_target.tbl) IS NULL THEN
      RAISE NOTICE '187: table % does not exist, no archive trigger attached', v_target.tbl;
      CONTINUE;
    END IF;

    v_owner := v_target.owner_col;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_target.tbl
        AND c.column_name = v_owner
    ) THEN
      RAISE NOTICE '187: %.% does not exist, archive rows will have no owner', v_target.tbl, v_owner;
      v_owner := NULL;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS zz_legal_archive ON public.%I', v_target.tbl);

    IF v_owner IS NULL THEN
      EXECUTE format(
        'CREATE TRIGGER zz_legal_archive BEFORE DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION archive_before_delete()',
        v_target.tbl
      );
    ELSE
      EXECUTE format(
        'CREATE TRIGGER zz_legal_archive BEFORE DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION archive_before_delete(%L)',
        v_target.tbl, v_owner
      );
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Legal hold
-- ---------------------------------------------------------------------------
-- The only client write. reason (why the row was deleted) is left alone;
-- hold_reason records why it is being kept past its date.
CREATE OR REPLACE FUNCTION set_legal_hold(p_id UUID, p_hold BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS legal_archive
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row   legal_archive;
BEGIN
  IF NOT can_read_legal_archive(v_actor) THEN
    RAISE EXCEPTION 'not allowed to change a legal hold' USING ERRCODE = '42501';
  END IF;

  UPDATE legal_archive a
  SET legal_hold      = COALESCE(p_hold, FALSE),
      hold_reason     = COALESCE(NULLIF(btrim(p_reason), ''), a.hold_reason),
      hold_changed_by = v_actor,
      hold_changed_at = now()
  WHERE a.id = p_id
  RETURNING a.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive record not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION set_legal_hold(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_legal_hold(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The purge
-- ---------------------------------------------------------------------------
-- Deletes up to p_limit rows past purge_after and not on hold, and hands back
-- their storage_paths for the cron to remove from the bucket. SKIP LOCKED so
-- two overlapping runs split the work instead of queueing on each other.
-- Service role only: this destroys evidence.
CREATE OR REPLACE FUNCTION purge_legal_archive(p_limit INTEGER DEFAULT 500)
RETURNS TABLE (id UUID, entity_type TEXT, storage_paths JSONB)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT a.id
    FROM public.legal_archive a
    WHERE a.purge_after <= now()
      AND NOT a.legal_hold
    ORDER BY a.purge_after
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.legal_archive a
  USING due
  WHERE a.id = due.id
  RETURNING a.id, a.entity_type, a.storage_paths;
$$;

REVOKE ALL ON FUNCTION purge_legal_archive(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_legal_archive(INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The bucket
-- ---------------------------------------------------------------------------
-- Private, and no storage.objects policies at all: members and staff alike
-- reach it only through the service role.
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-archive', 'legal-archive', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. purge_account, labelled
-- ---------------------------------------------------------------------------
-- 140's body unchanged, plus the archive reason, so the rows its cascade
-- writes say why they went.
CREATE OR REPLACE FUNCTION purge_account(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('ktip.archive_reason', 'account_purge', TRUE);

  -- A funding call with applications against it belongs to the applicants as
  -- much as to whoever posted it. Hand it to the owning organisation rather
  -- than cascade it — and with it, everybody's submission — into nothing.
  UPDATE grants g
  SET created_by = NULL
  WHERE g.created_by = p_user
    AND EXISTS (SELECT 1 FROM grant_applications a WHERE a.grant_id = g.id);

  DELETE FROM profiles WHERE id = p_user;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 8. Legal document versions — DO NOT RUN WITH THE REST OF THIS FILE
-- ============================================================================
-- The retention copy in src/lib/legal (privacy, terms, acceptable-use,
-- safeguarding → v2; content-licence, copyright → v2;
-- application-confidentiality → v2) is held until counsel signs it off.
-- record_consent() refuses a client whose bundled version differs from the
-- register, and ensure_my_consent_state() flags every member who has not
-- accepted the current version. Run this block BEFORE the client is live and
-- every member is asked to accept text their browser cannot record; run it
-- AFTER and nobody is asked at all.
--
-- So: run it in the same release window as the client copy, once counsel has
-- approved it. effective_date must match effectiveDate in each document
-- module (legal-content.test.ts guards the module side), and should be at
-- least 14 days after members are told (Terms and Privacy promise that notice
-- for material changes). Also bump p_expected_version in
-- scripts/seed-test-accounts.mjs to 2.
--
-- UPDATE legal_documents SET is_current = FALSE
--  WHERE key IN ('terms', 'privacy', 'acceptable-use', 'safeguarding',
--                'content-licence', 'copyright', 'application-confidentiality')
--    AND version <> 2;
--
-- INSERT INTO legal_documents (key, version, effective_date, bundle, is_current, title) VALUES
--   ('terms',                       2, DATE '2026-11-16', 'account',     TRUE, 'Terms of Use'),
--   ('privacy',                     2, DATE '2026-11-16', 'account',     TRUE, 'Privacy Policy'),
--   ('acceptable-use',              2, DATE '2026-11-16', 'account',     TRUE, 'Acceptable Use & Community Guidelines'),
--   ('safeguarding',                2, DATE '2026-11-16', 'account',     TRUE, 'Minor Safeguarding Statement'),
--   ('content-licence',             2, DATE '2026-11-16', 'publishing',  TRUE, 'IP, Content & Licensing Policy'),
--   ('copyright',                   2, DATE '2026-11-16', 'publishing',  TRUE, 'Copyright & Takedown Policy'),
--   ('application-confidentiality', 2, DATE '2026-11-16', 'application', TRUE, 'Grant Application Confidentiality & IP')
-- ON CONFLICT (key, version) DO UPDATE SET
--   effective_date = EXCLUDED.effective_date,
--   is_current     = TRUE;

-- ============================================================================
-- Verification
--
--   -- every target table carries the trigger
--   SELECT event_object_table FROM information_schema.triggers
--   WHERE trigger_name = 'zz_legal_archive' ORDER BY 1;
--     -- 14 rows
--
--   -- a delete is archived, with the clock set
--   BEGIN;
--   DELETE FROM projects WHERE id = '<a test project>';
--   SELECT entity_type, owner_id, purge_after - deleted_at AS kept
--   FROM legal_archive WHERE entity_id = '<a test project>';
--     -- projects | <owner> | 1095 days (or 1096 across a leap day)
--   ROLLBACK;
--
--   -- members cannot read it
--   SET LOCAL ROLE authenticated; SELECT count(*) FROM legal_archive;  -- 0
--
--   SELECT id, public FROM storage.buckets WHERE id = 'legal-archive';
--     -- legal-archive | f
-- ============================================================================
