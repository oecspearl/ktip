-- ============================================================
-- Migration 158: IP / Legal Professional
--
-- A new individual-tier role for the patent agents, IP lawyers and licensing
-- advisers who work with innovators on the platform. Asked for as "the same
-- accesses as an educator". There is no platform role called educator: an
-- institution's educators are granted `faculty` (145), so this role mirrors
-- faculty's matrix column, less the two keys that only make sense for staff a
-- school has vouched for (see the comment in section 2).
--
-- How the role is reached: picked at signup or onboarding, then approved by a
-- KTIP administrator at /admin/verification, the same queue organisation
-- accounts use. Faculty is approved by an institution instead; this role has
-- no institution, so section 6 lets it through the verification-request
-- guard, which until now admitted organisation-tier roles only.
--
-- Safe to re-run: every statement is an upsert, an ON CONFLICT DO NOTHING
-- insert, or a CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- 1. Catalog row
--
-- Not self-assignable and review-gated, like faculty. Sort order 95 puts it
-- after faculty (90) in the admin matrix.
-- ============================================================

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('ip_legal', 'IP / Legal Professional', 'individual', 'Patent agent, IP lawyer or licensing adviser. Runs projects and events, applies for and sponsors funding, mentors innovators. Approved by a KTIP administrator.', FALSE, TRUE, NULL, 95)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. Default matrix
--
-- 136's body verbatim plus the ip_legal block after faculty. Restated in full
-- and not as a delta because src/lib/__tests__/rbac-parity.test.ts reads the
-- HIGHEST-numbered migration defining this function and diffs it against
-- DEFAULT_ROLE_PERMISSIONS.
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
  -- Admin holds everything too. The difference between the two seats is not in
  -- this matrix at all — it is the Super Admin ceiling from 124.
  SELECT 'admin'::TEXT, pd.key FROM permission_definitions pd
  UNION ALL
  SELECT * FROM (VALUES
    -- The two supervisors. Domain keys first, then the ordinary participant
    -- bundle — they are members of the platform as well as administrators of
    -- part of it, and docs/QA-RELAY-SESSION.md needs them to be able to create
    -- a project and apply for a grant like anybody else.
    ('people_supervisor', 'members:view'),
    ('people_supervisor', 'audit:view'),
    ('people_supervisor', 'moderation:view'),
    ('people_supervisor', 'moderation:action'),
    ('people_supervisor', 'moderation:escalate'),
    ('people_supervisor', 'sme:verify'),
    ('people_supervisor', 'institution:verify'),
    ('people_supervisor', 'institution:approve_students'),
    ('people_supervisor', 'verification:review'),
    ('people_supervisor', 'grant:view'),
    ('people_supervisor', 'grant:apply'),
    ('people_supervisor', 'project:create'),
    ('people_supervisor', 'project:manage'),
    ('people_supervisor', 'event:create'),
    ('people_supervisor', 'forum:post'),
    ('people_supervisor', 'resource:submit'),
    ('people_supervisor', 'forum:comment'),
    ('people_supervisor', 'mentorship:offer'),
    ('people_supervisor', 'dm:initiate'),
    ('people_supervisor', 'dm:receive'),
    ('people_supervisor', 'dm:supervise'),

    -- grant:manage_funds rides with grant:manage: the person deciding an
    -- application is the person recording the award, and splitting those across
    -- two seats would only mean every decision waits on somebody else.
    -- forum:board joins forum:manage for the same reason — the seat that owns
    -- what the platform publishes owns the shape of the forum as well.
    ('programme_supervisor', 'project:manage_all'),
    ('programme_supervisor', 'grant:manage'),
    ('programme_supervisor', 'grant:post'),
    ('programme_supervisor', 'grant:manage_funds'),
    ('programme_supervisor', 'forum:manage'),
    ('programme_supervisor', 'forum:board'),
    ('programme_supervisor', 'resource:manage'),
    ('programme_supervisor', 'achievement:manage'),
    ('programme_supervisor', 'employer:manage'),
    ('programme_supervisor', 'grant:view'),
    ('programme_supervisor', 'grant:apply'),
    ('programme_supervisor', 'project:create'),
    ('programme_supervisor', 'project:manage'),
    ('programme_supervisor', 'event:create'),
    ('programme_supervisor', 'forum:post'),
    ('programme_supervisor', 'resource:submit'),
    ('programme_supervisor', 'forum:comment'),
    ('programme_supervisor', 'mentorship:offer'),
    ('programme_supervisor', 'dm:initiate'),
    ('programme_supervisor', 'dm:receive'),

    -- The verification keys are here because a safety admin is the first-line
    -- receipt for every complaint, and a complaint about a body claiming to be
    -- a school or a chamber-verified business is answered by looking at that
    -- claim.
    ('safety_admin', 'audit:view'),
    ('safety_admin', 'moderation:view'),
    ('safety_admin', 'moderation:action'),
    ('safety_admin', 'moderation:escalate'),
    ('safety_admin', 'grant:view'),
    ('safety_admin', 'forum:post'),
    ('safety_admin', 'resource:submit'),
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
    ('investor', 'resource:submit'),
    ('investor', 'forum:comment'),
    ('investor', 'forum:board'),
    ('investor', 'mentorship:offer'),
    ('investor', 'dm:initiate'),
    ('investor', 'dm:receive'),

    ('private_sector', 'grant:view'),
    ('private_sector', 'grant:post'),
    ('private_sector', 'project:create'),
    ('private_sector', 'project:manage'),
    ('private_sector', 'event:create'),
    ('private_sector', 'forum:post'),
    ('private_sector', 'resource:submit'),
    ('private_sector', 'forum:comment'),
    ('private_sector', 'forum:board'),
    ('private_sector', 'mentorship:offer'),
    ('private_sector', 'dm:initiate'),
    ('private_sector', 'dm:receive'),

    ('educational_partner', 'institution:approve_students'),
    ('educational_partner', 'grant:view'),
    ('educational_partner', 'grant:apply'),
    ('educational_partner', 'grant:sponsor'),
    ('educational_partner', 'grant:post'),
    ('educational_partner', 'project:create'),
    ('educational_partner', 'project:manage'),
    ('educational_partner', 'event:create'),
    ('educational_partner', 'forum:post'),
    ('educational_partner', 'resource:submit'),
    ('educational_partner', 'forum:comment'),
    ('educational_partner', 'forum:board'),
    ('educational_partner', 'dm:initiate'),
    ('educational_partner', 'dm:receive'),
    ('educational_partner', 'dm:supervise'),

    -- Chamber of Commerce / BSO. One column since 125: the incubator and the
    -- chamber both vet local businesses, and holding two slugs for it split
    -- the verifier list without ever splitting the duty. grant:post is new in
    -- 129 — an incubator or an MSME agency channels funding to its cohort, and
    -- withholding the key meant the money was posted from somebody else's
    -- account or not at all.
    ('chamber_admin', 'sme:verify'),
    ('chamber_admin', 'grant:view'),
    ('chamber_admin', 'grant:apply'),
    ('chamber_admin', 'grant:post'),
    ('chamber_admin', 'project:create'),
    ('chamber_admin', 'project:manage'),
    ('chamber_admin', 'event:create'),
    ('chamber_admin', 'forum:post'),
    ('chamber_admin', 'resource:submit'),
    ('chamber_admin', 'forum:comment'),
    ('chamber_admin', 'forum:board'),
    ('chamber_admin', 'mentorship:offer'),
    ('chamber_admin', 'dm:initiate'),
    ('chamber_admin', 'dm:receive'),

    -- Delivery organisations. 136: they post funding too. An NGO that wins a
    -- donor envelope re-grants it as a small-grants window, and withholding
    -- the key meant that window was posted from somebody else's account.
    ('ngo', 'grant:view'),
    ('ngo', 'grant:apply'),
    ('ngo', 'grant:post'),
    ('ngo', 'project:create'),
    ('ngo', 'project:manage'),
    ('ngo', 'event:create'),
    ('ngo', 'forum:post'),
    ('ngo', 'resource:submit'),
    ('ngo', 'forum:comment'),
    ('ngo', 'forum:board'),
    ('ngo', 'mentorship:offer'),
    ('ngo', 'dm:initiate'),
    ('ngo', 'dm:receive'),

    -- educational_partner's set. A research institution takes students on the
    -- same way a university does — under its own domain, sponsoring their
    -- applications and supervising their channels.
    ('research_institution', 'institution:approve_students'),
    ('research_institution', 'grant:view'),
    ('research_institution', 'grant:apply'),
    ('research_institution', 'grant:sponsor'),
    ('research_institution', 'grant:post'),
    ('research_institution', 'project:create'),
    ('research_institution', 'project:manage'),
    ('research_institution', 'event:create'),
    ('research_institution', 'forum:post'),
    ('research_institution', 'resource:submit'),
    ('research_institution', 'forum:comment'),
    ('research_institution', 'forum:board'),
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
    ('government', 'resource:submit'),
    ('government', 'forum:comment'),
    ('government', 'forum:board'),
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
    ('diaspora', 'resource:submit'),
    ('diaspora', 'forum:comment'),
    ('diaspora', 'forum:board'),
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
    ('igo', 'resource:submit'),
    ('igo', 'forum:comment'),
    ('igo', 'forum:board'),
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
    ('entrepreneur', 'resource:submit'),
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
    ('faculty', 'resource:submit'),
    ('faculty', 'forum:comment'),
    ('faculty', 'mentorship:offer'),
    ('faculty', 'dm:initiate'),
    ('faculty', 'dm:receive'),
    ('faculty', 'dm:supervise'),

    -- 158. Faculty's column minus the two student-safeguard keys:
    -- institution:approve_students (an IP / legal adviser belongs to no
    -- school's roster) and dm:supervise (holding it would make them the
    -- supervising adult in student channels without any institution having
    -- vouched for them). grant:sponsor stays -- sponsoring a student
    -- application is a named, reviewed act, not standing access.
    ('ip_legal', 'grant:view'),
    ('ip_legal', 'grant:apply'),
    ('ip_legal', 'grant:sponsor'),
    ('ip_legal', 'project:create'),
    ('ip_legal', 'project:manage'),
    ('ip_legal', 'event:create'),
    ('ip_legal', 'forum:post'),
    ('ip_legal', 'resource:submit'),
    ('ip_legal', 'forum:comment'),
    ('ip_legal', 'mentorship:offer'),
    ('ip_legal', 'dm:initiate'),
    ('ip_legal', 'dm:receive'),

    ('researcher', 'grant:view'),
    ('researcher', 'grant:apply'),
    ('researcher', 'project:create'),
    ('researcher', 'project:manage'),
    ('researcher', 'event:create'),
    ('researcher', 'forum:post'),
    ('researcher', 'resource:submit'),
    ('researcher', 'forum:comment'),
    ('researcher', 'mentorship:offer'),
    ('researcher', 'dm:initiate'),
    ('researcher', 'dm:receive'),

    -- 136 takes grant:post back off. A mentor is an individual-tier seat and
    -- a funding call is published in an organisation’s name; the mentor who
    -- does run a fund holds it through that organisation account. grant:apply
    -- and grant:manage_funds stay — a mentor still applies, and still records
    -- disbursements against a call somebody else posted.
    ('mentor', 'grant:view'),
    ('mentor', 'grant:apply'),
    ('mentor', 'grant:manage_funds'),
    ('mentor', 'project:create'),
    ('mentor', 'project:manage'),
    ('mentor', 'event:create'),
    ('mentor', 'forum:post'),
    ('mentor', 'resource:submit'),
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
    ('student', 'resource:submit'),
    ('student', 'forum:comment'),
    ('student', 'dm:receive')
  ) AS t(role_slug, permission_key);
