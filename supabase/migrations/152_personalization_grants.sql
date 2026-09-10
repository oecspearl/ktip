-- ============================================================================
-- 152_personalization_grants.sql — close the cross-user hole in the ranker's plumbing
-- ============================================================================
-- 061 built the ranker out of two internal functions and two entry points. The
-- entry points (rank_content, get_personalized_feed) resolve the caller from
-- auth.uid() and are granted to authenticated. The internal pair was meant to be
-- unreachable from a client, and 061:569-572 tried to make it so with
--
--   REVOKE ALL ON FUNCTION personalization_bag(UUID) FROM PUBLIC;
--
-- That revokes the PUBLIC pseudo-role only. A Supabase project ships
-- ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated,
-- so every new function in public also carries a DIRECT grant to those two roles,
-- and REVOKE ... FROM PUBLIC leaves a direct grant untouched. 054 and 056 knew
-- this — both revoke FROM anon, authenticated by name — and 061 did not.
--
-- Why it matters: personalization_bag(p_user UUID) is SECURITY DEFINER and takes
-- an arbitrary user id. It returns that member's liked/followed/RSVP'd/applied
-- item ids, badges, country, roles, verified flag and preference picks. On a
-- stock project any signed-in member could call
--   select personalization_bag('<somebody else>')
-- and read another member's engagement history. 061's header claims neither
-- internal function takes a user id; the bag does. This file corrects the grant.
-- 061 itself is left as written — migrations are history, not a working copy.
--
-- personalization_contributions is a pure function of its arguments and leaks
-- nothing, but it is internal and gets the same treatment for consistency.
--
-- Idempotent — REVOKE of a grant that is not there is a no-op.

REVOKE ALL ON FUNCTION personalization_bag(UUID) FROM anon, authenticated;

REVOKE ALL ON FUNCTION personalization_contributions(
  JSONB, TEXT, UUID, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, NUMERIC) FROM anon, authenticated;

-- The entry points keep their grants from 061; restated so a reader of this file
-- alone sees the whole intended surface.
GRANT EXECUTE ON FUNCTION rank_content(TEXT, UUID[])         TO authenticated;
GRANT EXECUTE ON FUNCTION get_personalized_feed(INT, TEXT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
