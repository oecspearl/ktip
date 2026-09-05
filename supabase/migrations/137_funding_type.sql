-- ============================================================
-- Migration 137: a funding call names its instrument
--
-- Reported on /grants and /admin/grants: "grant" is one instrument among
-- several, and the people who publish calls here also run venture, angel and
-- private-equity windows. The form offered them one word for all of it.
--
-- grant_type (003) is NOT that axis and is left alone -- its values are
-- startup / research / innovation / development / education, which describe
-- what the money is FOR. They also drive the hero imagery (hero-images.ts)
-- and the personalization preferences members have already saved, so
-- overloading the column would have silently rewritten both. The instrument
-- gets a column of its own.
--
-- NOT NULL DEFAULT 'grant': every call has an instrument, so the listing page
-- never needs an "unspecified" bucket, and every row that predates this
-- migration really was posted as a grant.
--
-- Idempotent -- safe to re-run.
-- ============================================================

ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS funding_type TEXT NOT NULL DEFAULT 'grant';

-- Restated rather than declared inline so a re-run repairs a constraint that
-- was dropped or added with an older value list.
ALTER TABLE grants DROP CONSTRAINT IF EXISTS grants_funding_type_check;
ALTER TABLE grants
  ADD CONSTRAINT grants_funding_type_check
  CHECK (funding_type IN (
    'grant',
    'venture_capital',
    'angel',
    'private_equity',
    'debt',
    'convertible',
    'prize',
    'in_kind',
    'blended',
    'other'
  ));

COMMENT ON COLUMN grants.funding_type IS
  'The instrument on offer -- grant, venture capital, angel, etc. Distinct from grant_type, which is the focus area.';

-- The listing page filters and groups on it.
CREATE INDEX IF NOT EXISTS idx_grants_funding_type ON grants(funding_type);

NOTIFY pgrst, 'reload schema';
