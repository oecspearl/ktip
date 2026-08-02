-- ============================================================
-- Scope the client capability bootstrap to the active role
-- ============================================================
--
-- has_permission_as() has been the narrowing check since 063, but nothing ever
-- called it. get_my_permissions() returned the union of every role the account
-- holds, so switching context in the navbar moved a checkmark and changed
-- nothing else: an account acting as Investor kept the Administration link, the
-- grant-application entries, and every other capability its other roles carry.
--
-- has_permission_as() falls back to has_permission() when active_role IS NULL,
-- so the "All roles" context keeps the previous behaviour byte for byte, and it
-- can only ever narrow — a context that is not held cannot grant anything.
--
-- This is a rendering concern only. RLS policies still call has_permission(),
-- so switching context does not weaken any server-side boundary.

CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT pd.key FROM permission_definitions pd
    WHERE has_permission_as(auth.uid(), pd.key)
    ORDER BY pd.sort_order
  ), ARRAY[]::TEXT[]);
$$;

REVOKE ALL ON FUNCTION get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_permissions() TO authenticated;
