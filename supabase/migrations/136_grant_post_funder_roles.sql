-- ============================================================
-- Migration 136: grant:post follows who actually funds
--
-- Reported on /admin/grants: the funder half of /grants (129) is reachable
-- only by roles holding grant:post, and four organisation-tier roles that
-- run funding windows in practice did not hold it, while one individual-tier
-- role did.
--
--   + ngo                     re-grants donor envelopes as small-grants windows
--   + research_institution    posts fellowship and research calls
--   + educational_partner     posts scholarship and bursary calls
--   + private_sector          posts prizes, challenges and sponsorships
--   - mentor                  individual-tier; a fund is published by an org
--
-- Nothing else in the matrix moves. grant:apply, grant:sponsor and
-- grant:manage_funds are untouched for every role named above.
-- ============================================================

-- ============================================================
-- 1. Default matrix
--
-- 135's body verbatim with the five cells above changed. Restated in full and
-- not as a delta because src/lib/__tests__/rbac-parity.test.ts reads the
-- HIGHEST-numbered migration defining this function and diffs it against
-- DEFAULT_ROLE_PERMISSIONS -- a partial restatement here would silently revoke
-- 135's resource:submit rows.
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
-- 2. The live table
--
-- role_permissions is the editable copy and every one of these five cells
-- already exists in it with the OLD value, so ON CONFLICT DO NOTHING (135
-- section 9) would be a no-op. An UPDATE is required, and it is deliberately
-- unconditional: these are corrections to a default, not preferences a
-- deployment may have tuned. A super admin who wants a different answer for
-- one of these roles sets it again in Roles & Permissions after deploy.
--
-- Scoped to the five (role, key) pairs, so no other cell is touched.
-- ============================================================

UPDATE role_permissions SET allowed = TRUE
WHERE permission_key = 'grant:post'
  AND role_slug IN ('ngo', 'research_institution', 'educational_partner', 'private_sector');

UPDATE role_permissions SET allowed = FALSE
WHERE permission_key = 'grant:post'
  AND role_slug = 'mentor';

-- Cells that never existed (a role added without a full cross-join seed).
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

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 3. Verification
--
--   -- nine role slugs, mentor absent, the four additions present
--   SELECT role_slug FROM role_permissions
--    WHERE permission_key = 'grant:post' AND allowed ORDER BY role_slug;
--
--   -- the function and the table agree on this key
--   SELECT rp.role_slug, rp.allowed,
--          EXISTS (SELECT 1 FROM default_role_permissions() d
--                  WHERE d.role_slug = rp.role_slug AND d.permission_key = 'grant:post') AS want
--     FROM role_permissions rp
--    WHERE rp.permission_key = 'grant:post' ORDER BY rp.role_slug;
--
--   -- 135's key survived the restatement
--   SELECT count(*) FROM default_role_permissions()
--    WHERE permission_key = 'resource:submit';
-- ============================================================
