-- ============================================================================
-- 151_email_in_use.sql — "is this address already an account?" for the signup form
-- ============================================================================
-- With email confirmation on, GoTrue's signUp() answers a taken address with a
-- fake user and no error, so nobody can tell the addresses apart. Good for the
-- attacker case; terrible for the member who typed their own address, got sent
-- to the code step, and waited for a code that will never come. The signup form
-- now asks this question the moment the email field is left, and marks the
-- field invalid with a link to log in instead.
--
-- Service role only, like every other lookup in 056. The edge route in front
-- of it (api/auth/email-available.ts) rate-limits per IP through
-- consume_auth_rate_limit before asking, which is the whole of the enumeration
-- defence: the question is answerable, but not quickly and not in bulk.
--
-- A verified alias counts as taken too. An alias is a second address on an
-- existing account (056), and signing up with it would strand the new account
-- behind login-alias, which resolves the address to the old one.

CREATE OR REPLACE FUNCTION email_in_use(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(p_email)
  ) OR EXISTS (
    SELECT 1 FROM user_email_aliases a
    WHERE lower(a.email) = lower(p_email) AND a.verified_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION email_in_use(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION email_in_use(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION email_in_use(TEXT) TO service_role;
