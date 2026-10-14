-- ============================================================================
-- 173_pin_profile_check_search_path.sql — new accounts can be created again
-- ============================================================================
-- Every signup since 162 has failed with "Database error saving new user"
-- (GoTrue) / "Database error creating new user" (admin API). The Postgres log
-- says why:
--
--   42883  function profile_section_keys() does not exist
--
-- 162 added CHECK (section_visibility_is_valid(section_visibility)) to
-- profiles. The validator calls profile_section_keys() unqualified, and
-- neither function pins a search_path, so the name is resolved against the
-- CALLER's search_path. A member editing their profile through PostgREST has
-- `public` on it and never noticed. A signup does not: on_auth_user_created
-- (handle_new_user) inserts the profile as supabase_auth_admin, whose
-- search_path is `auth`, so the CHECK raises and the whole auth.users INSERT
-- rolls back. No account, no profile, a 500 to the browser.
--
-- The fix pins search_path on both of 162's functions and qualifies the inner
-- call, so the answer no longer depends on who is asking. 169's
-- profile_social_links_valid() gets the same pin: it only calls built-ins
-- today, which resolve from pg_catalog on any path, but it sits on the same
-- INSERT and the next edit to it should not be able to reintroduce this.
--
-- Bodies are unchanged apart from the qualification. The CHECK constraints
-- reference the functions by OID and need no rebuild; existing rows were
-- valid before and are valid after.
--
-- Idempotent — safe to re-run. No client change.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.profile_section_keys()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'about', 'details', 'skills', 'interests', 'languages', 'open_to',
    'organisation', 'cv', 'standing', 'achievements', 'projects', 'events'
  ]::TEXT[];
$$;

CREATE OR REPLACE FUNCTION public.section_visibility_is_valid(p_sections JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_sections) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_sections) e
        WHERE NOT (e.key = ANY(public.profile_section_keys()))
           OR e.value NOT IN ('"public"'::JSONB, '"private"'::JSONB)
     );
$$;

ALTER FUNCTION public.profile_social_links_valid(JSONB) SET search_path = public;

-- ----------------------------------------------------------------------------
-- Verify (SQL editor). The first line reproduces the signup's search_path and
-- must return true; before this migration it raised 42883.
--
--   SET LOCAL search_path = auth;  SELECT public.section_visibility_is_valid('{"cv":"private"}');
--
--   SELECT proname, proconfig FROM pg_proc
--    WHERE proname IN ('profile_section_keys', 'section_visibility_is_valid', 'profile_social_links_valid');
--   -- each row: {search_path=public}
-- ----------------------------------------------------------------------------
