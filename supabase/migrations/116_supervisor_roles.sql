-- Migration 116: two supervisor seats, and the domain keys that make them real.
--
-- Until now one account held super_admin and therefore all 24 permission keys,
-- and there was no way to hand out part of the admin console. Two things were
-- in the way, and this migration removes both.
--
-- 1. org:manage WAS A SINGLE BIT behind fifteen of the twenty-two admin pages.
--    Projects, Events, Grants, Forums, Resources, Achievements, Employers,
--    Analytics, Partner API, Errors, UAT, Feedback, Integrations and
--    Verification all read the same key, so there was no way to give somebody
--    Grants without also giving them the Error Simulator. Nine keys are added
--    below, each standing for one console page and the rows that page writes.
--    org:manage survives as the residual operator key: analytics, UAT,
--    feedback, integrations, partner API and the error console.
--
-- 2. WRITES WERE HARDCODED TO super_admin. is_platform_admin() (063) is
--    literally `'super_admin' = ANY(expand_roles(p.roles))`, and ~65 policies
--    rewritten by 090 call it. A supervisor shown an admin page would have
--    clicked Save, seen a success toast, and changed nothing: an RLS-filtered
--    UPDATE returns zero rows without raising. 090's own header says this at
--    lines 18-20. Section 5 re-keys those policies onto has_permission() so the
--    page a supervisor can see is the page a supervisor can write.
--
--    is_platform_admin() itself is NOT redefined. Making it capability-based
--    would have widened every policy that still calls it, including the ones
--    deliberately left with the Super Admin. It keeps meaning exactly what it
--    means today, and the policies that should no longer ask that question stop
--    asking it.
--
-- THE TWO SEATS. Same tier as each other — the split is by subject matter, not
-- seniority, and neither reports to the other:
--
--   people_supervisor     (Marvin)  — who people are and how they behave:
--                                     member list (read), verification,
--                                     institutions, chamber, moderation,
--                                     grievances.
--   programme_supervisor  (Royston) — what the platform publishes: projects,
--                                     grants, forums, resources, achievements,
--                                     employers.
--
-- Neither holds org:manage, members:manage or role:manage. Assigning roles and
-- editing the matrix stays with super_admin alone, so a supervisor can neither
-- promote themselves nor promote the other one. Their domain keys are disjoint,
-- and src/lib/__tests__/rbac-parity.test.ts fails if anyone widens one into the
-- other's territory.
--
-- event:manage is defined here and granted to nobody but super_admin. That is
-- deliberate: the events and venue policies stop naming super_admin directly,
-- so delegating them later is one toggle at /admin/roles rather than another
-- migration.
--
-- Mirrors src/lib/permissions.ts. Idempotent — safe to re-run.
--
-- ORDERING. This migration restates guard_profile_privileged_columns(), which
-- 115 also restates. It does not depend on 115 having been applied (see the
-- note in section 6), but 115 applied AFTERWARDS would overwrite the two
-- capability branches added here and put verification back in the hands of
-- super_admin alone. If 115 lands after this file, re-run this file.

-- ============================================================
-- 1. The nine new permissions
-- ============================================================

INSERT INTO permission_definitions (key, label, description, category, is_safeguard, sort_order) VALUES
  ('members:view', 'View members', 'Read the member list and account state, without creating, deleting or resetting anyone.', 'platform', FALSE, 25),
  ('verification:review', 'Review verification requests', 'Work the /admin/verification queue and set a member''s verified badge.', 'verification', FALSE, 235),
  ('project:manage_all', 'Administer all projects', 'Edit, feature, archive and delete any project, not only owned ones.', 'content', FALSE, 240),
  ('event:manage', 'Administer all events', 'Edit any event and its venue, schedule, speakers, articles and registrations.', 'content', FALSE, 245),
  ('grant:manage', 'Administer grants', 'Edit any funding call and review, decide and audit the applications to it.', 'content', FALSE, 250),
  ('forum:manage', 'Administer forums', 'Edit, pin and remove any post or reply on any board.', 'content', FALSE, 255),
  ('resource:manage', 'Administer resources', 'Publish, edit and withdraw resource-library entries.', 'content', FALSE, 260),
  ('achievement:manage', 'Administer achievements', 'Define badges and trophies and award or revoke them.', 'content', FALSE, 265),
  ('employer:manage', 'Administer employers', 'Create, verify and edit employer organisations and their member lists.', 'content', FALSE, 270)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_safeguard = EXCLUDED.is_safeguard,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 2. The two roles
-- ============================================================

INSERT INTO role_definitions (slug, label, tier, description, is_self_assignable, requires_verification, alias_of, sort_order) VALUES
  ('people_supervisor', 'People & Trust Supervisor (Marvin)', 'admin', 'Owns who people are and how they behave: member records (read-only), verification, institutions, chamber review, moderation and grievances.', FALSE, TRUE, NULL, 12),
  ('programme_supervisor', 'Programmes Supervisor (Royston)', 'admin', 'Owns what the platform publishes: projects, grants, forums, resources, achievements and employers. Events and the venue stay with the Super Admin.', FALSE, TRUE, NULL, 14)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  description = EXCLUDED.description,
  is_self_assignable = EXCLUDED.is_self_assignable,
  requires_verification = EXCLUDED.requires_verification,
  alias_of = EXCLUDED.alias_of,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 3. Default matrix
