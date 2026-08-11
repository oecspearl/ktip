-- Migration 110: six ecosystem organisation roles, matrix revisions, and the
-- removal of the student grant-application safeguard.
--
-- Three separate things, landed together because they are one policy decision
-- taken from the same RBAC review.
--
-- 1. SIX NEW ROLES. Roadmap Table 3 names actors the platform had no slug for:
--    NGOs, business support organisations, research institutions, government
--    ministries, diaspora networks and inter-governmental bodies. Until now
--    each of them signed up as `private_sector` or `investor` and was described
--    by neither. All six are organisation-tier and review-gated; none carries
--    org:manage, members:manage or role:manage. `igo` in particular is NOT an
--    administrator: its real-world referent is the OECS Commission, which also
--    staffs super_admin, and keeping the funder role apart from the operator
--    role is the whole reason it is a separate slug.
--
--    The review proposed `post_secondary` alongside these. It is landed here as
--    `research_institution` instead: schools and universities are already
--    `educational_partner`, and a second slug for the same institution would
--    have split the student-approval path in two.
--
-- 2. ELEVEN REVISED CELLS on existing roles. Unlike the seed below, these are
--    written with an explicit UPDATE, because ON CONFLICT DO NOTHING cannot
--    move a row that 063 already created. That means this migration DOES
--    overwrite an admin's hand-tuning of those eleven cells — deliberately. It
--    is a policy change, not a re-run. Every write is captured by the
--    log_role_permission_change trigger.
--
-- 3. THE STUDENT GRANT SAFEGUARD IS REMOVED. This is the consequential one.
--    Until now a student could draft a grant application but never submit it:
--    063's has_permission() denied `grant:apply` outright, and 064's
--    enforce_grant_application_sponsor() independently required an accepted
--    faculty sponsor before any student application could leave 'draft'. Both
--    gates come off here, so students submit their own applications.
--
--    The sponsor machinery is NOT deleted — sponsor_id, sponsor_approved_at and
--    review_grant_sponsorship() all stay, and the nomination flow keeps
--    working. It becomes an optional faculty endorsement rather than a
--    precondition.
--
--    The MESSAGING safeguard is untouched. dm:initiate is still denied to
--    students in has_permission(), so unmonitored one-to-one contact between an
--    adult and a minor stays unrepresentable, and dm:receive stays granted so
--    supervised group channels keep working. grant:manage_funds, moderation:action
--    and moderation:escalate also stay denied.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. Role catalog
-- ============================================================

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('ngo', 'Non-Governmental Organization', 'organization', 'Civil-society organisation delivering programmes. Runs projects and events, applies for funding, contributes knowledge.', FALSE, TRUE, NULL, 72),
  ('bso', 'Business Support Organization', 'organization', 'Incubator, accelerator or MSME support agency. Mentors founders, hosts programmes, channels funding to its cohort.', FALSE, TRUE, NULL, 73),
  ('research_institution', 'Research Institution', 'organization', 'Research body and academic partner. Publishes knowledge, co-hosts events, sponsors and supervises the students attached to its programmes.', FALSE, TRUE, NULL, 74),
  ('government', 'Government Ministry / Agency', 'organization', 'Policy enabler and programme administrator. Publishes public funding calls, administers awards, verifies institutions and businesses.', FALSE, TRUE, NULL, 75),
  ('diaspora', 'Diaspora Association / Network', 'organization', 'Reconnects overseas expertise with the home market. Mentors, funds, judges challenges and connects talent.', FALSE, TRUE, NULL, 76),
  ('igo', 'Inter-governmental Regional Organization', 'organization', 'Regional body such as the OECS Commission. Strategic partner and ecosystem facilitator; funds and convenes without administering the platform.', FALSE, TRUE, NULL, 77)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. grant:apply is no longer a safeguard permission
--
-- is_safeguard is what renders the cell locked and shielded at /admin/roles.
-- Leaving it TRUE while has_permission() no longer denies the key would show
-- administrators a lock that does not exist.
-- ============================================================

UPDATE permission_definitions
SET label = 'Apply for grants',
    description = 'Submit grant applications.',
    is_safeguard = FALSE
WHERE key = 'grant:apply';

-- ============================================================
-- 3. Default matrix
--
-- Restated in full rather than as a delta: this one function is what both the
-- seed below and "Reset to defaults" at /admin/roles read, so a partial body
-- would silently drop every role it omitted. Mirrors DEFAULT_ROLE_PERMISSIONS
-- in src/lib/permissions.ts.
-- ============================================================

