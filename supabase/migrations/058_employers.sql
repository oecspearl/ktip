-- ============================================================
-- Migration 058: Employers — a real employer entity
--
-- Until now "employer" was two unrelated things: the string 'private_sector'
-- inside profiles.roles, and profiles.organization — a free-text company name
-- typed at signup (041). Neither is an entity. Two people at the same company
-- produce two unlinked rows with two spellings, and nothing anywhere asserts
-- the company exists.
--
-- profiles.is_verified does NOT close that gap. It is person-level identity
-- KYC (035): an admin looked at someone's ID document — or just flipped the
-- toggle in the admin dashboard. It says nothing about their employer being a
-- real, registered business.
--
-- This migration adds that missing entity, with employer-scoped verification,
-- because api/partner/v1/employers.ts ships these rows to an external platform
-- and "verified" has to mean something there.
--
-- Address is a HIERARCHY rather than one free-text field: countries.code is the
-- stable root, and administrative_area -> locality -> address_line* hang off it.
-- profiles.country stays free text; this table does not inherit that mistake.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Countries — the root of the address hierarchy
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS countries (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  is_oecs_member BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 100,
  CONSTRAINT countries_code_uppercase CHECK (code = upper(code))
);

-- OECS members and associate members first (sort_order 10), then the countries
-- most likely to appear in the diaspora / partner set. Extend as needed — the
-- admin form reads this table, so an unseeded country simply cannot be picked.
INSERT INTO countries (code, name, is_oecs_member, sort_order) VALUES
  ('AG', 'Antigua and Barbuda', TRUE, 10),
  ('DM', 'Dominica', TRUE, 10),
  ('GD', 'Grenada', TRUE, 10),
  ('KN', 'Saint Kitts and Nevis', TRUE, 10),
  ('LC', 'Saint Lucia', TRUE, 10),
  ('VC', 'Saint Vincent and the Grenadines', TRUE, 10),
  ('AI', 'Anguilla', TRUE, 10),
  ('MS', 'Montserrat', TRUE, 10),
  ('VG', 'British Virgin Islands', TRUE, 10),
  ('MQ', 'Martinique', TRUE, 10),
  ('GP', 'Guadeloupe', TRUE, 10),
  ('BB', 'Barbados', FALSE, 50),
  ('TT', 'Trinidad and Tobago', FALSE, 50),
  ('JM', 'Jamaica', FALSE, 50),
  ('GY', 'Guyana', FALSE, 50),
  ('BS', 'Bahamas', FALSE, 50),
  ('BZ', 'Belize', FALSE, 50),
  ('SR', 'Suriname', FALSE, 50),
  ('HT', 'Haiti', FALSE, 50),
  ('DO', 'Dominican Republic', FALSE, 50),
  ('US', 'United States', FALSE, 100),
  ('CA', 'Canada', FALSE, 100),
  ('GB', 'United Kingdom', FALSE, 100),
  ('FR', 'France', FALSE, 100),
  ('DE', 'Germany', FALSE, 100),
  ('NL', 'Netherlands', FALSE, 100),
  ('IN', 'India', FALSE, 100),
  ('CN', 'China', FALSE, 100),
  ('BR', 'Brazil', FALSE, 100),
  ('ZA', 'South Africa', FALSE, 100),
  ('AU', 'Australia', FALSE, 100)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Countries are viewable by everyone" ON countries;
CREATE POLICY "Countries are viewable by everyone"
  ON countries FOR SELECT
  USING (TRUE);

-- No INSERT/UPDATE/DELETE policies: this is reference data, seeded by migration
-- and edited by the service role only.

