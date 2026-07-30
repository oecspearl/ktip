-- ============================================================
-- 025_proposals.sql
-- ============================================================
-- ============================================================
-- Migration 025: Proposals
-- Creates the proposals table backing the Proposal Wizard
-- (src/hooks/useProposals.ts, src/hooks/useShareProposal.ts,
--  src/pages/proposals/SharedProposalPage.tsx)
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('funding', 'project', 'research', 'business')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  proposal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  share_token UUID,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- share_token is generated client-side via crypto.randomUUID() (useShareProposal.ts)
-- and looked up with .eq('share_token', t).single() — must be unique.
-- Multiple NULLs are allowed under a UNIQUE constraint (unshared proposals).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_share_token_key'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_share_token_key UNIQUE (share_token);
  END IF;
END $$;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD
DROP POLICY IF EXISTS "Users can view own proposals" ON proposals;
CREATE POLICY "Users can view own proposals"
  ON proposals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own proposals" ON proposals;
CREATE POLICY "Users can create own proposals"
  ON proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own proposals" ON proposals;
CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own proposals" ON proposals;
CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE
  USING (auth.uid() = user_id);

-- Public: unauthenticated visitors can read a proposal once it has been
-- shared (share_token set). SharedProposalPage.tsx / useSharedProposal()
-- queries `select('*').eq('share_token', t).single()` with no auth
-- required, so the row must be readable by the anon role.
DROP POLICY IF EXISTS "Anyone can view shared proposals" ON proposals;
CREATE POLICY "Anyone can view shared proposals"
  ON proposals FOR SELECT
  USING (share_token IS NOT NULL);

-- ============================================================
-- updated_at trigger (reuses update_updated_at_column() from 001)
-- ============================================================

DROP TRIGGER IF EXISTS set_proposals_updated_at ON proposals;
CREATE TRIGGER set_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 079_project_join_requests.sql
-- ============================================================
-- ============================================================
-- Migration 079: Request to collaborate on a project
--
-- Until now project_members was owner-push only: the INSERT policy in 031
-- requires is_project_owner() AND user_id <> auth.uid(), so a member could not
-- ask to join even if the UI offered a button — Postgres refused the row.
-- This adds the requester-initiated half, modelled on document_access_requests
-- (048), which is the same knock-on-the-door shape.
--
-- Also here, because they are the same feature from the visitor's side:
--   * a public team roster + count (project_members SELECT is members-only, so
--     a visitor could not see who is on a project or how many),
--   * the missing column guard on the 031 UPDATE policy, which let an invitee
--     promote themselves to 'editor' while accepting.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_join_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_join_requests_project
  ON project_join_requests(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_join_requests_requester
  ON project_join_requests(requester_id, created_at DESC);

-- One open request per (project, requester). A denied request may be retried;
-- a pending one may not be duplicated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_join_requests_one_pending
  ON project_join_requests(project_id, requester_id) WHERE status = 'pending';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE project_join_requests ENABLE ROW LEVEL SECURITY;

-- The requester sees their own; the owner sees requests on their projects.
DROP POLICY IF EXISTS "Requester and owner can see join requests" ON project_join_requests;
CREATE POLICY "Requester and owner can see join requests"
  ON project_join_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR is_project_owner(project_id, auth.uid())
  );

-- Anyone signed in may ask, on their own behalf, for a project they can see.
-- Not the owner (nothing to ask for) and not an existing accepted member.
DROP POLICY IF EXISTS "Members can request to collaborate" ON project_join_requests;
CREATE POLICY "Members can request to collaborate"
  ON project_join_requests FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND NOT is_project_owner(project_id, auth.uid())
    AND NOT is_project_member(project_id, auth.uid())
  );

-- Deciding goes through the RPC below, which is SECURITY DEFINER; this policy
-- exists so an owner can still deny directly if they ever need to.
DROP POLICY IF EXISTS "Owner can decide join requests" ON project_join_requests;
CREATE POLICY "Owner can decide join requests"
  ON project_join_requests FOR UPDATE
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (is_project_owner(project_id, auth.uid()));