CREATE OR REPLACE FUNCTION default_role_permissions()
RETURNS TABLE (role_slug TEXT, permission_key TEXT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  -- Super Admin holds everything, including permissions added later.
  SELECT 'super_admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
    -- The verification keys are new here. A safety admin is first-line receipt
    -- for every complaint, and a complaint about a body claiming to be a school
    -- or a chamber-verified business is answered by looking at that claim.
    ('safety_admin', 'audit:view'),
    ('safety_admin', 'moderation:view'),
    ('safety_admin', 'moderation:action'),
    ('safety_admin', 'moderation:escalate'),
    ('safety_admin', 'grant:view'),
    ('safety_admin', 'forum:post'),
    ('safety_admin', 'forum:comment'),
    ('safety_admin', 'dm:initiate'),
    ('safety_admin', 'dm:receive'),
    ('safety_admin', 'dm:supervise'),
    ('safety_admin', 'sme:verify'),
    ('safety_admin', 'institution:verify'),
    ('safety_admin', 'institution:approve_students'),

    ('investor', 'grant:view'),
    ('investor', 'grant:post'),
    ('investor', 'grant:manage_funds'),
    ('investor', 'forum:post'),
    ('investor', 'forum:comment'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('sme', 'grant:view'),
    ('sme', 'grant:apply'),
    ('sme', 'project:create'),
    ('sme', 'project:manage'),
    ('sme', 'event:create'),
    ('sme', 'forum:post'),
    ('sme', 'forum:comment'),
    ('sme', 'mentorship:offer'),
    ('sme', 'dm:initiate'),
    ('sme', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'mentorship:offer'),
    ('private_sector', 'dm:initiate'),
    ('private_sector', 'dm:receive'),

    ('educational_partner', 'institution:approve_students'),
    ('educational_partner', 'grant:view'),
    ('educational_partner', 'grant:apply'),
    ('educational_partner', 'grant:sponsor'),
    ('educational_partner', 'project:create'),
    ('educational_partner', 'project:manage'),
    ('educational_partner', 'event:create'),
    ('educational_partner', 'forum:post'),
    ('educational_partner', 'forum:comment'),
    ('educational_partner', 'dm:initiate'),
    ('educational_partner', 'dm:receive'),
    ('educational_partner', 'dm:supervise'),

    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'dm:initiate'),
    ('chamber_admin', 'dm:receive'),

    -- Delivery organisations. They run the programme rather than fund it, so
    -- they apply for money and never post it.
    ('ngo', 'grant:view'),
    ('ngo', 'grant:apply'),
    ('ngo', 'project:create'),
    ('ngo', 'project:manage'),
    ('ngo', 'event:create'),
    ('ngo', 'forum:post'),
    ('ngo', 'forum:comment'),
    ('ngo', 'mentorship:offer'),
    ('ngo', 'dm:initiate'),
    ('ngo', 'dm:receive'),

    -- ngo's set plus sme:verify. An incubator already knows which of its cohort
    -- are trading businesses — that is the content of its programme — so it is
    -- a competent verifier alongside the chambers.
    ('bso', 'grant:view'),
    ('bso', 'grant:apply'),
    ('bso', 'project:create'),
    ('bso', 'project:manage'),
    ('bso', 'event:create'),
    ('bso', 'forum:post'),
    ('bso', 'forum:comment'),
    ('bso', 'mentorship:offer'),
    ('bso', 'sme:verify'),
    ('bso', 'dm:initiate'),
    ('bso', 'dm:receive'),

    -- educational_partner's set. A research institution takes students on the
    -- same way a university does — under its own domain, sponsoring their
    -- applications and supervising their channels.
    ('research_institution', 'institution:approve_students'),
    ('research_institution', 'grant:view'),
    ('research_institution', 'grant:apply'),
    ('research_institution', 'grant:sponsor'),
    ('research_institution', 'project:create'),
    ('research_institution', 'project:manage'),
    ('research_institution', 'event:create'),
    ('research_institution', 'forum:post'),
    ('research_institution', 'forum:comment'),
    ('research_institution', 'dm:initiate'),
    ('research_institution', 'dm:receive'),
    ('research_institution', 'dm:supervise'),

    -- Funders and programme administrators: investor's grant keys plus the
    -- ability to run projects and events. government verifies both institutions
    -- and businesses because in most member states it is the registry of record.
    ('government', 'grant:view'),
    ('government', 'grant:post'),
    ('government', 'grant:manage_funds'),
    ('government', 'project:create'),
    ('government', 'project:manage'),
    ('government', 'event:create'),
    ('government', 'forum:post'),
    ('government', 'forum:comment'),
    ('government', 'sme:verify'),
    ('government', 'institution:verify'),
    ('government', 'dm:initiate'),
    ('government', 'dm:receive'),

    ('diaspora', 'grant:view'),
    ('diaspora', 'grant:post'),
    ('diaspora', 'grant:manage_funds'),
    ('diaspora', 'project:create'),
    ('diaspora', 'project:manage'),
    ('diaspora', 'event:create'),
    ('diaspora', 'forum:post'),
    ('diaspora', 'forum:comment'),
    ('diaspora', 'mentorship:offer'),
    ('diaspora', 'institution:verify'),
    ('diaspora', 'dm:initiate'),
    ('diaspora', 'dm:receive'),

    -- No audit:view. Reading the platform's moderation and permission trails is
    -- an operator's power, and it is the one key that would collapse igo back
    -- into super_admin.
    ('igo', 'grant:view'),
    ('igo', 'grant:post'),
    ('igo', 'grant:manage_funds'),
    ('igo', 'project:create'),
    ('igo', 'project:manage'),
    ('igo', 'event:create'),
    ('igo', 'forum:post'),
    ('igo', 'forum:comment'),
    ('igo', 'mentorship:offer'),
    ('igo', 'institution:verify'),
    ('igo', 'dm:initiate'),
    ('igo', 'dm:receive'),

    ('entrepreneur', 'grant:view'),
    ('entrepreneur', 'grant:apply'),
    ('entrepreneur', 'project:create'),
    ('entrepreneur', 'project:manage'),
    ('entrepreneur', 'event:create'),
    ('entrepreneur', 'forum:post'),
    ('entrepreneur', 'forum:comment'),
    ('entrepreneur', 'mentorship:offer'),
    ('entrepreneur', 'dm:initiate'),
    ('entrepreneur', 'dm:receive'),

    ('faculty', 'institution:approve_students'),
    ('faculty', 'grant:view'),
    ('faculty', 'grant:apply'),
    ('faculty', 'grant:sponsor'),
    ('faculty', 'project:create'),
    ('faculty', 'project:manage'),
    ('faculty', 'event:create'),
    ('faculty', 'forum:post'),
    ('faculty', 'forum:comment'),
    ('faculty', 'mentorship:offer'),
    ('faculty', 'dm:initiate'),
    ('faculty', 'dm:receive'),
    ('faculty', 'dm:supervise'),

    ('researcher', 'grant:view'),
    ('researcher', 'grant:apply'),
    ('researcher', 'project:create'),
    ('researcher', 'project:manage'),
    ('researcher', 'event:create'),
    ('researcher', 'forum:post'),
    ('researcher', 'forum:comment'),
    ('researcher', 'mentorship:offer'),
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    -- The full grant set. A mentor is frequently the person running a small
    -- fund or a prize alongside the mentoring, and splitting those across two
    -- accounts was the only thing the narrower set achieved.
    ('mentor', 'grant:view'),
    ('mentor', 'grant:apply'),
    ('mentor', 'grant:post'),
    ('mentor', 'grant:manage_funds'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'event:create'),
    ('mentor', 'forum:post'),
    ('mentor', 'forum:comment'),
    ('mentor', 'mentorship:offer'),
    ('mentor', 'dm:initiate'),
    ('mentor', 'dm:receive'),

    -- Applies for its own funding now. Still receives messages and never
    -- initiates them — see the safeguard block in has_permission().
    ('student', 'grant:view'),
    ('student', 'grant:apply'),
    ('student', 'project:create'),
    ('student', 'project:manage'),
    ('student', 'event:create'),
    ('student', 'forum:post'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- Seed every cell for the six new roles. DO NOTHING, so no existing cell is
-- touched here — the eleven revised ones are handled explicitly below.
INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug,
       pd.key,
       EXISTS (SELECT 1 FROM default_role_permissions() d WHERE d.role_slug = rd.slug AND d.permission_key = pd.key)
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

-- ============================================================
-- 4. The eleven revised cells on existing roles
--
-- These rows already exist, so the seed above skipped them. Written with an
-- explicit UPDATE and scoped to exactly the eleven pairs: this overwrites an
-- administrator's edit where it collides, which is the intent, and nothing
-- else in the matrix is disturbed. updated_by is left NULL — no human made
-- this change, the migration did.
-- ============================================================

UPDATE role_permissions rp
SET allowed = TRUE,
    updated_at = now()
FROM (VALUES
  ('safety_admin', 'sme:verify'),
  ('safety_admin', 'institution:verify'),
  ('safety_admin', 'institution:approve_students'),
  ('private_sector', 'mentorship:offer'),
  ('entrepreneur', 'mentorship:offer'),
  ('researcher', 'mentorship:offer'),
  ('mentor', 'grant:apply'),
  ('mentor', 'grant:post'),
  ('mentor', 'grant:manage_funds'),
  ('student', 'grant:apply')
) AS revised(role_slug, permission_key)
WHERE rp.role_slug = revised.role_slug
  AND rp.permission_key = revised.permission_key
  AND rp.allowed IS DISTINCT FROM TRUE;

-- ============================================================
-- 5. has_permission() — grant:apply leaves the safeguard list
--
-- 063's body, with one line removed. Everything else about the function is
-- unchanged, including the suspension check and the rule that a student who
-- also holds an adult role is still treated as a student.
-- ============================================================

CREATE OR REPLACE FUNCTION has_permission(p_user UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
BEGIN
  IF p_user IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT expand_roles(p.roles) INTO v_roles FROM profiles p WHERE p.id = p_user;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  IF is_suspended(p_user) THEN
    RETURN FALSE;
  END IF;

  -- Safeguarding. Hard-coded on purpose: this must survive an admin toggling
  -- the matrix, a bad seed, and a direct UPDATE on role_permissions. A student
  -- who also holds an adult role is still treated as a student.
  --
  -- grant:apply was on this list until 110. Students now submit their own
  -- applications; what is still denied is unmonitored messaging and the
  -- administration of money.
  IF 'student' = ANY(v_roles) AND p_permission IN (
    'dm:initiate',
    'grant:manage_funds',
    'moderation:action',
    'moderation:escalate'
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_slug = ANY(v_roles)
      AND rp.permission_key = p_permission
      AND rp.allowed
  );
END;
$$;

-- has_permission_as() needs no change: it delegates to has_permission() both
-- for the NULL-active_role fallback and for its never-widen check, so the
-- safeguard list moves with it automatically.

-- ============================================================
-- 6. The sponsor handshake becomes optional
--
-- 064's trigger branched on the ROLE, not the permission: any applicant holding
-- `student` was refused unless a sponsor had accepted. Removing grant:apply
-- from the safeguard list alone would therefore have produced a submit action
-- that reached the database and raised — the permission would say yes and the
-- trigger would still say no.
--
-- The student branch is dropped. What remains is the generic check that already
-- governed everyone else. sponsor_id, sponsor_approved_at, sponsor_note and
-- review_grant_sponsorship() are all left in place: a student may still
-- nominate a faculty sponsor, and a sponsor may still accept, but neither is
-- required to submit.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_grant_application_sponsor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT has_permission(NEW.user_id, 'grant:apply') THEN
    RAISE EXCEPTION 'this account is not permitted to submit grant applications';
  END IF;

  -- A nominated sponsor still has to be one. An application naming a sponsor
  -- who cannot sponsor would carry an endorsement that means nothing.
  IF NEW.sponsor_id IS NOT NULL
     AND NEW.sponsor_approved_at IS NOT NULL
     AND NOT has_permission(NEW.sponsor_id, 'grant:sponsor') THEN
    RAISE EXCEPTION 'the nominated sponsor is not permitted to sponsor applications';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Verification
--
--   SELECT count(*) FROM role_definitions;                          -- 19
--   SELECT count(*) FROM role_permissions;                          -- 432 (18 x 24)
--
--   SELECT role_slug, count(*) FROM role_permissions
--    WHERE allowed AND role_slug IN ('ngo','bso','research_institution',
--                                    'government','diaspora','igo')
--    GROUP BY role_slug ORDER BY role_slug;
--   -- bso 11, diaspora 12, government 12, igo 12, ngo 10, research_institution 12
--
--   SELECT is_safeguard FROM permission_definitions WHERE key = 'grant:apply';
--   -- false
--
--   -- Any student account: TRUE for grant:apply, FALSE for dm:initiate.
--   SELECT has_permission(id, 'grant:apply'), has_permission(id, 'dm:initiate')
--     FROM profiles WHERE 'student' = ANY(roles) LIMIT 1;
-- ============================================================
