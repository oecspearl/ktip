-- ============================================================================
-- 164_session_bootstrap.sql — a signed-in page load asks once, not six times
-- ============================================================================
-- Every signed-in cold load made these calls from AuthContext before the page
-- could do anything else:
--
--   profiles select        (ProtectedRoute holds the splash until it lands)
--   get_my_permissions     (099)
--   get_my_consents        (115)
--   ensure_my_minor_status (091)  \
--   ensure_my_consent_state (115)  > after the profile, to compare against it
--   ensure_my_mfa_status   (150)  /
--
-- Each carries apikey + authorization, so each also costs a CORS preflight:
-- twelve requests over two serial levels. When an ensure_* call corrected a
-- stale flag, the profile was fetched a second time.
--
-- This runs the three housekeeping functions FIRST, so the profile it then
-- reads already carries their corrections, and returns profile, permissions
-- and consents in one JSON object. The client seeds its existing query keys
-- from it, so no consumer changes.
--
-- SECURITY INVOKER on purpose: every function it calls is already scoped to
-- auth.uid() and carries its own privileges (the ensure_* functions are
-- SECURITY DEFINER), and the profile read goes through the ordinary RLS on
-- profiles. Nothing here widens what the caller could already read.
--
-- `profile` is null when the row does not exist yet. The client then takes
-- its old path, which creates the row (the pre-trigger accounts case).
--
-- VOLATILE, not STABLE: the ensure_* functions write.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_session_bootstrap()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Their results are what the client used to compare against the profile;
  -- the profile read below sees the writes directly, so they are discarded.
  -- A failure in one must not cost the member their page load, which is the
  -- same rule the client applied: these columns are UI hints, and every check
  -- that has to be right is made server-side.
  BEGIN PERFORM ensure_my_minor_status();  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM ensure_my_consent_state(); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM ensure_my_mfa_status();    EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'profile',     (SELECT to_jsonb(p) FROM profiles p WHERE p.id = v_uid),
    'permissions', to_jsonb(coalesce(get_my_permissions(), ARRAY[]::TEXT[])),
    'consents',    coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM get_my_consents() c), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_session_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_session_bootstrap() TO authenticated;

NOTIFY pgrst, 'reload schema';
