-- ============================================================
-- Migration status checker for OECS KTIP
-- Run this in the Supabase SQL Editor.
-- Each migration is probed by a distinctive object it creates
-- (table / column / function / policy / index / storage bucket).
-- Result: one row per migration, "MISSING - RUN" = needs to be run.
-- Run missing migrations in ascending numeric order.
-- ============================================================

WITH m(num, mfile, kind, t1, t2) AS (
  VALUES
  ('000', '000_create_profiles_table.sql',            'table',    'profiles', NULL),
  ('001', '001_create_projects_table.sql',            'table',    'projects', NULL),
  ('002', '002_create_events_table.sql',              'table',    'events', NULL),
  ('003', '003_create_grants_table.sql',              'table',    'grants', NULL),
  ('004', '004_create_messages_table.sql',            'table',    'messages', NULL),
  ('005', '005_create_forums_table.sql',              'table',    'forum_boards', NULL),
  ('006', '006_create_avatars_storage.sql',           'bucket',   'avatars', NULL),
  ('007', '007_admin_events_system.sql',              'table',    'event_updates', NULL),
  ('008', '008_event_registration_forms.sql',         'column',   'events', 'registration_fields'),
  ('009', '009_event_page_sections.sql',              'table',    'event_page_sections', NULL),
  ('010', '010_event_schedule_speakers.sql',          'table',    'event_speakers', NULL),
  ('011', '011_fix_event_default_status.sql',         'coldefault','events|status', 'draft'),
  ('012', '012_admin_dashboard_policies.sql',         'policy',   'OECS admins can update any profile', 'profiles'),
  ('013', '013_climate_action_tags.sql',              'column',   'projects', 'is_climate_action'),
  ('014', '014_member_directory.sql',                 'column',   'profiles', 'skills'),
  ('015', '015_resource_library.sql',                 'table',    'resources', NULL),
  ('016', '016_analytics_functions.sql',              'function', 'get_user_growth', NULL),
  ('017', '017_notifications.sql',                    'table',    'notifications', NULL),
  ('018', '018_grievances.sql',                       'table',    'grievances', NULL),
  ('019', '019_whiteboards.sql',                      'table',    'whiteboards', NULL),
  ('020', '020_whiteboard_permissions.sql',           'policy',   'Shared editors can update whiteboards', 'whiteboards'),
  ('021', '021_preregistrations.sql',                 'table',    'preregistrations', NULL),
  ('022', '022_analytics.sql',                        'table',    'analytics_events', NULL),
  ('023', '023_uat_responses.sql',                    'table',    'uat_responses', NULL),
  ('024', '024_featured_projects.sql',                'column',   'projects', 'is_featured'),
  ('025', '025_proposals.sql',                        'table',    'proposals', NULL),
  ('026', '026_documents.sql',                        'table',    'documents', NULL),
  ('027', '027_storage_buckets.sql',                  'bucket',   'event-assets', NULL),
  ('028', '028_profiles_delete.sql',                  'policy',   'Users can delete their own profile', 'profiles'),
  ('029', '029_conversations_update.sql',             'policy',   'Participants can update own conversations', 'conversations'),
  ('030', '030_admin_projects_policies.sql',          'policy',   'OECS admins can update any project', 'projects'),
  ('031', '031_project_members.sql',                  'table',    'project_members', NULL),
  ('032', '032_project_engagement.sql',               'table',    'project_follows', NULL),
  ('033', '033_connections.sql',                      'table',    'connections', NULL),
  ('034', '034_group_messaging.sql',                  'column',   'conversations', 'is_group'),
  ('035', '035_verification.sql',                     'table',    'verification_requests', NULL),
  ('036', '036_notification_preferences.sql',         'table',    'notification_preferences', NULL),
  ('037', '037_feedback.sql',                         'table',    'feedback', NULL),
  ('038', '038_integrations.sql',                     'table',    'integrations', NULL),
  ('039', '039_badges.sql',                           'table',    'badges', NULL),
  ('040', '040_security_fixes.sql',                   'policy',   'Admins can read UAT responses', 'uat_responses'),
  ('041', '041_expand_profile_fields.sql',            'column',   'profiles', 'organization'),
  ('042', '042_hero_summaries.sql',                   'column',   'projects', 'summary'),
  ('043', '043_entity_details.sql',                   'column',   'grants', 'details'),
  ('044', '044_oauth_profile_metadata.sql',           'funcsrc',  'handle_new_user', '%full_name%'),
  ('045', '045_grant_application_wizard.sql',         'column',   'grant_applications', 'current_step'),
  ('046', '046_progress_history.sql',                 'table',    'grant_application_events', NULL),
  ('047', '047_user_badges_badge_index.sql',          'index',    'idx_user_badges_badge', NULL),
  ('048', '048_entity_documents.sql',                 'table',    'entity_documents', NULL),
  ('049', '049_connection_count_visibility.sql',      'function', 'get_connection_count', NULL),
  ('050', '050_summaries_and_tags.sql',               'column',   'integrations', 'summary'),
  ('051', '051_submission_receipts.sql',              'table',    'submission_receipts', NULL),
  ('052', '052_snippets.sql',                         'table',    'snippets', NULL),
  ('053', '053_collab_invites.sql',                   'function', 'guard_share_recipient_update', NULL),
  ('054', '054_email_invites.sql',                    'table',    'email_invites', NULL),
  ('055', '055_personalization.sql',                  'table',    'user_personalization', NULL),
  ('056', '056_email_aliases.sql',                    'table',    'user_email_aliases', NULL),
  ('058', '058_employers.sql',                        'table',    'employers', NULL),
  ('059', '059_partner_api.sql',                      'table',    'api_clients', NULL),
  ('060', '060_grants_tags.sql',                      'column',   'grants', 'tags'),
  ('061', '061_personalization_scoring.sql',          'function', 'rank_content', NULL),
  ('062', '062_event_challenge.sql',                  'table',    'event_criteria', NULL),
  ('063', '063_rbac_permissions.sql',                 'table',    'role_definitions', NULL),
  ('064', '064_institutions_safeguarding_chamber.sql','table',    'institutions', NULL),
  ('065', '065_moderation.sql',                       'table',    'content_reports', NULL),
  ('066', '066_achievements_engine.sql',              'column',   'badges', 'check_key'),
  ('067', '067_achievement_definitions.sql',          'funcsrc',  '__seed_only__', NULL),
  ('068', '068_vc_sso.sql',                           'table',    'vc_identities', NULL),
  ('069', '069_resumes.sql',                          'table',    'resumes', NULL),
  ('070', '070_event_venue.sql',                      'table',    'venue_rooms', NULL),
  ('077', '077_ownership_and_upload_cleanup.sql',     'function', 'reap_entity_documents', NULL),
  ('078', '078_resume_design.sql',                    'column',   'resumes', 'design'),
  ('079', '079_project_join_requests.sql',            'table',    'project_join_requests', NULL),
  ('080', '080_grant_application_documents.sql',      'function', 'can_view_document_parent', NULL),
  ('081', '081_employer_portfolio.sql',               'table',    'employer_portfolio_items', NULL),
  ('082', '082_profile_contact_fields.sql',           'column',   'profiles', 'phone'),
  ('083', '083_profile_visibility.sql',               'function', 'can_view_profile', NULL),
  ('084', '084_challenge_events_and_documents.sql',   'funcsrc',  'parent_upload_paths', '%event%'),
  ('085', '085_event_solutions.sql',                  'table',    'event_solutions', NULL),
  ('086', '086_message_read_state.sql',               'function', 'mark_conversation_read', NULL),
  ('087', '087_readable_slugs.sql',                   'function', 'slugify', NULL),
  ('088', '088_more_achievements.sql',                'funcsrc',  '__seed_only__', NULL),
  ('089', '089_venue_map.sql',                        'column',   'events', 'venue_map'),
  ('090', '090_admin_capability_and_event_permission.sql', 'function', 'is_oecs_admin', NULL),
  -- 091 was used twice. Both files are real and independent (one touches
  -- profiles, the other venue_rooms) — run BOTH, in either order.
  ('091', '091_account_age.sql',                      'table',    'account_age', NULL),
  ('091', '091_venue_room_sections.sql',              'column',   'venue_rooms', 'sections'),
  ('092', '092_event_type_fields.sql',                'column',   'events', 'registration_closes_at'),
  ('093', '093_sticky_notes_and_feedback_capture.sql','table',    'sticky_notes', NULL),
  ('094', '094_sticky_notes_rich.sql',                'table',    'sticky_note_groups', NULL),
  ('095', '095_message_attachments.sql',              'column',   'messages', 'attachments'),
  ('096', '096_event_registration_approval.sql',      'column',   'event_rsvps', 'attendance_type'),
  ('097', '097_translations.sql',                     'table',    'translations', NULL),
  ('098', '098_decision_notifications.sql',           'function', 'notify_grant_application_decision', NULL)
),
checked AS (
  SELECT
    num, mfile, kind, t1, t2,
    CASE kind
      WHEN 'table' THEN
        to_regclass('public.' || t1) IS NOT NULL
      WHEN 'index' THEN
        to_regclass('public.' || t1) IS NOT NULL
      WHEN 'column' THEN
        EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = t1 AND c.column_name = t2)
      WHEN 'function' THEN
        EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = t1)
      WHEN 'policy' THEN
        EXISTS (SELECT 1 FROM pg_policies pol
                WHERE pol.schemaname = 'public' AND pol.policyname = t1 AND pol.tablename = t2)
      WHEN 'bucket' THEN
        EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = t1)
      WHEN 'coldefault' THEN
        EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name  = split_part(t1, '|', 1)
                  AND c.column_name = split_part(t1, '|', 2)
                  AND c.column_default LIKE '%' || t2 || '%')
      WHEN 'funcsrc' THEN
        CASE WHEN t1 = '__seed_only__' THEN NULL  -- 067, 088: pure data seeds, cannot detect from catalogs
             ELSE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = t1 AND p.prosrc LIKE t2)
        END
    END AS applied
  FROM m
)
SELECT
  num  AS "#",
  mfile AS migration_file,
  CASE
    WHEN applied IS NULL THEN 'SEED - data only, re-run is idempotent'
    WHEN applied         THEN 'applied'
    ELSE                      'MISSING - RUN'
  END AS status,
  kind || ': ' || t1 || COALESCE('.' || t2, '') AS probe
FROM checked
ORDER BY num, mfile;
