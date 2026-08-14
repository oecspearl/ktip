-- ============================================================
-- Migration 113: the registrant is on the roster, always
--
-- 111 backfilled employers.created_by into employer_members as 'owner' — once,
-- over the rows that existed at the time. Every organisation registered since
-- then (through /sme/verification or the admin console) has an employers row
-- carrying created_by and no roster row at all, which shows up as:
--
--   * /dashboard/team rendering "Nobody has been added yet" to the very person
--     who registered the organisation,
--   * the master switch governing an empty set, so flipping it does nothing,
--   * and no "Publishing organisation" block on the create/edit forms, because
--     useManagedEmployers reads my_employer_engagement(), which reads
--     employer_members.
--
-- Two fixes, because there were two mistakes.
--
--   1. The backfill becomes a trigger. A registrant is an owner from the moment
--      the row exists; that was always the intent and 111 only expressed it as
--      a one-off.
--
--   2. my_employer_engagement() reads created_by as well. It was the narrower
--      of the two membership tests while can_manage_employer (081) has accepted
--      registrant-or-roster since it was written — so the one person who is
--      guaranteed to exist was the one person the picker could not see. Making
--      the trigger alone would have papered over that for new rows and left it
--      wrong for anyone whose roster row is later removed.
--
-- The engagement RULE is unchanged. member_engagement_allowed() still reads
-- employer_members only, and deliberately: being the registrant of a company is
-- not the same as being staff subject to its policy, and the roster row the
-- trigger now writes is what puts a registrant under it.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catch up anything registered since 111 was applied
-- ------------------------------------------------------------

INSERT INTO employer_members (employer_id, user_id, role)
SELECT e.id, e.created_by, 'owner'
FROM employers e
WHERE e.created_by IS NOT NULL
ON CONFLICT (employer_id, user_id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. And keep it true from here on
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_employer_owner_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ON CONFLICT rather than a plain INSERT: the admin console can create an
  -- employer for someone who is already on another organisation's roster, and
  -- a re-registration must not raise 23505 at the user.
  INSERT INTO employer_members (employer_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (employer_id, user_id) DO NOTHING;

  RETURN NULL;  -- AFTER trigger; the return value is discarded
END;
$$;

DROP TRIGGER IF EXISTS seed_employer_owner_member_trigger ON employers;
CREATE TRIGGER seed_employer_owner_member_trigger
  AFTER INSERT ON employers
  FOR EACH ROW
  -- An employer can be created with no registrant at all from /admin/employers.
  -- Nothing to seed in that case, and the WHEN keeps the function off the path
  -- entirely rather than making it guard for NULL.
  WHEN (NEW.created_by IS NOT NULL)
  EXECUTE FUNCTION seed_employer_owner_member();

COMMENT ON FUNCTION seed_employer_owner_member() IS
  'Puts employers.created_by on the roster as owner. 111 did this as a one-off backfill; new registrations need it too, or the Team page and the publishing-organisation picker are both empty for the registrant.';

-- ------------------------------------------------------------
-- 3. The picker sees what can_manage_employer sees
--
-- Replaces 111's version. UNION, not UNION ALL: a registrant who also holds a
-- roster row must appear once, and the roster row wins because it carries the
-- real role — a registrant demoted to 'admin' by their own owners should read
-- as admin here, not be silently re-promoted by their created_by.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION my_employer_engagement()
RETURNS TABLE (
  employer_id UUID,
  legal_name TEXT,
  slug TEXT,
  member_role TEXT,
  allow_member_engagement BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.legal_name, e.slug, m.role, e.allow_member_engagement
  FROM employer_members m
  JOIN employers e ON e.id = m.employer_id
  WHERE m.user_id = auth.uid()

  UNION

  SELECT e.id, e.legal_name, e.slug, 'owner', e.allow_member_engagement
  FROM employers e
  WHERE e.created_by = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = e.id AND m.user_id = auth.uid()
    )

  ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION my_employer_engagement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_employer_engagement() TO authenticated;

-- ============================================================
-- Verification
--
--   -- Every organisation with a registrant now has an owner on its roster.
--   SELECT count(*) FROM employers e
--    WHERE e.created_by IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM employer_members m
--                      WHERE m.employer_id = e.id AND m.user_id = e.created_by);
--   -- 0
--
--   -- And a new registration seeds itself.
--   BEGIN;
--     INSERT INTO employers (slug, legal_name, country_code, contact_email, created_by)
--     VALUES ('trigger-probe-113', 'Trigger Probe', 'LC', 'probe113@example.com', '<uid>');
--     SELECT role FROM employer_members
--      WHERE employer_id = (SELECT id FROM employers WHERE slug = 'trigger-probe-113');
--     -- owner
--   ROLLBACK;
-- ============================================================

NOTIFY pgrst, 'reload schema';