--
-- 110's body with the two supervisor blocks added. Restated in full rather than
-- as a delta, for the reason 110 gives: this one function is what both the seed
-- below and "Reset to defaults" at /admin/roles read, so a partial body would
-- silently drop every role it omitted. Mirrors DEFAULT_ROLE_PERMISSIONS in
-- src/lib/permissions.ts, and rbac-parity.test.ts compares the two.
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
    ('people_supervisor', 'forum:comment'),
    ('people_supervisor', 'mentorship:offer'),
    ('people_supervisor', 'dm:initiate'),
    ('people_supervisor', 'dm:receive'),
    ('people_supervisor', 'dm:supervise'),

    -- grant:manage_funds rides with grant:manage: the person deciding an
    -- application is the person recording the award, and splitting those across
    -- two seats would only mean every decision waits on somebody else.
    ('programme_supervisor', 'project:manage_all'),
    ('programme_supervisor', 'grant:manage'),
    ('programme_supervisor', 'grant:post'),
    ('programme_supervisor', 'grant:manage_funds'),
    ('programme_supervisor', 'forum:manage'),
    ('programme_supervisor', 'resource:manage'),
    ('programme_supervisor', 'achievement:manage'),
    ('programme_supervisor', 'employer:manage'),
    ('programme_supervisor', 'grant:view'),
    ('programme_supervisor', 'grant:apply'),
    ('programme_supervisor', 'project:create'),
    ('programme_supervisor', 'project:manage'),
    ('programme_supervisor', 'event:create'),
    ('programme_supervisor', 'forum:post'),
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

-- ============================================================
-- 4. Seed the matrix
--
-- Adds the two new columns and the nine new rows per existing role. DO NOTHING,
-- so no cell an administrator has hand-tuned at /admin/roles is disturbed —
-- unlike 110, this migration revises nothing that already exists.
--
-- role_permissions has an UPDATE policy and no INSERT policy, so a cell that is
-- not seeded here cannot be created from the admin UI at all. That is why the
-- cross join is over every non-alias role rather than only the two new ones.
-- ============================================================

INSERT INTO role_permissions (role_slug, permission_key, allowed)
SELECT rd.slug,
       pd.key,
       EXISTS (SELECT 1 FROM default_role_permissions() d WHERE d.role_slug = rd.slug AND d.permission_key = pd.key)
FROM role_definitions rd
CROSS JOIN permission_definitions pd
WHERE rd.alias_of IS NULL
ON CONFLICT (role_slug, permission_key) DO NOTHING;

-- ============================================================
-- 5. Policy rewrites
--
-- Grouped by domain, and each block names the migration the policy came from so
-- a reviewer can diff it against the original. Policy names are preserved
-- exactly: the DROP has to match, and stable names mean a re-run of an older
-- migration replaces rather than duplicates.
--
-- Every predicate below reads has_permission(), which resolves the `oecs` alias
-- and refuses a suspended account. super_admin holds every key including the
-- nine added above, so nothing that works today stops working.
-- ============================================================

-- ---------- Events and the venue → event:manage ----------
-- Held by super_admin alone today. The point of the key is that these policies
-- no longer name a role.

DROP POLICY IF EXISTS "Public can view non-draft events" ON events;
CREATE POLICY "Public can view non-draft events"
  ON events FOR SELECT
  USING (
    status IN ('published', 'completed', 'cancelled')
    OR auth.uid() = organizer_id
    OR has_permission(auth.uid(), 'event:manage')
  );

DROP POLICY IF EXISTS "OECS admins can update any event" ON events;
CREATE POLICY "OECS admins can update any event"
  ON events FOR UPDATE
  USING (has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can delete any event" ON events;
CREATE POLICY "OECS admins can delete any event"
  ON events FOR DELETE
  USING (has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "Organizers and admins can update RSVPs" ON event_rsvps;
CREATE POLICY "Organizers and admins can update RSVPs"
  ON event_rsvps FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
    OR has_permission(auth.uid(), 'event:manage')
  );

DROP POLICY IF EXISTS "Public can view published event updates" ON event_updates;
CREATE POLICY "Public can view published event updates"
  ON event_updates FOR SELECT
  USING (
    is_published = TRUE
    OR auth.uid() = author_id
    OR has_permission(auth.uid(), 'event:manage')
  );

DROP POLICY IF EXISTS "Organizers and admins can create event updates" ON event_updates;
CREATE POLICY "Organizers and admins can create event updates"
  ON event_updates FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
      OR has_permission(auth.uid(), 'event:manage')
    )
  );