-- ------------------------------------------------------------
-- Employers
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable, human-readable external identifier. The partner keys off `id`, but
  -- slug survives a re-import if we ever have to rebuild rows.
  slug TEXT NOT NULL UNIQUE,

  legal_name TEXT NOT NULL,
  trading_name TEXT,
  industry TEXT,
  website_url TEXT,
  logo_url TEXT,
  description TEXT,

  -- Address hierarchy, coarse -> fine.
  country_code CHAR(2) NOT NULL REFERENCES countries(code) ON UPDATE CASCADE,
  administrative_area TEXT,   -- parish / state / province / region
  locality TEXT,              -- city / town / village
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,

  -- Contact. Stored lowercased so the uniqueness/lookup story matches
  -- user_email_aliases (056); same reason for TEXT over CITEXT.
  contact_email TEXT NOT NULL,
  contact_email_verified_at TIMESTAMPTZ,
  contact_phone TEXT,

  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'revoked')),
  verification_method TEXT
    CHECK (verification_method IN ('document_review', 'registry_lookup', 'manual_attestation')),
  registration_number TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- INTERNAL reviewer commentary. Never exported. See src/lib/partner-payload.ts.
  verification_note TEXT,
  -- INTERNAL paths into the private verification-documents bucket (035).
  -- Never exported — the partner receives a COUNT, never a path or signed URL.
  document_paths TEXT[] NOT NULL DEFAULT '{}',
  -- Generated so the feed can report how much evidence exists WITHOUT ever
  -- selecting document_paths. Deriving the count in the mapper would mean
  -- pulling the paths into the edge function first, one typo away from a leak.
  document_count INT GENERATED ALWAYS AS (COALESCE(array_length(document_paths, 1), 0)) STORED,

  -- Consent gate for the outbound feed. Verified is not the same as
  -- willing-to-be-shared, and contact_email is real PII.
  share_externally BOOLEAN NOT NULL DEFAULT FALSE,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT employers_contact_email_lowercase CHECK (contact_email = lower(contact_email)),
  CONSTRAINT employers_contact_email_shape
    CHECK (contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(contact_email) <= 254),
  CONSTRAINT employers_slug_shape CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  -- A verified row must record HOW and WHEN. Prevents the "someone toggled a
  -- boolean" state that profiles.is_verified allows today.
  CONSTRAINT employers_verified_has_evidence
    CHECK (
      verification_status <> 'verified'
      OR (verified_at IS NOT NULL AND verification_method IS NOT NULL)
    )
);

-- One company per name per country. This is the duplicate-spelling problem that
-- free-text profiles.organization cannot solve.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employers_name_country
  ON employers (lower(legal_name), country_code);

-- Feed cursor: ordered by (updated_at, id), filtered on status + share flag.
CREATE INDEX IF NOT EXISTS idx_employers_feed
  ON employers (updated_at, id)
  WHERE verification_status = 'verified' AND share_externally = TRUE;

