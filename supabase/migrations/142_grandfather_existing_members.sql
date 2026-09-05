-- ============================================================
-- Migration 142: the gate applies to new members, not to the pilot cohort
--
-- 139 withheld publishing and applying until an admin approves the account. It
-- applied to everyone at once, including the 36 unverified members already on
-- the platform — who lost posting, applying, forums and messaging the moment it
-- was applied, with no queue staffed to give it back.
--
-- That is not what the gate is for. It exists so an unverified STRANGER cannot
-- reach real members and real money. The people already here arrived through a
-- pilot, are known to OECS, and were never told an identity check was coming.
-- Locking them out to enforce a rule written after they joined is a punishment
-- for being early.
--
-- So: everyone who existed before 139 was applied is grandfathered. Everyone
-- who signs up after it goes through the queue.
--
-- THE CUTOFF IS A LITERAL, and deliberately. now() would grandfather whoever
-- happened to sign up between the gate landing and this file running, and would
-- mean something different on every environment it is applied to. This is the
-- exact moment 139 was recorded in schema_migrations on production.
--
-- WHAT THIS DOES NOT DO. It does not record that any documents were checked,
-- because none were. A grandfathered account is indistinguishable from a
-- reviewed one afterwards — both simply read is_verified = TRUE. If that
-- distinction ever needs to survive (an audit, a funder asking what "verified"
-- means on this platform), it needs a column of its own, and adding one later
-- cannot recover which of the two any given account was.
--
-- Idempotent — safe to re-run. Re-running verifies nobody new: the cutoff is
-- fixed, and accounts created after it are untouched however many times it runs.
-- ============================================================

UPDATE profiles
SET is_verified = TRUE
WHERE created_at < TIMESTAMPTZ '2026-09-05 02:56:56.086+00'
  AND COALESCE(is_verified, FALSE) = FALSE;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   -- nobody who predates the gate is left behind it
--   SELECT count(*) FROM profiles
--    WHERE created_at < TIMESTAMPTZ '2026-09-05 02:56:56.086+00'
--      AND NOT is_verified;                                      -- 0
--
--   -- and a grandfathered member can act again
--   SELECT has_permission('<any pilot member uuid>', 'grant:apply');   -- t
-- ============================================================