DROP POLICY IF EXISTS "Organizers and admins can update event updates" ON event_updates;
CREATE POLICY "Organizers and admins can update event updates"
  ON event_updates FOR UPDATE
  USING (auth.uid() = author_id OR has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "Organizers and admins can delete event updates" ON event_updates;
CREATE POLICY "Organizers and admins can delete event updates"
  ON event_updates FOR DELETE
  USING (auth.uid() = author_id OR has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "Public can view published event articles" ON event_articles;
CREATE POLICY "Public can view published event articles"
  ON event_articles FOR SELECT
  USING (
    is_published = TRUE
    OR auth.uid() = author_id
    OR has_permission(auth.uid(), 'event:manage')
  );

DROP POLICY IF EXISTS "Organizers and admins can create event articles" ON event_articles;
CREATE POLICY "Organizers and admins can create event articles"
  ON event_articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid())
      OR has_permission(auth.uid(), 'event:manage')
    )
  );

DROP POLICY IF EXISTS "Organizers and admins can update event articles" ON event_articles;
CREATE POLICY "Organizers and admins can update event articles"
  ON event_articles FOR UPDATE
  USING (auth.uid() = author_id OR has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "Organizers and admins can delete event articles" ON event_articles;
CREATE POLICY "Organizers and admins can delete event articles"
  ON event_articles FOR DELETE
  USING (auth.uid() = author_id OR has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can manage all event sections" ON event_page_sections;
CREATE POLICY "OECS admins can manage all event sections"
  ON event_page_sections FOR ALL
  USING (has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can manage all speakers" ON event_speakers;
CREATE POLICY "OECS admins can manage all speakers"
  ON event_speakers FOR ALL
  USING (has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can manage all schedules" ON event_schedule;
CREATE POLICY "OECS admins can manage all schedules"
  ON event_schedule FOR ALL
  USING (has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can manage all event criteria" ON event_criteria;
CREATE POLICY "OECS admins can manage all event criteria"
  ON event_criteria FOR ALL
  USING (has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can manage all venue rooms" ON venue_rooms;
CREATE POLICY "OECS admins can manage all venue rooms"
  ON venue_rooms FOR ALL
  USING (has_permission(auth.uid(), 'event:manage'))
  WITH CHECK (has_permission(auth.uid(), 'event:manage'));

-- Event assets are the event's images. Same key as the event. (027)
DROP POLICY IF EXISTS "OECS admins can upload event assets" ON storage.objects;
CREATE POLICY "OECS admins can upload event assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-assets' AND has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can update event assets" ON storage.objects;
CREATE POLICY "OECS admins can update event assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'event-assets' AND has_permission(auth.uid(), 'event:manage'));

DROP POLICY IF EXISTS "OECS admins can delete event assets" ON storage.objects;
CREATE POLICY "OECS admins can delete event assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'event-assets' AND has_permission(auth.uid(), 'event:manage'));

-- ---------- Projects → project:manage_all ----------
-- Note the name: project:manage already exists and means "manage the projects I
-- own". This is the one that reaches other people's.

DROP POLICY IF EXISTS "OECS admins can view all projects" ON projects;
CREATE POLICY "OECS admins can view all projects"
  ON projects FOR SELECT
  USING (has_permission(auth.uid(), 'project:manage_all'));

DROP POLICY IF EXISTS "OECS admins can update any project" ON projects;
CREATE POLICY "OECS admins can update any project"
  ON projects FOR UPDATE
  USING (has_permission(auth.uid(), 'project:manage_all'));

DROP POLICY IF EXISTS "OECS admins can delete any project" ON projects;
CREATE POLICY "OECS admins can delete any project"
  ON projects FOR DELETE
  USING (has_permission(auth.uid(), 'project:manage_all'));

DROP POLICY IF EXISTS "Admins can view all project phase events" ON project_phase_events;
CREATE POLICY "Admins can view all project phase events"
  ON project_phase_events FOR SELECT
  USING (has_permission(auth.uid(), 'project:manage_all'));

-- ---------- Grants → grant:manage ----------

DROP POLICY IF EXISTS "OECS admins can create grants" ON grants;
CREATE POLICY "OECS admins can create grants"
  ON grants FOR INSERT
  WITH CHECK (has_permission(auth.uid(), 'grant:manage'));

DROP POLICY IF EXISTS "OECS admins can update grants" ON grants;
CREATE POLICY "OECS admins can update grants"
  ON grants FOR UPDATE
  USING (has_permission(auth.uid(), 'grant:manage'));

DROP POLICY IF EXISTS "OECS admins can delete grants" ON grants;
CREATE POLICY "OECS admins can delete grants"
  ON grants FOR DELETE
  USING (has_permission(auth.uid(), 'grant:manage'));

DROP POLICY IF EXISTS "OECS admins can view all applications" ON grant_applications;
CREATE POLICY "OECS admins can view all applications"
  ON grant_applications FOR SELECT
  USING (has_permission(auth.uid(), 'grant:manage'));

DROP POLICY IF EXISTS "OECS admins can update any application" ON grant_applications;
CREATE POLICY "OECS admins can update any application"
  ON grant_applications FOR UPDATE
  USING (has_permission(auth.uid(), 'grant:manage'));

DROP POLICY IF EXISTS "Admins can view all application events" ON grant_application_events;
CREATE POLICY "Admins can view all application events"
  ON grant_application_events FOR SELECT
  USING (has_permission(auth.uid(), 'grant:manage'));

-- 077's owner-editable pair. The admin arm was is_oecs_admin(); the creator arm
-- is untouched, so a mentor or investor still edits only the calls they posted.
DROP POLICY IF EXISTS "Users can update grants they created" ON grants;
CREATE POLICY "Users can update grants they created"
  ON grants FOR UPDATE
  USING (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
    OR has_permission(auth.uid(), 'grant:manage')
  )
  WITH CHECK (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
    OR has_permission(auth.uid(), 'grant:manage')
  );

DROP POLICY IF EXISTS "Users can delete grants they created" ON grants;
CREATE POLICY "Users can delete grants they created"
  ON grants FOR DELETE
  USING (
    (created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
    OR has_permission(auth.uid(), 'grant:manage')
  );

-- ---------- Forums → forum:manage ----------

DROP POLICY IF EXISTS "OECS admins can update any post" ON forum_posts;
CREATE POLICY "OECS admins can update any post"
  ON forum_posts FOR UPDATE
  USING (has_permission(auth.uid(), 'forum:manage'));

DROP POLICY IF EXISTS "OECS admins can delete any post" ON forum_posts;
CREATE POLICY "OECS admins can delete any post"
  ON forum_posts FOR DELETE
  USING (has_permission(auth.uid(), 'forum:manage'));

DROP POLICY IF EXISTS "OECS admins can delete any reply" ON forum_replies;
CREATE POLICY "OECS admins can delete any reply"
  ON forum_replies FOR DELETE
  USING (has_permission(auth.uid(), 'forum:manage'));

-- ---------- Resources → resource:manage ----------

DROP POLICY IF EXISTS "OECS admin can manage resources" ON resources;
CREATE POLICY "OECS admin can manage resources"
  ON resources FOR ALL
  USING (has_permission(auth.uid(), 'resource:manage'));

-- ---------- Employers → employer:manage ----------
-- The employer_members SELECT policy is 111's version, NOT 090's. 090's was a
-- self-referencing EXISTS that recursed (42P17) and made the table unreadable
-- from the browser; 111 replaced it with is_employer_member(). Recreating 090's
-- here would reintroduce that bug.

DROP POLICY IF EXISTS "Admins can create employers" ON employers;
CREATE POLICY "Admins can create employers"
  ON employers FOR INSERT
  WITH CHECK (has_permission(auth.uid(), 'employer:manage'));

DROP POLICY IF EXISTS "Admins can update employers" ON employers;
CREATE POLICY "Admins can update employers"
  ON employers FOR UPDATE
  USING (has_permission(auth.uid(), 'employer:manage'));

DROP POLICY IF EXISTS "Admins can delete employers" ON employers;
CREATE POLICY "Admins can delete employers"
  ON employers FOR DELETE
  USING (has_permission(auth.uid(), 'employer:manage'));

DROP POLICY IF EXISTS "Employers are viewable by their own members and admins" ON employers;
CREATE POLICY "Employers are viewable by their own members and admins"
  ON employers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = employers.id AND m.user_id = auth.uid()
    )
    OR has_permission(auth.uid(), 'employer:manage')
  );

DROP POLICY IF EXISTS "Members and admins can view employer members" ON employer_members;
CREATE POLICY "Members and admins can view employer members"
  ON employer_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_employer_member(employer_id, auth.uid())
    OR has_permission(auth.uid(), 'employer:manage')
  );

DROP POLICY IF EXISTS "Admins can manage employer members" ON employer_members;
CREATE POLICY "Admins can manage employer members"
  ON employer_members FOR ALL
  USING (has_permission(auth.uid(), 'employer:manage'))
  WITH CHECK (has_permission(auth.uid(), 'employer:manage'));

DROP POLICY IF EXISTS "Admins can view verification events" ON employer_verification_events;
CREATE POLICY "Admins can view verification events"
  ON employer_verification_events FOR SELECT
  USING (has_permission(auth.uid(), 'employer:manage'));

-- ---------- Verification → verification:review ----------

DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (auth.uid() = user_id OR has_permission(auth.uid(), 'verification:review'));

DROP POLICY IF EXISTS "Admins can review verification requests" ON verification_requests;
CREATE POLICY "Admins can review verification requests"
  ON verification_requests FOR UPDATE
  USING (has_permission(auth.uid(), 'verification:review'));

DROP POLICY IF EXISTS "Users and admins can view verification documents" ON storage.objects;
CREATE POLICY "Users and admins can view verification documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR has_permission(auth.uid(), 'verification:review')
    )
  );

-- ---------- Grievances and reported files → moderation ----------

DROP POLICY IF EXISTS "OECS admin can manage all grievances" ON grievances;
CREATE POLICY "OECS admin can manage all grievances"
  ON grievances FOR ALL
  USING (has_permission(auth.uid(), 'moderation:view'));

-- 095. The reason this policy exists is that somebody has to be able to remove
-- a reported attachment, and that somebody is now identified by the moderation
-- key rather than by being the platform owner.
DROP POLICY IF EXISTS "Senders and admins can delete message attachments" ON storage.objects;
CREATE POLICY "Senders and admins can delete message attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'message-attachments'
    AND (
      (storage.foldername(name))[2] = auth.uid()::TEXT
      OR has_permission(auth.uid(), 'moderation:action')
    )
  );

-- ---------- Profiles ----------
-- The most consequential policy in the file: it is what /admin/users writes
-- through. Two capabilities reach it now, because two different jobs write to a
-- profile — creating and deleting accounts (members:manage, the Super Admin's)
-- and setting the verified badge (verification:review, the People supervisor's).
--
-- Role changes do not come through here at all: set_user_roles() is SECURITY
-- DEFINER and sets ktip.bypass_profile_guard.

DROP POLICY IF EXISTS "OECS admins can update any profile" ON profiles;
CREATE POLICY "OECS admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    has_permission(auth.uid(), 'members:manage')
    OR has_permission(auth.uid(), 'verification:review')
  );

-- ---------- Trophy artwork → achievement:manage (066) ----------

DROP POLICY IF EXISTS "Admins can upload trophy assets" ON storage.objects;
CREATE POLICY "Admins can upload trophy assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'achievement:manage'));

DROP POLICY IF EXISTS "Admins can update trophy assets" ON storage.objects;
CREATE POLICY "Admins can update trophy assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'achievement:manage'));

DROP POLICY IF EXISTS "Admins can delete trophy assets" ON storage.objects;
CREATE POLICY "Admins can delete trophy assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trophy-assets' AND has_permission(auth.uid(), 'achievement:manage'));

-- ---------- Documents attached to grants, events and applications ----------
--
-- These three read as plumbing and are not. Reviewing a grant application means
-- reading what the applicant attached to it, and until now the assessor branch
-- asked for org:manage — so a Programmes supervisor would have opened an
-- application with its evidence missing and no error to explain why. The same
-- argument applies to the event branches, which asked for the super_admin role
-- through is_oecs_admin().
--
-- Restated from 085 (can_view_document_parent, parent_upload_paths, the upload
-- policy) and from 090 (doc_access_role, which restated 085's). Bodies are
-- otherwise unchanged.

CREATE OR REPLACE FUNCTION can_view_document_parent(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'grant' THEN EXISTS (
      SELECT 1 FROM grants g
      WHERE g.id = p_entity_id
        AND (g.is_active = TRUE OR auth.uid() IS NOT NULL)
    )
    WHEN 'project' THEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_entity_id
        AND (
          p.is_public = TRUE
          OR p.owner_id = auth.uid()
          OR is_project_member(p.id, auth.uid())
        )
    )
    WHEN 'grant_application' THEN EXISTS (
      SELECT 1 FROM grant_applications a
      WHERE a.id = p_entity_id
        AND (a.user_id = auth.uid() OR has_permission(auth.uid(), 'grant:manage'))
    )
    WHEN 'event' THEN EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_entity_id
        AND (
          e.status <> 'draft'
          OR e.organizer_id = auth.uid()
          OR has_permission(auth.uid(), 'event:manage')
        )
    )
    WHEN 'event_solution' THEN EXISTS (
      SELECT 1 FROM event_solutions s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = p_entity_id
        AND (
          s.author_id = auth.uid()
          OR e.organizer_id = auth.uid()
          OR has_permission(auth.uid(), 'event:manage')
          OR (e.status <> 'draft' AND COALESCE(event_entries_closed(e.id), FALSE))
        )
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION doc_access_role(p_document_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_visibility TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_role TEXT;
BEGIN
  SELECT owner_id, visibility, entity_type, entity_id
    INTO v_owner_id, v_visibility, v_entity_type, v_entity_id
  FROM entity_documents WHERE id = p_document_id;

  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id = v_owner_id THEN
    RETURN 'owner';
  END IF;

  -- Platform admins administer every document (090: was an inline 'oecs' test).
  -- Left as the role check on purpose: this branch grants EDIT rights over
  -- somebody else's file, which is the Super Admin's to have and nobody
  -- else's. A supervisor reaches the read-only branches below instead.
  IF p_user_id IS NOT NULL AND is_platform_admin(p_user_id) THEN
    RETURN 'owner';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM document_access
    WHERE document_id = p_document_id AND user_id = p_user_id;
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;

  -- Assessors read what applicants attach — read only, never edit.
  IF v_entity_type = 'grant_application'
     AND p_user_id IS NOT NULL
     AND has_permission(p_user_id, 'grant:manage') THEN
    RETURN 'viewer';
  END IF;

  -- Organizers read what entrants attach to their challenge.
  IF v_entity_type = 'event_solution' AND p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM event_solutions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = v_entity_id AND e.organizer_id = p_user_id
  ) THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'public' THEN
    RETURN 'viewer';
  END IF;

  IF v_visibility = 'members' AND p_user_id IS NOT NULL THEN
    RETURN 'viewer';
  END IF;

  -- 'private' and 'restricted' need an explicit grant
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "Members can upload documents" ON entity_documents;
CREATE POLICY "Members can upload documents"
  ON entity_documents FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND CASE entity_type
      WHEN 'grant' THEN has_permission(auth.uid(), 'grant:manage')
      WHEN 'project' THEN (
        is_project_owner(entity_id, auth.uid())
        OR is_project_member(entity_id, auth.uid(), 'editor')
      )
      WHEN 'grant_application' THEN EXISTS (
        SELECT 1 FROM grant_applications a
        WHERE a.id = entity_id AND a.user_id = auth.uid()
      )
      WHEN 'event' THEN EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = entity_id
          AND (e.organizer_id = auth.uid() OR has_permission(auth.uid(), 'event:manage'))
      )
      WHEN 'event_solution' THEN EXISTS (
        SELECT 1 FROM event_solutions s
        JOIN events e ON e.id = s.event_id
        WHERE s.id = entity_id
          AND s.author_id = auth.uid()
          AND (e.submission_deadline IS NULL OR now() <= e.submission_deadline)
      )
      ELSE FALSE
    END
  );

CREATE OR REPLACE FUNCTION parent_upload_paths(p_entity_type TEXT, p_entity_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR p_entity_id IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF p_entity_type = 'project' THEN
    SELECT TRUE INTO v_allowed FROM projects
     WHERE id = p_entity_id AND owner_id = auth.uid();
  ELSIF p_entity_type = 'grant' THEN
    SELECT TRUE INTO v_allowed FROM grants
     WHERE id = p_entity_id
       AND ((created_by = auth.uid() AND has_permission(auth.uid(), 'grant:post'))
            OR has_permission(auth.uid(), 'grant:manage'));
  ELSIF p_entity_type = 'event' THEN
    SELECT TRUE INTO v_allowed FROM events
     WHERE id = p_entity_id
       AND (organizer_id = auth.uid() OR has_permission(auth.uid(), 'event:manage'));
  ELSIF p_entity_type = 'event_solution' THEN
    SELECT TRUE INTO v_allowed FROM event_solutions s
     JOIN events e ON e.id = s.event_id
     WHERE s.id = p_entity_id
       AND (s.author_id = auth.uid()
            OR e.organizer_id = auth.uid()
            OR has_permission(auth.uid(), 'event:manage'));
  ELSE
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF NOT COALESCE(v_allowed, FALSE) THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Deleting an event cascades to its solutions, so the caller has to clear
  -- the entrants' blobs as well as the organizer's — they get one list.
  IF p_entity_type = 'event' THEN
    RETURN COALESCE(
      (SELECT array_agg(d.storage_path)
         FROM entity_documents d
        WHERE d.storage_path IS NOT NULL
          AND (
            (d.entity_type = 'event' AND d.entity_id = p_entity_id)
            OR (d.entity_type = 'event_solution' AND d.entity_id IN (
              SELECT s.id FROM event_solutions s WHERE s.event_id = p_entity_id
            ))
          )),
      ARRAY[]::TEXT[]
    );
  END IF;

  RETURN COALESCE(
    (SELECT array_agg(storage_path)
       FROM entity_documents
      WHERE entity_type = p_entity_type
        AND entity_id = p_entity_id
        AND storage_path IS NOT NULL),
    ARRAY[]::TEXT[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ---------- The venue → event:manage (070) ----------
--
-- is_venue_host decides who may open a room, mute a participant and end a
-- session. It tested the legacy slug directly and org:manage beside it;
-- has_permission() resolves the alias itself, so one key replaces both.

CREATE OR REPLACE FUNCTION is_venue_host(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND organizer_id = p_user)
    OR has_permission(p_user, 'event:manage')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_venue_host(UUID, UUID) IS
  'Organizer of this event, or a holder of event:manage. The legacy oecs slug still resolves, through expand_roles() inside has_permission().';

-- ============================================================
-- 6. The privileged-column guard
--
-- Restated from 115. Without this the profiles policy above is not enough: the
-- guard raises for ANY actor that is not is_platform_admin() the moment
-- is_verified changes, so the People supervisor's Verify button would pass RLS
-- and then hit "verification state can only be changed by a platform admin".
--
-- The blanket admin exemption stays for super_admin. What changes is that two
-- of the branches below now ask for the capability that owns that column rather
-- than for the role: suspension asks moderation:escalate, verification asks
-- verification:review.
--
-- THE DERIVED-COLUMN BLOCKS ARE READ THROUGH JSONB, and that is not stylistic.
-- 115 added requires_consent / consent_recorded_at and referenced them directly
-- as NEW.requires_consent. A direct field reference on a record whose row type
-- lacks the column raises 42703 at RUNTIME, not at CREATE FUNCTION time — so
-- restating that text against a database where 115 has not been applied yet
-- installs a trigger that breaks EVERY profile UPDATE by a non-admin, with no
-- error until somebody tries it. `to_jsonb(NEW) ->> 'col'` returns NULL for an
-- absent key instead, so both sides compare equal and the branch is skipped:
-- the guard degrades to "cannot police a column this database does not have",
-- which is exactly right, and starts policing it the moment 115 lands.
--
-- Everything else — the self-assignable role check and the active_role check —
-- is 115's text unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_added TEXT[];
  v_illegal TEXT[];
  v_new JSONB := to_jsonb(NEW);
  v_old JSONB := to_jsonb(OLD);
BEGIN
  -- service_role has no JWT subject; trusted RPCs opt in explicitly.
  IF v_actor IS NULL OR current_setting('ktip.bypass_profile_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF is_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
      OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
      OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason)
     AND NOT has_permission(v_actor, 'moderation:escalate') THEN
    RAISE EXCEPTION 'suspension state can only be changed by a platform admin';
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT has_permission(v_actor, 'verification:review') THEN
    RAISE EXCEPTION 'verification state can only be changed by a platform admin';
  END IF;

  -- Age state is derived from account_age and is never a direct write. Even a
  -- platform admin goes through set_account_date_of_birth() so the declaration
  -- and the flag cannot disagree. (091.)
  IF v_new ->> 'is_minor' IS DISTINCT FROM v_old ->> 'is_minor'
     OR v_new ->> 'requires_age_declaration' IS DISTINCT FROM v_old ->> 'requires_age_declaration'
     OR v_new ->> 'age_declared_at' IS DISTINCT FROM v_old ->> 'age_declared_at' THEN
    RAISE EXCEPTION 'age status is derived from the declared date of birth and cannot be set directly';
  END IF;

  -- Consent state is derived from user_consents the same way, and for a
  -- stronger reason: this flag is the only thing standing between an account
  -- and the content it has not agreed to publish under. (115.)
  IF v_new ->> 'requires_consent' IS DISTINCT FROM v_old ->> 'requires_consent'
     OR v_new ->> 'consent_recorded_at' IS DISTINCT FROM v_old ->> 'consent_recorded_at' THEN
    RAISE EXCEPTION 'consent state is derived from recorded acceptances and cannot be set directly';
  END IF;

  -- Only newly ADDED roles are validated. Removing a role from yourself is
  -- always allowed, and existing rows are never re-checked — which is what
  -- keeps accounts that already hold faculty/student slugs editable.
  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    v_added := ARRAY(
      SELECT unnest(COALESCE(NEW.roles, ARRAY[]::TEXT[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.roles, ARRAY[]::TEXT[]))
    );

    SELECT ARRAY_AGG(slug) INTO v_illegal
    FROM unnest(v_added) AS slug
    WHERE NOT EXISTS (
      SELECT 1 FROM role_definitions rd
      WHERE rd.slug = slug AND rd.is_self_assignable
    );

    IF v_illegal IS NOT NULL AND array_length(v_illegal, 1) > 0 THEN
      RAISE EXCEPTION 'role(s) % require verification or an administrator', array_to_string(v_illegal, ', ');
    END IF;
  END IF;

  -- The active context must be a role the account actually holds.
  IF NEW.active_role IS NOT NULL AND NOT (NEW.active_role = ANY(COALESCE(NEW.roles, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION 'active_role % is not held by this account', NEW.active_role;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 7. SECURITY DEFINER functions whose body IS the boundary
--
-- These bypass RLS, so re-keying their policies would have achieved nothing —
-- the check inside each body is the whole authorization. All four asked for
-- org:manage or for the super_admin role.
-- ============================================================

-- 066. /admin/achievements writes through this, not through a table policy —
-- badges has SELECT-only RLS.
CREATE OR REPLACE FUNCTION admin_upsert_badge(
  p_slug TEXT,
  p_name TEXT,
  p_description TEXT,
  p_icon TEXT,
  p_color TEXT,
  p_category TEXT,
  p_rarity TEXT,
  p_tier TEXT,
  p_tier_group TEXT,
  p_check_key TEXT,
  p_check_value INT,
  p_is_hidden BOOLEAN,
  p_sort_order INT,
  p_trophy_type TEXT,
  p_image_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'achievement:manage') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO badges (
    slug, name, description, icon, color, category, rarity, points,
    tier, tier_group, check_key, check_value, is_hidden, sort_order,
    trophy_type, image_url
  )
  VALUES (
    p_slug, p_name, p_description, COALESCE(p_icon, 'award'), COALESCE(p_color, 'ocean'),
    COALESCE(p_category, 'community'), COALESCE(p_rarity, 'common'), rarity_points(p_rarity),
    p_tier, p_tier_group, p_check_key, p_check_value, COALESCE(p_is_hidden, FALSE),
    COALESCE(p_sort_order, 0), p_trophy_type, p_image_url
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
    color = EXCLUDED.color, category = EXCLUDED.category, rarity = EXCLUDED.rarity,
    points = EXCLUDED.points, tier = EXCLUDED.tier, tier_group = EXCLUDED.tier_group,
    check_key = EXCLUDED.check_key, check_value = EXCLUDED.check_value,
    is_hidden = EXCLUDED.is_hidden, sort_order = EXCLUDED.sort_order,
    trophy_type = EXCLUDED.trophy_type, image_url = EXCLUDED.image_url
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 066.
CREATE OR REPLACE FUNCTION admin_upsert_trophy_asset(
  p_type TEXT,
  p_tier TEXT,
  p_image_url TEXT,
  p_alt_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'achievement:manage') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  INSERT INTO trophy_assets (type, tier, image_url, alt_text, updated_at)
  VALUES (p_type, p_tier, p_image_url, COALESCE(p_alt_text, ''), now())
  ON CONFLICT (type, tier) DO UPDATE
  SET image_url = EXCLUDED.image_url,
      alt_text = EXCLUDED.alt_text,
      updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 058, last restated by 090. Verifying an employer is the Programmes seat's job.
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
  -- SECURITY DEFINER bypasses RLS, so the check has to be explicit here.
  IF NOT has_permission(v_actor, 'employer:manage') THEN
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

-- 081, last restated by 090. Reached from the org team screens.
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
    OR has_permission(p_user_id, 'employer:manage')
  );
$$;

-- 111. Same substitution, same reason.
CREATE OR REPLACE FUNCTION is_employer_owner(p_employer_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    has_permission(p_user_id, 'employer:manage')
    OR EXISTS (SELECT 1 FROM employers e WHERE e.id = p_employer_id AND e.created_by = p_user_id)
    OR EXISTS (
      SELECT 1 FROM employer_members m
      WHERE m.employer_id = p_employer_id AND m.user_id = p_user_id AND m.role = 'owner'
    )
  );
$$;

-- ============================================================
-- 8. The escalation ceiling
--
-- set_user_roles() validated only that a slug exists, so any holder of
-- role:manage could assign super_admin — to anyone, including themselves. Only
-- the Super Admin holds role:manage today, which makes this belt-and-braces
-- rather than a live hole; it is also the thing that makes delegating
-- role:manage later a decision rather than a mistake.
--
-- 063's body, with one added check.
-- ============================================================

CREATE OR REPLACE FUNCTION set_user_roles(p_user UUID, p_roles TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_unknown TEXT[];
  v_admin_tier TEXT[];
BEGIN
  IF NOT has_permission(v_actor, 'role:manage') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT ARRAY_AGG(slug) INTO v_unknown
  FROM unnest(COALESCE(p_roles, ARRAY[]::TEXT[])) AS slug
  WHERE NOT EXISTS (SELECT 1 FROM role_definitions rd WHERE rd.slug = slug);

  IF v_unknown IS NOT NULL AND array_length(v_unknown, 1) > 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unknown_role', 'roles', v_unknown);
  END IF;

  -- An admin-tier seat can only be handed out by someone who already holds the
  -- top one. Checked against the tier in role_definitions rather than a list of
  -- slugs, so a future admin role is covered the day it is defined.
  IF NOT is_platform_admin(v_actor) THEN
    SELECT ARRAY_AGG(rd.slug) INTO v_admin_tier
    FROM unnest(COALESCE(p_roles, ARRAY[]::TEXT[])) AS slug
    JOIN role_definitions rd ON rd.slug = slug
    WHERE rd.tier = 'admin';

    IF v_admin_tier IS NOT NULL AND array_length(v_admin_tier, 1) > 0 THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'reason', 'admin_tier_requires_super_admin',
        'roles', v_admin_tier
      );
    END IF;
  END IF;

  PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);

  UPDATE profiles
  SET roles = COALESCE(p_roles, ARRAY[]::TEXT[]),
      active_role = CASE
        WHEN active_role = ANY(COALESCE(p_roles, ARRAY[]::TEXT[])) THEN active_role
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_user;

  PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ============================================================
-- 9. The super_admin column cannot be switched off
--
-- /admin/roles renders that column locked (isCellLocked in
-- src/lib/permissions.ts), but the UPDATE policy on role_permissions does not
-- know about it. One toggle against the API and the platform owner loses
-- role:manage, with no way back in from the app — the matrix is the only screen
-- that could restore it, and it would now be refused.
--
-- Setting a super_admin cell to TRUE is still allowed, so reset_role_permissions()
-- and the seed above keep working.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_super_admin_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role_slug = 'super_admin' AND NEW.allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'the Super Admin permission column cannot be revoked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_super_admin_permissions_trigger ON role_permissions;
CREATE TRIGGER guard_super_admin_permissions_trigger
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION guard_super_admin_permissions();

-- ============================================================
-- 10. Comments
-- ============================================================

COMMENT ON FUNCTION guard_super_admin_permissions() IS
  'Refuses any UPDATE that would set a super_admin permission cell to anything but TRUE.';

COMMENT ON FUNCTION set_user_roles(UUID, TEXT[]) IS
  'Admin-side role assignment. Requires role:manage; admin-tier slugs additionally require super_admin (116).';
