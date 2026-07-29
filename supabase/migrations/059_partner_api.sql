-- ============================================================
-- Migration 059: Partner API — machine authentication + access log
--
-- Every existing /api route authenticates a HUMAN: Bearer JWT -> auth.getUser()
-- -> profiles.roles.includes('oecs'). There is no way for another SYSTEM to
-- call us. api/partner/v1/employers.ts needs exactly that, so this introduces
-- the pattern rather than bending the human one.
--
-- Static API keys, hashed at rest. The plaintext key exists for the length of
-- one HTTP response at issuance and is never stored, logged, or recoverable —
-- a leaked database dump yields SHA-256 digests, not working credentials.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- API clients
-- ------------------------------------------------------------
-- Key format: ktip_<12-char prefix>_<43-char base64url secret>
--
-- The prefix is stored in the clear and is what we look up by. Without it,
-- authentication would mean scanning every row and hashing per candidate; with
-- it, the lookup is a single index hit and the prefix doubles as the display
-- label in the admin UI ("ktip_a1b2c3d4e5f6…").

CREATE TABLE IF NOT EXISTS api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  -- e.g. {'employers:read'}. Scopes are checked at authentication time, so a
  -- key minted for one feed cannot read a future one.
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_clients_prefix_shape CHECK (key_prefix ~ '^ktip_[a-z0-9]{12}$'),
  CONSTRAINT api_clients_hash_shape CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_api_clients_active
  ON api_clients (created_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY;
-- Deliberately zero policies, the same posture as auth_rate_limits (056). With
-- RLS on and no policy, anon and authenticated see nothing at all; only the
-- service role touches this table. A key hash is not something a signed-in user
-- should ever be able to SELECT, however narrow the policy.

-- ------------------------------------------------------------
-- Access log
-- ------------------------------------------------------------
-- This codebase has no audit trail anywhere. For an endpoint whose entire
-- purpose is handing member PII to a third party, "who pulled what, and when"
-- is the difference between answering a data-protection question and guessing.

CREATE TABLE IF NOT EXISTS api_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  status INT NOT NULL,
  record_count INT NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_access_log_client
  ON api_access_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_log_created
  ON api_access_log (created_at DESC);

ALTER TABLE api_access_log ENABLE ROW LEVEL SECURITY;
-- Zero policies, service role only — same reasoning. Reads happen in the SQL
-- editor or via a future admin endpoint, never from the browser.

-- ------------------------------------------------------------
-- Authentication
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION authenticate_api_client(
  p_prefix TEXT,
  p_hash TEXT,
  p_scope TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c api_clients%ROWTYPE;
BEGIN
  SELECT * INTO c FROM api_clients WHERE key_prefix = p_prefix;

  -- One uniform failure for unknown prefix, wrong secret, revoked key, and
  -- missing scope. Distinguishing them would tell a prober which of their
  -- guesses was a real client, and whether a key they hold has merely lost a
  -- scope rather than been revoked outright.
  IF c.id IS NULL
     OR c.revoked_at IS NOT NULL
     OR c.key_hash <> p_hash
     OR NOT (p_scope = ANY(c.scopes))
  THEN
    RETURN jsonb_build_object('ok', FALSE);
  END IF;

  UPDATE api_clients SET last_used_at = now() WHERE id = c.id;

  RETURN jsonb_build_object('ok', TRUE, 'client_id', c.id, 'name', c.name);
END;
$$;

REVOKE ALL ON FUNCTION authenticate_api_client(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION authenticate_api_client(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION authenticate_api_client(TEXT, TEXT, TEXT) TO service_role;
-- service_role ONLY, for the same reason resolve_email_alias() is (056): the
-- function reveals whether a given prefix/hash pair is live. Never grant it to
-- anon or authenticated.

NOTIFY pgrst, 'reload schema';