-- The requester can withdraw while it is still pending.
DROP POLICY IF EXISTS "Requester can withdraw a join request" ON project_join_requests;
CREATE POLICY "Requester can withdraw a join request"
  ON project_join_requests FOR DELETE
  USING (requester_id = auth.uid() AND status = 'pending');

-- ============================================================
-- Approving writes the membership and closes the request together, so the
-- client cannot leave the two out of sync. Same contract as
-- decide_document_access_request (048).
--
-- An approved requester joins as 'viewer'. Promotion to 'editor' stays an
-- explicit, separate act by the owner in Manage team — accepting someone into
-- the room is not the same decision as handing them the pen.
-- ============================================================
CREATE OR REPLACE FUNCTION decide_project_join_request(
  p_request_id UUID,
  p_approve BOOLEAN
)
RETURNS project_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request project_join_requests;
BEGIN
  SELECT * INTO v_request FROM project_join_requests WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT is_project_owner(v_request.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the project owner can decide join requests';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  IF p_approve THEN
    INSERT INTO project_members (project_id, user_id, role, status, invited_by)
    VALUES (v_request.project_id, v_request.requester_id, 'viewer', 'accepted', auth.uid())
    ON CONFLICT (project_id, user_id)
      DO UPDATE SET status = 'accepted', updated_at = now();
  END IF;

  UPDATE project_join_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION decide_project_join_request(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_project_join_request(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- Public team size.
--
-- project_members SELECT is owner-or-member only, so a visitor counting rows
-- gets 0 — which is why no project ever showed a team size. Denormalised onto
-- projects rather than exposed through a per-row RPC, so a list of 24 cards
-- stays one query instead of 24.
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_project_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  UPDATE projects
  SET member_count = (
    SELECT COUNT(*) FROM project_members
    WHERE project_id = v_project_id AND status = 'accepted'
  )
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_project_member_count ON project_members;
CREATE TRIGGER sync_project_member_count
  AFTER INSERT OR UPDATE OR DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION sync_project_member_count();

-- Backfill for everything that existed before the trigger.
UPDATE projects p
SET member_count = COALESCE((
  SELECT COUNT(*) FROM project_members pm
  WHERE pm.project_id = p.id AND pm.status = 'accepted'
), 0);

-- ============================================================
-- Public team roster.
--
-- Same problem as the count, but the roster cannot be denormalised. Bypasses
-- RLS deliberately and exposes only what the public profile already shows, and
-- only for a project the caller can actually see.
-- ============================================================
CREATE OR REPLACE FUNCTION get_project_team(p_project_id UUID)
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  display_name TEXT,
  avatar_url TEXT,
  country TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pm.user_id, pm.role, pr.display_name, pr.avatar_url, pr.country
  FROM project_members pm
  JOIN profiles pr ON pr.id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND pm.status = 'accepted'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
        AND (p.is_public OR p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
    )
  ORDER BY pm.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_project_team(UUID) TO anon, authenticated;

-- ============================================================
-- Column guard for project_members.
--
-- 031's UPDATE policy has no WITH CHECK and RLS cannot restrict columns, so an
-- invitee accepting an invitation could set role = 'editor' in the same
-- statement. Same fix, same shape as guard_share_recipient_update (053).
-- ============================================================
CREATE OR REPLACE FUNCTION guard_project_member_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The owner may change anything; only the member themself is constrained.
  IF is_project_owner(OLD.project_id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id THEN
    IF NEW.role       IS DISTINCT FROM OLD.role
       OR NEW.user_id    IS DISTINCT FROM OLD.user_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
      RAISE EXCEPTION 'Members may only change the status of their own membership';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_member_update ON project_members;
CREATE TRIGGER guard_project_member_update
  BEFORE UPDATE ON project_members
  FOR EACH ROW EXECUTE FUNCTION guard_project_member_update();

-- ============================================================
-- Notification preferences.
--
-- 036's type -> category map falls through to TRUE for unknown types, so a new
-- type that is not listed bypasses the member's preferences entirely. Restated
-- in full (last full restatement: 054) with the two join-request types folded
-- into 'projects'.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_enabled BOOLEAN;
BEGIN
  SELECT CASE
    WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share',
                      'snippet_share', 'collab_invite', 'invite_accepted',
                      'document_access_request', 'document_access_result') THEN collaboration
    WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow',
                      'project_join_request', 'project_join_result') THEN projects
    WHEN NEW.type IN ('connection_request', 'connection_accepted') THEN connections
    WHEN NEW.type IN ('message') THEN messages
    WHEN NEW.type IN ('event_reminder', 'event_update') THEN events
    WHEN NEW.type IN ('forum_reply') THEN forums
    ELSE TRUE
  END
  INTO category_enabled
  FROM notification_preferences
  WHERE user_id = NEW.user_id;

  IF category_enabled = FALSE THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 081_employer_portfolio.sql
-- ============================================================
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

-- ============================================================
-- 083_profile_visibility.sql
-- ============================================================
-- ============================================================
-- Migration 083: Profile visibility (public / private)
--
-- A member can now close their profile. Private means: only an
-- accepted connection sees the detail, and only an accepted
-- connection can open a direct message. Everyone still sees the
-- teaser — name, avatar, roles, country — because a member who
-- cannot be found cannot be asked, and the whole point of the
-- request flow is that it is possible to send one.
--
-- The request mechanism is the connections table (033). There is
-- no separate "profile access request": accepting a connection is
-- the grant. One inbox, one state machine, nothing new to learn.
--
-- 1. profiles.profile_visibility — 'public' | 'private'
-- 2. can_view_profile(uuid)      — the gate
-- 3. can_dm(uuid, uuid)          — the messaging gate
-- 4. get_profile_view(uuid)      — teaser always, detail when allowed
-- 5. conversation_participants INSERT policy — enforces can_dm
-- 6. public_resume() — a private member's CV follows the profile
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_profile_visibility_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_profile_visibility_check
      CHECK (profile_visibility IN ('public', 'private'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.profile_visibility IS
  'public = any signed-in member sees the full profile and may DM. private = connections only. Not enforced by RLS on this table (see get_profile_view) because profile rows are embedded across the schema.';

-- The guard trigger from 063 is a denylist, so this column is
-- self-editable without any further change.

-- ============================================================
-- The gate. Deliberately FALSE for anonymous callers: /u/:id is a
-- protected route now, and a signed-out visitor has no identity to
-- be connected to.
-- ============================================================
CREATE OR REPLACE FUNCTION can_view_profile(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
  v_viewer UUID := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_viewer = p_user_id THEN
    RETURN TRUE;
  END IF;
  IF v_viewer IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Moderation has to keep working on a closed profile, or going
  -- private becomes a way to hide from a grievance report.
  IF is_platform_admin(v_viewer) THEN
    RETURN TRUE;
  END IF;

  SELECT profile_visibility INTO v_visibility
  FROM profiles WHERE id = p_user_id;

  IF v_visibility IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = v_viewer AND c.addressee_id = p_user_id) OR
        (c.requester_id = p_user_id AND c.addressee_id = v_viewer)
      )
  );
END;
$$;

-- ============================================================
-- The messaging gate. Same rule, expressed for an explicit pair so
-- it can be called from an RLS policy where auth.uid() is the
-- sender and the row being inserted names the recipient.
-- ============================================================
CREATE OR REPLACE FUNCTION can_dm(p_sender UUID, p_recipient UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
BEGIN
  IF p_sender IS NULL OR p_recipient IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_sender = p_recipient THEN
    RETURN TRUE;
  END IF;

  SELECT profile_visibility INTO v_visibility
  FROM profiles WHERE id = p_recipient;

  IF v_visibility IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM connections c
    WHERE c.status = 'accepted'
      AND (
        (c.requester_id = p_sender AND c.addressee_id = p_recipient) OR
        (c.requester_id = p_recipient AND c.addressee_id = p_sender)
      )
  );
END;
$$;

-- ============================================================
-- The read path for a member page. Returns the teaser unconditionally
-- and NULLs the detail when the viewer is not allowed it, so the UI
-- can render one shape and decide what to show from can_view rather
-- than juggling a missing row against a private one.
--
-- No row at all for a suspended account, matching get_profile_stats.
-- ============================================================
DROP FUNCTION IF EXISTS get_profile_view(UUID);
CREATE FUNCTION get_profile_view(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  roles TEXT[],
  country TEXT,
  is_verified BOOLEAN,
  created_at TIMESTAMPTZ,
  profile_visibility TEXT,
  can_view BOOLEAN,
  bio TEXT,
  skills TEXT[],
  interests TEXT[],
  open_to TEXT[],
  organization TEXT,
  industry TEXT,
  phone TEXT,
  website TEXT,
  languages TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_allowed := can_view_profile(p_user_id);

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.roles,
    p.country,
    p.is_verified,
    p.created_at,
    p.profile_visibility,
    v_allowed,
    CASE WHEN v_allowed THEN p.bio END,
    CASE WHEN v_allowed THEN p.skills END,
    CASE WHEN v_allowed THEN p.interests END,
    CASE WHEN v_allowed THEN p.open_to END,
    CASE WHEN v_allowed THEN p.organization END,
    CASE WHEN v_allowed THEN p.industry END,
    CASE WHEN v_allowed THEN p.phone END,
    CASE WHEN v_allowed THEN p.website END,
    CASE WHEN v_allowed THEN p.languages END
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.id = auth.uid() OR NOT is_suspended(p.id));
END;
$$;

REVOKE ALL ON FUNCTION can_view_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_dm(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_profile_view(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION can_view_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_dm(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_view(UUID) TO authenticated;

-- ============================================================
-- Messaging. Restates the policy from 064 in full — every existing
-- clause is preserved — and adds the private-profile gate.
--
-- The gate is on joining a thread, not on sending into one. A member
-- who goes private keeps the conversations they already have; the
-- alternative is severing live threads as a side effect of a
-- settings toggle, which nobody would predict from the wording.
-- Group threads are unchanged: membership there is decided by the
-- group's admin, not by each member's profile setting.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      OR is_conversation_creator(conversation_id, auth.uid())
      OR is_conversation_admin(conversation_id, auth.uid())
    )
    AND (
      -- Safeguarding (064): a 1-to-1 thread may never hold a student.
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR (
        NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = conversation_participants.user_id AND 'student' = ANY(p.roles)
        )
        AND NOT conversation_has_student(conversation_id)
      )
    )
    AND (
      -- Privacy (083): a private member is reachable only by a connection.
      EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.is_group)
      OR can_dm(auth.uid(), conversation_participants.user_id)
    )
  );

-- ============================================================
-- A published CV follows the profile it belongs to. Public member:
-- still opens for a signed-out visitor, which is the entire point of
-- a CV link. Private member: connections only.
-- ============================================================
CREATE OR REPLACE FUNCTION public_resume(p_user UUID, p_template TEXT DEFAULT 'viridion')
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', r.template,
    'data', r.data,
    'updated_at', r.updated_at,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )
  FROM resumes r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user
    AND r.template = p_template
    AND r.is_public = TRUE
    AND NOT is_suspended(r.user_id)
    AND (p.profile_visibility = 'public' OR can_view_profile(r.user_id))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public_resume(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resume(UUID, TEXT) TO anon, authenticated, service_role;