CREATE INDEX IF NOT EXISTS idx_employers_status
  ON employers (verification_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_employers_country
  ON employers (country_code, lower(legal_name));

DROP TRIGGER IF EXISTS set_employers_updated_at ON employers;
CREATE TRIGGER set_employers_updated_at
  BEFORE UPDATE ON employers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Employer members — links people to a company
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employer_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'recruiter'
    CHECK (role IN ('owner', 'admin', 'recruiter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_employer_members_user ON employer_members (user_id);

-- ------------------------------------------------------------
-- Verification audit trail
-- ------------------------------------------------------------
-- The platform has no audit_log table. For a status that decides whether a row
-- is shipped to a third party, "who changed it, from what, to what, when" has
-- to be recorded — otherwise a mistaken verification is untraceable.

CREATE TABLE IF NOT EXISTS employer_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  method TEXT,
  note TEXT,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employer_verification_events_employer
  ON employer_verification_events (employer_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_verification_events ENABLE ROW LEVEL SECURITY;

-- Verified employers are public, matching the directory's existing posture.
-- Unverified/rejected/revoked rows are visible only to their own members and
-- to OECS admins — a rejected application is not public information.
--
-- NOTE: RLS is column-blind, so a member reading their own row also reads
-- verification_note and document_paths. The outbound feed does not rely on RLS
-- for that boundary; it runs under the service role and selects an explicit
-- column list (see src/lib/partner-payload.ts).
DROP POLICY IF EXISTS "Verified employers are viewable by everyone" ON employers;
CREATE POLICY "Verified employers are viewable by everyone"
  ON employers FOR SELECT
  USING (
    verification_status = 'verified'
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employers.id AND m.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can create employers" ON employers;
CREATE POLICY "Admins can create employers"
  ON employers FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can update employers" ON employers;
CREATE POLICY "Admins can update employers"
  ON employers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can delete employers" ON employers;
CREATE POLICY "Admins can delete employers"
  ON employers FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- Deliberately NO member-facing UPDATE policy. If employers could edit their
-- own row, they could edit it after verification — and the feed would ship
-- attacker-controlled data under a verified badge. Self-service editing, when
-- it arrives, must reset verification_status; that belongs in an RPC, not a
-- blanket policy.

DROP POLICY IF EXISTS "Members and admins can view employer members" ON employer_members;
CREATE POLICY "Members and admins can view employer members"
  ON employer_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employer_members.employer_id AND m.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can manage employer members" ON employer_members;
CREATE POLICY "Admins can manage employer members"
  ON employer_members FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

DROP POLICY IF EXISTS "Admins can view verification events" ON employer_verification_events;
CREATE POLICY "Admins can view verification events"
  ON employer_verification_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

-- No INSERT/UPDATE/DELETE policies on the audit table. Rows are written only by
-- set_employer_verification() below, which is SECURITY DEFINER. An audit trail
-- an actor can rewrite is not an audit trail.

-- ------------------------------------------------------------
-- Verification transition
-- ------------------------------------------------------------
-- One statement, one transaction. src/hooks/useVerification.ts approves a
-- request and flips profiles.is_verified in two unguarded round-trips — a
-- failure between them leaves the two disagreeing. This does not repeat that.

CREATE OR REPLACE FUNCTION set_employer_verification(
  p_employer_id UUID,
  p_status TEXT,
  p_method TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_registration_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_from TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the role check has to be explicit here.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_actor AND 'oecs' = ANY(roles)) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('unverified', 'pending', 'verified', 'rejected', 'revoked') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid_status');
  END IF;

  IF p_status = 'verified' AND p_method IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'method_required');
  END IF;

  SELECT verification_status INTO v_from FROM employers WHERE id = p_employer_id FOR UPDATE;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  UPDATE employers SET
    verification_status = p_status,
    verification_method = CASE WHEN p_status = 'verified' THEN p_method ELSE verification_method END,
    registration_number = COALESCE(p_registration_number, registration_number),
    verification_note   = COALESCE(p_note, verification_note),
    verified_at = CASE WHEN p_status = 'verified' THEN v_now ELSE verified_at END,
    verified_by = CASE WHEN p_status = 'verified' THEN v_actor ELSE verified_by END,
    -- Losing verified status also withdraws the row from the outbound feed.
    -- Leaving share_externally on would be a silent no-op today and a leak the
    -- moment the feed's filter changes.
    share_externally = CASE WHEN p_status = 'verified' THEN share_externally ELSE FALSE END,
    updated_at = v_now
  WHERE id = p_employer_id;

  INSERT INTO employer_verification_events (employer_id, from_status, to_status, method, note, actor_id)
  VALUES (p_employer_id, v_from, p_status, p_method, p_note, v_actor);

  RETURN jsonb_build_object('ok', TRUE, 'from_status', v_from, 'to_status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION set_employer_verification(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- No backfill from profiles.organization.
-- ------------------------------------------------------------
-- It is tempting to seed this table from the free-text company names already in
-- profiles. Don't. Those strings are self-reported, unnormalised, and carry no
-- verification whatsoever; auto-creating rows would fill the source table of an
-- outbound feed with unchecked data one admin click away from being shipped.
-- Employers are curated in the admin UI and linked via employer_members.

NOTIFY pgrst, 'reload schema';
