-- ============================================================
-- Migration 138: every submitted application has a copy to download
--
-- Reported by an applicant: "would love to download my submitted grant
-- applications as a PDF for my own records and for sharing with co-founders".
--
-- Most of that already works — 051 writes a submission_receipts row on the
-- draft -> submitted transition, and /dashboard/submissions/:id renders it with
-- a "Print / Save as PDF" control. What does not work is the applications that
-- were already submitted when 051 landed: its trigger fires on transition, and
-- those rows had transitioned already. They have no receipt, so
-- MyApplicationsPage shows them no copy link at all, and there is nothing for
-- an applicant to download.
--
-- This writes the missing rows once, using the same shape the trigger uses.
--
-- Deliberately no notifications. The trigger notifies on submit because
-- something just happened; announcing a months-old application to its author
-- would be a lie about what changed.
--
-- Idempotent — safe to re-run. ON CONFLICT is on 051's UNIQUE
-- (source_table, source_id), so a second run inserts nothing.
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
  -- The submission time itself was never recorded on the row. updated_at is
  -- the closest honest answer: for a submitted application it is the moment of
  -- the status change unless it was reviewed later. created_at would be wrong
  -- in the other direction, naming the day the draft was started.
  COALESCE(a.updated_at, a.created_at)
FROM grant_applications a
LEFT JOIN grants g ON g.id = a.grant_id
WHERE a.status <> 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM submission_receipts r
    WHERE r.source_table = 'grant_applications' AND r.source_id = a.id
  )
ON CONFLICT (source_table, source_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