$$;

-- ============================================================
-- 3. The live table
--
-- Only cells that do not exist yet, which on a first run is the new role's
-- whole column. Every other role's cells already exist and are left alone, so
-- anything a super admin tuned in Roles & Permissions survives.
-- ============================================================

INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug, pd.key,
       EXISTS (
         SELECT 1 FROM default_role_permissions() d
         WHERE d.role_slug = rd.slug AND d.permission_key = pd.key
       )
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

-- ============================================================
-- 4. Ranker affinity (153)
--
-- Faculty's weights, so the feed treats the two the same.
-- ============================================================

INSERT INTO role_entity_affinity (role_slug, entity, weight) VALUES
  ('ip_legal', 'resource', 18), ('ip_legal', 'event', 18), ('ip_legal', 'project', 10)
ON CONFLICT (role_slug, entity) DO NOTHING;

-- ============================================================
-- 5. KPI tier (146)
--
-- 146's body with ip_legal beside faculty. Without it these members chart as
-- 'Other'. src/lib/member-kpis.ts carries the same grouping.
-- ============================================================

CREATE OR REPLACE FUNCTION public.kpi_role_tier(p_roles TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_roles && ARRAY['investor']::TEXT[] THEN 'Investors'
    WHEN p_roles && ARRAY['mentor']::TEXT[] THEN 'Mentors'
    WHEN p_roles && ARRAY['entrepreneur','private_sector','chamber_admin','ngo','sme']::TEXT[]
      THEN 'Entrepreneurs & firms'
    WHEN p_roles && ARRAY['faculty','ip_legal','researcher','educational_partner','research_institution',
                          'government','diaspora','igo']::TEXT[]
      THEN 'Institutions & partners'
    WHEN p_roles && ARRAY['student']::TEXT[] THEN 'Students'
    ELSE 'Other'
  END;
$fn$;

-- ============================================================
-- 6. The verification-request guard (125)
--
-- 125 admitted organisation-tier roles only, because the other review-gated
-- roles (student, faculty) are approved by a school, not by a KTIP reviewer.
-- ip_legal is the first individual-tier role an administrator approves, so it
-- is named here explicitly rather than opening the individual tier: a tier
-- test would also admit faculty, and a member could then ask the KTIP queue
-- for a role their institution is meant to grant.
--
-- The TS copy is isAdminReviewedRole() in src/lib/permissions.ts.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_verification_request_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_role IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM role_definitions rd
    WHERE rd.slug = NEW.requested_role
      AND (rd.tier = 'organization' OR rd.slug = 'ip_legal')
      AND rd.requires_verification
      AND rd.alias_of IS NULL
  ) THEN
    RAISE EXCEPTION 'role % cannot be requested through verification', NEW.requested_role
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification
--
--   -- twelve keys, no dm:supervise, no institution:approve_students
--   SELECT permission_key FROM role_permissions
--    WHERE role_slug = 'ip_legal' AND allowed ORDER BY permission_key;
--
--   -- faculty's column minus exactly those two
--   SELECT permission_key FROM default_role_permissions() WHERE role_slug = 'faculty'
--   EXCEPT
--   SELECT permission_key FROM default_role_permissions() WHERE role_slug = 'ip_legal';
--
--   -- 136's grant:post answer survived the restatement (nine roles)
--   SELECT count(*) FROM default_role_permissions() WHERE permission_key = 'grant:post';
-- ============================================================
