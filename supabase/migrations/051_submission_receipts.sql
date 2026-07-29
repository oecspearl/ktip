-- 051: Submission receipts — applicants keep an immutable copy of what they sent.
--
-- Every grant application, event registration and grievance report writes one
-- receipt row holding a frozen snapshot of the answers, plus the field labels
-- needed to render them later. Receipts are written exclusively by triggers
-- (same trigger-only + read-only-RLS pattern as grant_application_events in 046),
-- so the client cannot skip, forge or backdate one.

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE IF NOT EXISTS submission_receipts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('grant_application', 'event_registration', 'grievance')),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_config JSONB,
  template_key TEXT,
  link TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_receipts_user
  ON submission_receipts(user_id, submitted_at DESC);

COMMENT ON COLUMN submission_receipts.data IS 'Frozen snapshot of the submitted answers';
COMMENT ON COLUMN submission_receipts.field_config IS 'Frozen field definitions (events.registration_fields) so labels survive later form edits';
COMMENT ON COLUMN submission_receipts.template_key IS 'Tells the renderer which label source to use';

-- ============================================================
-- RLS: read-only. Writes happen exclusively via triggers, so there
-- are deliberately no INSERT/UPDATE/DELETE policies.
-- ============================================================

ALTER TABLE submission_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own receipts" ON submission_receipts;
CREATE POLICY "Users can view own receipts" ON submission_receipts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all receipts" ON submission_receipts;
CREATE POLICY "Admins can view all receipts" ON submission_receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND 'oecs' = ANY(roles)
    )
  );

-- ============================================================
-- Triggers. SECURITY DEFINER is required: submission_receipts has no
-- INSERT policy, and the notifications insert must bypass
-- send_notification()'s no-self-notification rule (a receipt IS a
-- self-notification). The check_notification_prefs BEFORE INSERT
-- trigger still applies; type 'submission_receipt' is uncategorised
-- there, so it always delivers.
-- ============================================================

CREATE OR REPLACE FUNCTION log_grant_application_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  grant_title TEXT;
BEGIN
  -- Only on the draft -> submitted transition (or a row created already submitted)
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT g.title INTO grant_title FROM grants g WHERE g.id = NEW.grant_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    NEW.user_id,
    'grant_application',
    'grant_applications',
    NEW.id,
    COALESCE(NULLIF(NEW.application_data->>'title', ''), 'Untitled Application'),
    grant_title,
    COALESCE(NEW.application_data, '{}'::jsonb),
    'grant_application_v1',
    '/grants/' || NEW.grant_id::text,
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'submission_receipt',
      'Application received',
      'Your application to ' || COALESCE(grant_title, 'this grant') ||
        ' was submitted. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grant_application_receipt ON grant_applications;
CREATE TRIGGER trg_grant_application_receipt
  AFTER INSERT OR UPDATE OF status ON grant_applications
  FOR EACH ROW EXECUTE FUNCTION log_grant_application_receipt();


CREATE OR REPLACE FUNCTION log_event_registration_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  ev RECORD;
BEGIN
  SELECT e.title, e.start_date, e.registration_fields
    INTO ev
    FROM events e WHERE e.id = NEW.event_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, field_config, template_key, link, submitted_at
  )
  VALUES (
    NEW.user_id,
    'event_registration',
    'event_rsvps',
    NEW.id,
    COALESCE(ev.title, 'Event registration'),
    to_char(ev.start_date AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
    COALESCE(NEW.registration_data, '{}'::jsonb),
    COALESCE(ev.registration_fields, '[]'::jsonb),
    'event_registration',
    '/events/' || NEW.event_id::text,
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'submission_receipt',
      'Registration confirmed',
      'You registered for ' || COALESCE(ev.title, 'an event') ||
        '. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_registration_receipt ON event_rsvps;
CREATE TRIGGER trg_event_registration_receipt
  AFTER INSERT ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION log_event_registration_receipt();


CREATE OR REPLACE FUNCTION log_grievance_receipt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_id UUID;
  reported_name TEXT;
BEGIN
  SELECT p.display_name INTO reported_name
    FROM profiles p WHERE p.id = NEW.reported_user_id;

  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    NEW.reporter_id,
    'grievance',
    'grievances',
    NEW.id,
    'Report: ' || NEW.category,
    CASE WHEN reported_name IS NOT NULL THEN 'Regarding ' || reported_name END,
    jsonb_build_object(
      'category', NEW.category,
      'description', NEW.description,
      'evidence_url', NEW.evidence_url,
      'context', NEW.context
    ),
    'grievance_v1',
    '/grievances/my-reports',
    NOW()
  )
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.reporter_id,
      'submission_receipt',
      'Report received',
      'Your report was submitted. A copy is saved in your dashboard.',
      '/dashboard/submissions/' || receipt_id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grievance_receipt ON grievances;
CREATE TRIGGER trg_grievance_receipt
  AFTER INSERT ON grievances
  FOR EACH ROW EXECUTE FUNCTION log_grievance_receipt();

-- ============================================================
-- Keep the live application row matching its receipt: applicants may
-- only edit drafts. The explicit WITH CHECK is required — without it
-- Postgres reuses USING for the new row and the draft -> pending
-- submit would reject itself. Admin approve/reject uses the separate
-- admin policy from 012 and is unaffected.
-- ============================================================

DROP POLICY IF EXISTS "Users can update their own applications" ON grant_applications;
CREATE POLICY "Users can update their own applications"
  ON grant_applications FOR UPDATE
  USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Backfill existing submissions. No notifications for these.
-- ============================================================

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, template_key, link, submitted_at
)
SELECT
  a.user_id,
  'grant_application',
  'grant_applications',
  a.id,
  COALESCE(NULLIF(a.application_data->>'title', ''), 'Untitled Application'),
  g.title,
  COALESCE(a.application_data, '{}'::jsonb),
  'grant_application_v1',
  '/grants/' || a.grant_id::text,
  a.created_at
FROM grant_applications a
LEFT JOIN grants g ON g.id = a.grant_id
WHERE a.status <> 'draft'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, field_config, template_key, link, submitted_at
)
SELECT
  r.user_id,
  'event_registration',
  'event_rsvps',
  r.id,
  COALESCE(e.title, 'Event registration'),
  to_char(e.start_date AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY'),
  COALESCE(r.registration_data, '{}'::jsonb),
  COALESCE(e.registration_fields, '[]'::jsonb),
  'event_registration',
  '/events/' || r.event_id::text,
  r.created_at
FROM event_rsvps r
LEFT JOIN events e ON e.id = r.event_id
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO submission_receipts (
  user_id, kind, source_table, source_id, title, subtitle,
  data, template_key, link, submitted_at
)
SELECT
  gr.reporter_id,
  'grievance',
  'grievances',
  gr.id,
  'Report: ' || gr.category,
  CASE WHEN p.display_name IS NOT NULL THEN 'Regarding ' || p.display_name END,
  jsonb_build_object(
    'category', gr.category,
    'description', gr.description,
    'evidence_url', gr.evidence_url,
    'context', gr.context
  ),
  'grievance_v1',
  '/grievances/my-reports',
  gr.created_at
FROM grievances gr
LEFT JOIN profiles p ON p.id = gr.reported_user_id
ON CONFLICT (source_table, source_id) DO NOTHING;
