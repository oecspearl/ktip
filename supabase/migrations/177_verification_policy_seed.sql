-- ============================================================
-- Migration 177: the OECS Commission domain, and the policy that explains it
--
-- 145 built the trusted-domain list and left it empty: nothing in the repo
-- adds oecs.int, so whether production trusts it depended on somebody having
-- typed it into /admin/verification. This makes it a fact of the schema.
--
-- Badge only (grants_role NULL). OECS staff keep whatever roles they chose;
-- supervisor and admin seats are still assigned by hand. Exact match: a
-- subdomain such as learning.oecs.int is not covered unless added separately.
--
-- ON CONFLICT DO NOTHING: if an administrator already added oecs.int, with a
-- different label or a role, their row stands.
--
-- Also registers the Verification Policy (src/lib/legal/verification.ts) in
-- 115's legal_documents register. Informational: published, never prompted.
--
-- Requires 145, 115. Idempotent — safe to re-run.
-- ============================================================

INSERT INTO trusted_email_domains (domain, label, grants_role, is_active, notes)
VALUES (
  'oecs.int',
  'OECS Commission',
  NULL,
  TRUE,
  'Seeded by migration 177. Badge only; staff roles are assigned separately.'
)
ON CONFLICT (domain) DO NOTHING;

INSERT INTO legal_documents (key, version, effective_date, bundle, is_current, title)
VALUES ('verification', 1, DATE '2026-11-02', 'informational', TRUE, 'Verification Policy')
ON CONFLICT (key, version) DO UPDATE SET
  effective_date = EXCLUDED.effective_date,
  is_current     = TRUE;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification
--
--   SELECT domain, label, grants_role, is_active
--   FROM trusted_email_domains WHERE domain = 'oecs.int';
--     -- oecs.int | OECS Commission | NULL | t   (or the admin's own row)
--
--   SELECT key, version, is_current FROM legal_documents WHERE key = 'verification';
--     -- verification | 1 | t
-- ============================================================
