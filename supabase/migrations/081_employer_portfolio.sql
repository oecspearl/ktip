-- ============================================================
-- Migration 081: Business profiles and portfolios
--
-- `employers` (058) has always been a fully-formed business entity — name,
-- logo, industry, website, description, country, verification — with no public
-- page, no portfolio, and no link from anyone's profile. The only two surfaces
-- that touched it were the Chamber submission form and the admin console, so a
-- verified SME on KTIP had nothing to show for itself: the member-facing
-- artifact was `resumes`, which is person-shaped and always will be.
--
-- This adds the missing half:
--   * employer_portfolio_items — the work a business wants to be judged on,
--   * a self-service editor for the *presentation* fields only,
--   * public read functions with an explicit column list.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Portfolio
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employer_portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  client_name TEXT,
  completed_on DATE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employer_portfolio_employer
  ON employer_portfolio_items (employer_id, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS set_employer_portfolio_updated_at ON employer_portfolio_items;
CREATE TRIGGER set_employer_portfolio_updated_at
  BEFORE UPDATE ON employer_portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Who may edit a business's own presentation. Registrant, or anyone the
-- business has added as owner/admin (058's employer_members).
CREATE OR REPLACE FUNCTION can_manage_employer(p_employer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM employers e WHERE e.id = p_employer_id AND e.created_by = p_user_id)
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = p_employer_id
        AND m.user_id = p_user_id
        AND m.role IN ('owner', 'admin')
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND 'oecs' = ANY(roles))
  );
$$;

ALTER TABLE employer_portfolio_items ENABLE ROW LEVEL SECURITY;

-- Public, but only once the Chamber has verified the business. An unverified
-- registration is a claim, not a credential, and its portfolio should not read
-- as one on a public page.
DROP POLICY IF EXISTS "Portfolios of verified businesses are public" ON employer_portfolio_items;
CREATE POLICY "Portfolios of verified businesses are public"
  ON employer_portfolio_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employers e
      WHERE e.id = employer_portfolio_items.employer_id
        AND e.verification_status = 'verified'
    )
    OR can_manage_employer(employer_id, auth.uid())
  );

DROP POLICY IF EXISTS "Business can manage its own portfolio" ON employer_portfolio_items;
CREATE POLICY "Business can manage its own portfolio"
  ON employer_portfolio_items FOR ALL
  USING (can_manage_employer(employer_id, auth.uid()))
  WITH CHECK (can_manage_employer(employer_id, auth.uid()));

-- ------------------------------------------------------------
-- 2. Self-service editing, without touching what was verified
-- ------------------------------------------------------------
-- 058 deliberately left `employers` with no member-facing UPDATE policy: a row
-- editable after verification would put attacker-controlled data behind a
-- verified badge, and 064 restated that this stays true. That reasoning applies
-- to what the Chamber actually checked — legal name, member state,
-- registration number, contact email — and not to how the business presents
-- itself. This RPC writes the presentation columns and nothing else, so the
-- blanket policy stays absent.
CREATE OR REPLACE FUNCTION update_my_employer_profile(
  p_employer_id UUID,
  p_description TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_industry TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL
)
RETURNS employers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row employers;
BEGIN
  IF NOT can_manage_employer(p_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the business can edit its own profile';
  END IF;

  UPDATE employers
  SET description = COALESCE(p_description, description),
      website_url = COALESCE(p_website_url, website_url),
      industry    = COALESCE(p_industry, industry),
      logo_url    = COALESCE(p_logo_url, logo_url)
  WHERE id = p_employer_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION update_my_employer_profile(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_employer_profile(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3. Public read, with an explicit column list
-- ------------------------------------------------------------
-- 058's "Verified employers are viewable by everyone" policy predates any
-- public surface and is column-blind, so it would hand a verified employer's
-- `verification_note` (internal reviewer commentary) and `document_paths`
-- (private bucket paths) to any reader the moment a public page existed. It is
-- withdrawn here and replaced by the functions below, which name their columns.
DROP POLICY IF EXISTS "Verified employers are viewable by everyone" ON employers;
CREATE POLICY "Employers are viewable by their own members and admins"
  ON employers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employers.id AND m.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
  );

CREATE OR REPLACE FUNCTION public_employer(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  legal_name TEXT,
  trading_name TEXT,
  industry TEXT,
  website_url TEXT,
  logo_url TEXT,
  description TEXT,
  country_code CHAR(2),
  locality TEXT,
  verification_status TEXT,
  verified_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.legal_name, e.trading_name, e.industry, e.website_url,
         e.logo_url, e.description, e.country_code, e.locality,
         e.verification_status, e.verified_at, e.created_by, e.created_at
  FROM employers e
  WHERE e.slug = p_slug
    AND (e.verification_status = 'verified' OR can_manage_employer(e.id, auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public_employer(TEXT) TO anon, authenticated;

-- The business a member belongs to, for the employer card on their profile.
CREATE OR REPLACE FUNCTION public_employer_for_user(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  legal_name TEXT,
  trading_name TEXT,
  industry TEXT,
  website_url TEXT,
  logo_url TEXT,
  description TEXT,
  country_code CHAR(2),
  locality TEXT,
  verification_status TEXT,
  verified_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.legal_name, e.trading_name, e.industry, e.website_url,
         e.logo_url, e.description, e.country_code, e.locality,
         e.verification_status, e.verified_at, e.created_by, e.created_at
  FROM employers e
  WHERE (
      e.created_by = p_user_id
      OR EXISTS (
        SELECT 1 FROM employer_members m
        WHERE m.employer_id = e.id AND m.user_id = p_user_id
      )
    )
    AND (e.verification_status = 'verified' OR can_manage_employer(e.id, auth.uid()))
  ORDER BY e.created_at
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_employer_for_user(UUID) TO anon, authenticated;

-- The directory's Businesses tab.
CREATE OR REPLACE FUNCTION list_public_employers(
  p_search TEXT DEFAULT NULL,
  p_country CHAR(2) DEFAULT NULL,
  p_limit INTEGER DEFAULT 48
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  legal_name TEXT,
  trading_name TEXT,
  industry TEXT,
  logo_url TEXT,
  description TEXT,
  country_code CHAR(2),
  portfolio_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.legal_name, e.trading_name, e.industry, e.logo_url,
         e.description, e.country_code,
         (SELECT count(*)::INTEGER FROM employer_portfolio_items i WHERE i.employer_id = e.id)
  FROM employers e
  WHERE e.verification_status = 'verified'
    AND (p_country IS NULL OR e.country_code = p_country)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR e.legal_name ILIKE '%' || p_search || '%'
      OR e.trading_name ILIKE '%' || p_search || '%'
      OR e.industry ILIKE '%' || p_search || '%'
    )
  ORDER BY e.legal_name
  LIMIT LEAST(COALESCE(p_limit, 48), 200);
$$;

GRANT EXECUTE ON FUNCTION list_public_employers(TEXT, CHAR, INTEGER) TO anon, authenticated;

-- Portfolio for a public page. RLS on the table already allows this read for a
-- verified business; the function exists so anonymous callers get a stable
-- ordering and the page has one thing to call.
CREATE OR REPLACE FUNCTION public_employer_portfolio(p_employer_id UUID)
RETURNS SETOF employer_portfolio_items
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT i.*
  FROM employer_portfolio_items i
  JOIN employers e ON e.id = i.employer_id
  WHERE i.employer_id = p_employer_id
    AND (e.verification_status = 'verified' OR can_manage_employer(e.id, auth.uid()))
  ORDER BY i.sort_order, i.completed_on DESC NULLS LAST, i.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public_employer_portfolio(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
