-- ============================================================================
-- 178_role_labels_one_set.sql — one name per role, everywhere
-- ============================================================================
-- The client had two label sets. The catalog (src/lib/permissions.ts) carried
-- admin-console wording with personal names in it ("People & Trust Supervisor
-- (Marvin)", "Programmes Supervisor (Royston)", "Student (school-verified)"),
-- and a hand-written override in constants.ts renamed seven roles back to
-- their 2025 wording ("Faculty/Researcher", "Student/Youth Innovator"). The
-- role switcher read one set and the navbar trigger the other, so the same
-- member showed two names in the same menu.
--
-- The client now reads the catalog only, cleaned up. This brings
-- role_definitions.label to the same strings, so anything that reads the
-- table — SQL-side notification text, the admin roles page's live catalog,
-- reports run in the dashboard — says the same thing.
--
-- chamber_admin becomes "Business Association": the role is the body that
-- verifies businesses in a member state, whether that is a Chamber of
-- Commerce, an incubator or an MSME agency.
--
-- Labels only. Slugs, tiers, permissions and descriptions are unchanged.
-- Idempotent — safe to re-run. No client change required to apply it first.
-- ============================================================================

UPDATE role_definitions AS rd
SET label = v.label
FROM (VALUES
  ('super_admin',          'Super Admin'),
  ('admin',                'Admin'),
  ('people_supervisor',    'People & Trust Supervisor'),
  ('programme_supervisor', 'Programmes Supervisor'),
  ('safety_admin',         'Safety Admin'),
  ('oecs',                 'OECS Admin'),
  ('investor',             'Investor / Funding Agency'),
  ('private_sector',       'Private Sector'),
  ('educational_partner',  'Post-Secondary Institution'),
  ('chamber_admin',        'Business Association'),
  ('ngo',                  'Non-Governmental Organization'),
  ('research_institution', 'Research Institution'),
  ('government',           'Government Ministry / Agency'),
  ('diaspora',             'Diaspora Association / Network'),
  ('igo',                  'Inter-governmental Regional Organization'),
  ('entrepreneur',         'Entrepreneur'),
  ('faculty',              'Faculty'),
  ('ip_legal',             'IP / Legal Professional'),
  ('researcher',           'Researcher'),
  ('mentor',               'Mentor'),
  ('student',              'Student')
) AS v(slug, label)
WHERE rd.slug = v.slug
  AND rd.label IS DISTINCT FROM v.label;

-- Verify:
--   SELECT slug, label FROM role_definitions ORDER BY sort_order;
