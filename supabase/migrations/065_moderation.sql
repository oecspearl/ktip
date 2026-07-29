-- Migration 065: Content reporting and automated moderation
--
-- What exists today: grievances (018), which reports a PERSON. There is no way
-- to report a post, a reply, a comment or a message, and no way to hide one —
-- forum_posts has is_pinned and nothing else, and its SELECT policy is
-- USING (TRUE), so content is world-readable the instant it is written.
--
-- Two design points worth stating up front.
--
-- Enforcement is at INSERT, not after. `messages` is in the supabase_realtime
-- publication (004): the client is subscribed to INSERT events, so a row that
-- is written and then hidden has already been delivered to the recipient's
-- open socket. Anything that must never be seen has to be classified before
-- the row lands, which is why scan_content() is a deterministic BEFORE INSERT
-- trigger rather than a call out to a model. api/moderate.ts adds an LLM
-- second opinion afterwards, for triage only — it never gates delivery.
--
-- The SELECT policies here REPLACE the permissive ones. RLS ORs policies
-- together, so adding a status-aware policy alongside USING (TRUE) would hide
-- nothing at all.
--
-- Idempotent — safe to re-run. Requires 063 and 064.

-- ============================================================
-- 1. Content status
-- ============================================================

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE forum_posts DROP CONSTRAINT IF EXISTS forum_posts_status_check;
ALTER TABLE forum_posts ADD CONSTRAINT forum_posts_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE forum_replies DROP CONSTRAINT IF EXISTS forum_replies_status_check;
ALTER TABLE forum_replies ADD CONSTRAINT forum_replies_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE project_comments DROP CONSTRAINT IF EXISTS project_comments_status_check;
ALTER TABLE project_comments ADD CONSTRAINT project_comments_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('active', 'quarantined', 'removed'));

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS moderation_severity TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS moderation_severity TEXT;

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_forum_posts_status ON forum_posts(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_forum_replies_status ON forum_replies(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_project_comments_status ON project_comments(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status <> 'active';

-- ============================================================
-- 2. Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS moderation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- N distinct reporters within X minutes auto-quarantines the target.
  report_threshold INTEGER NOT NULL DEFAULT 3 CHECK (report_threshold > 0),
  report_window_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (report_window_minutes > 0),
  auto_quarantine_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  low_action TEXT NOT NULL DEFAULT 'warned',
  medium_action TEXT NOT NULL DEFAULT 'quarantined',
  high_action TEXT NOT NULL DEFAULT 'suspended',
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO moderation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Term list. country_code scopes a regional slur to the one member state where
-- it is a slur, so a word that is innocuous in Dominica is not flagged there
-- because it is offensive elsewhere.
CREATE TABLE IF NOT EXISTS moderation_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'term' CHECK (kind IN ('term', 'regex')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  category TEXT CHECK (category IS NULL OR category IN (
    'hate_harassment', 'bullying', 'nsfw', 'spam_scam', 'grooming_risk', 'pii_leak'
  )),
  country_code CHAR(2) REFERENCES countries(code),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expression index rather than a table constraint: a global rule and a
-- country-scoped rule may share a pattern, but two global ones may not.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_terms_unique
  ON moderation_terms (pattern, COALESCE(country_code, 'ZZ'));

CREATE INDEX IF NOT EXISTS idx_moderation_terms_active ON moderation_terms(severity) WHERE is_active;

-- Seed: PII and grooming patterns only. Slur lists are intentionally NOT
-- shipped in source control — they are regional, they change, and they belong
-- to the safety team. Admins add them from /admin/moderation.
INSERT INTO moderation_terms (pattern, kind, severity, category, note) VALUES
  ('(\+?\d[\d\s().-]{7,}\d)', 'regex', 'medium', 'pii_leak', 'Phone number'),
  ('([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'regex', 'low', 'pii_leak', 'Email address'),
  ('(\d{1,5}\s+[A-Za-z0-9.\s]{3,40}\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr))', 'regex', 'medium', 'pii_leak', 'Street address'),
  ('((instagram|snapchat|tiktok|telegram|whatsapp|wa\.me)\.?(com)?/[A-Za-z0-9_.]+)', 'regex', 'medium', 'pii_leak', 'Personal social link'),
  ('(don''?t tell (your |any)?(parents|mum|mom|dad|teacher))', 'regex', 'high', 'grooming_risk', 'Secrecy request'),
  ('(keep this (a )?secret between us)', 'regex', 'high', 'grooming_risk', 'Secrecy request'),
  ('(how old are you|what''?s your age).{0,40}(send|pic|photo|alone)', 'regex', 'high', 'grooming_risk', 'Age probing plus solicitation'),
  ('(meet me|come over).{0,30}(alone|without)', 'regex', 'high', 'grooming_risk', 'Isolation request')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. Reports
-- ============================================================

CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'forum_post', 'forum_reply', 'project', 'project_comment', 'message', 'profile', 'grant'
  )),
  target_id UUID NOT NULL,
  target_author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'hate_harassment', 'bullying', 'nsfw', 'spam_scam', 'grooming_risk', 'pii_leak'
  )),
  detail TEXT,
  -- Frozen at report time so triage survives the author editing or deleting.
  content_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One report per person per item: the auto-quarantine threshold counts
  -- reporters, so it must not be gameable by one user filing repeatedly.
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_open ON content_reports(created_at DESC) WHERE status = 'open';

-- Append-only. Written by SECURITY DEFINER functions only — no write policies,
-- the pattern 059 uses for api_access_log.
CREATE TABLE IF NOT EXISTS moderation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('system', 'admin', 'reporter')),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id UUID,
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  action TEXT NOT NULL CHECK (action IN (
    'flagged', 'warned', 'quarantined', 'restored', 'removed', 'suspended', 'escalated'
  )),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_user ON moderation_log(user_id);

-- ============================================================
-- 4. Scanner
-- ============================================================

CREATE OR REPLACE FUNCTION scan_content(p_text TEXT, p_country CHAR(2) DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_matches JSONB := '[]'::JSONB;
  v_rank INTEGER := 0;  -- 0 none, 1 low, 2 medium, 3 high
  v_hit BOOLEAN;
BEGIN
  IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
    RETURN jsonb_build_object('severity', NULL, 'matches', v_matches);
  END IF;

  -- Ordered high-first so matches[0] names the worst rule, which is what the
  -- quarantine record uses as its category.

  FOR v_rule IN
    SELECT id, pattern, kind, severity, category
    FROM moderation_terms
    WHERE is_active
      AND (country_code IS NULL OR country_code = p_country)
    ORDER BY CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
  LOOP
    IF v_rule.kind = 'regex' THEN
      v_hit := p_text ~* v_rule.pattern;
    ELSE
      -- Word-boundary match so "class" does not trip a rule for "ass".
      v_hit := p_text ~* ('\m' || regexp_replace(v_rule.pattern, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M');
    END IF;

    IF v_hit THEN
      v_matches := v_matches || jsonb_build_object(
        'rule_id', v_rule.id,
        'severity', v_rule.severity,
        'category', v_rule.category
      );

      -- Highest severity across all matched rules wins.
      v_rank := GREATEST(v_rank, CASE v_rule.severity
        WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'severity', CASE v_rank WHEN 3 THEN 'high' WHEN 2 THEN 'medium' WHEN 1 THEN 'low' ELSE NULL END,
    'matches', v_matches
  );
END;
$$;

REVOKE ALL ON FUNCTION scan_content(TEXT, CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scan_content(TEXT, CHAR) TO authenticated;

-- ============================================================
-- 5. Insert-time moderation
-- ============================================================

-- One trigger for all four content tables. The column holding the text and
-- the column holding the author differ per table, so both are passed as
-- trigger arguments rather than branching on TG_TABLE_NAME.
--   TG_ARGV[0] = text column, TG_ARGV[1] = author column
CREATE OR REPLACE FUNCTION moderate_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT;
  v_author UUID;
  v_country CHAR(2);
  v_scan JSONB;
  v_severity TEXT;
  v_settings moderation_settings%ROWTYPE;
  v_row JSONB := to_jsonb(NEW);
  v_target TEXT;
BEGIN
  v_text := v_row ->> TG_ARGV[0];
  v_author := (v_row ->> TG_ARGV[1])::UUID;

  -- content_reports.target_type is singular; TG_TABLE_NAME is the plural table.
  v_target := CASE TG_TABLE_NAME
    WHEN 'forum_posts' THEN 'forum_post'
    WHEN 'forum_replies' THEN 'forum_reply'
    WHEN 'project_comments' THEN 'project_comment'
    WHEN 'messages' THEN 'message'
    ELSE TG_TABLE_NAME
  END;

  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  SELECT upper(left(COALESCE(p.country, ''), 2)) INTO v_country FROM profiles p WHERE p.id = v_author;

  v_scan := scan_content(v_text, NULLIF(v_country, ''));
  v_severity := v_scan ->> 'severity';

  IF v_severity IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.moderation_severity := v_severity;

  IF v_severity = 'low' THEN
    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'low', 'flagged', v_scan);

    PERFORM send_notification(
      v_author,
      'moderation_warning',
      'Community guidelines reminder',
      'Something you posted was flagged by our automated filter. Please review the community guidelines.',
      '/help'
    );

    RETURN NEW;
  END IF;

  -- medium and high are both withheld from view immediately.
  NEW.status := 'quarantined';
  NEW.quarantined_at := now();

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
  VALUES ('system', v_author, v_target, NEW.id, v_severity, 'quarantined', v_scan);

  -- Enters the same queue a human report would, so moderators triage one list.
  -- reporter_id = author is what marks the row as machine-generated.
  INSERT INTO content_reports (reporter_id, target_type, target_id, target_author_id, category, detail, content_snapshot, severity, status)
  VALUES (
    v_author,
    v_target,
    NEW.id,
    v_author,
    COALESCE((v_scan -> 'matches' -> 0 ->> 'category'), 'hate_harassment'),
    'Automatically flagged by the content filter.',
    left(v_text, 2000),
    v_severity,
    'open'
  )
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;

  IF v_severity = 'high' THEN
    PERFORM set_config('ktip.bypass_profile_guard', 'on', TRUE);
    UPDATE profiles
    SET is_suspended = TRUE,
        suspension_reason = 'Automated safety escalation pending review',
        updated_at = now()
    WHERE id = v_author;
    PERFORM set_config('ktip.bypass_profile_guard', 'off', TRUE);

    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('system', v_author, v_target, NEW.id, 'high', 'suspended', v_scan);

    PERFORM escalate_to_safety(v_author, v_target, NEW.id, v_severity);
  END IF;

  RETURN NEW;
END;
$$;

-- High-severity events reach the safety team AND, when the author is a
-- school-verified student, the staff of their institution. That second hop is
-- the safeguarding requirement — a school has to know.
CREATE OR REPLACE FUNCTION escalate_to_safety(
  p_user UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_severity TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
BEGIN
  FOR v_admin IN
    SELECT p.id FROM profiles p
    WHERE has_permission(p.id, 'moderation:escalate') AND p.id <> p_user
  LOOP
    PERFORM send_notification(
      v_admin.id,
      'moderation_escalation',
      'High-severity content flagged',
      'Automated moderation quarantined a ' || p_target_type || ' and suspended the author pending review.',
      '/admin/moderation'
    );
  END LOOP;

  FOR v_admin IN
    SELECT im.user_id FROM institution_members im
    JOIN student_safeguarding ss ON ss.institution_id = im.institution_id
    WHERE ss.user_id = p_user
      AND im.status = 'approved'
      AND im.role IN ('admin', 'educator')
  LOOP
    PERFORM send_notification(
      v_admin.user_id,
      'moderation_escalation',
      'Safety escalation for one of your students',
      'A student registered to your institution triggered a high-severity safety flag. The safety team has been notified.',
      '/institutions'
    );
  END LOOP;

  INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action)
  VALUES ('system', p_user, p_target_type, p_target_id, p_severity, 'escalated');
END;
$$;

DROP TRIGGER IF EXISTS moderate_forum_posts_trigger ON forum_posts;
CREATE TRIGGER moderate_forum_posts_trigger
  BEFORE INSERT ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_forum_replies_trigger ON forum_replies;
CREATE TRIGGER moderate_forum_replies_trigger
  BEFORE INSERT ON forum_replies
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'author_id');

DROP TRIGGER IF EXISTS moderate_project_comments_trigger ON project_comments;
CREATE TRIGGER moderate_project_comments_trigger
  BEFORE INSERT ON project_comments
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'user_id');

DROP TRIGGER IF EXISTS moderate_messages_trigger ON messages;
CREATE TRIGGER moderate_messages_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION moderate_content('content', 'sender_id');

-- ============================================================
-- 6. Report-driven auto-quarantine
-- ============================================================

CREATE OR REPLACE FUNCTION set_content_status(
  p_target_type TEXT,
  p_target_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_type = 'forum_post' OR p_target_type = 'forum_posts' THEN
    UPDATE forum_posts SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'forum_reply' OR p_target_type = 'forum_replies' THEN
    UPDATE forum_replies SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'project_comment' OR p_target_type = 'project_comments' THEN
    UPDATE project_comments SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  ELSIF p_target_type = 'message' OR p_target_type = 'messages' THEN
    UPDATE messages SET status = p_status,
      quarantined_at = CASE WHEN p_status = 'quarantined' THEN now() ELSE NULL END
      WHERE id = p_target_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION apply_report_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings moderation_settings%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_settings FROM moderation_settings WHERE id = 1;

  IF NOT v_settings.auto_quarantine_enabled THEN
    RETURN NEW;
  END IF;

  -- Distinct reporters, not distinct reports: the UNIQUE constraint on
  -- (reporter, target) already makes those the same thing, but counting
  -- reporters states the intent.
  SELECT COUNT(DISTINCT cr.reporter_id) INTO v_count
  FROM content_reports cr
  WHERE cr.target_type = NEW.target_type
    AND cr.target_id = NEW.target_id
    AND cr.created_at > now() - make_interval(mins => v_settings.report_window_minutes);

  IF v_count >= v_settings.report_threshold THEN
    PERFORM set_content_status(NEW.target_type, NEW.target_id, 'quarantined');

    INSERT INTO moderation_log (actor_kind, user_id, target_type, target_id, severity, action, detail)
    VALUES ('reporter', NEW.target_author_id, NEW.target_type, NEW.target_id, NEW.severity, 'quarantined',
            jsonb_build_object('reports', v_count, 'threshold', v_settings.report_threshold));

    IF NEW.category = 'grooming_risk' AND NEW.target_author_id IS NOT NULL THEN
      PERFORM escalate_to_safety(NEW.target_author_id, NEW.target_type, NEW.target_id, 'high');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_report_threshold_trigger ON content_reports;
CREATE TRIGGER apply_report_threshold_trigger
  AFTER INSERT ON content_reports
  FOR EACH ROW
  EXECUTE FUNCTION apply_report_threshold();

-- Admin action from the moderation queue.
CREATE OR REPLACE FUNCTION moderate_report(
  p_report UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_report content_reports%ROWTYPE;
BEGIN
  IF NOT has_permission(v_actor, 'moderation:action') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF p_action NOT IN ('restore', 'quarantine', 'remove', 'dismiss') THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'bad_action');
  END IF;

  SELECT * INTO v_report FROM content_reports WHERE id = p_report;
  IF v_report.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
  END IF;

  IF p_action = 'restore' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'active');
  ELSIF p_action = 'quarantine' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'quarantined');
  ELSIF p_action = 'remove' THEN
    PERFORM set_content_status(v_report.target_type, v_report.target_id, 'removed');
  END IF;

  UPDATE content_reports
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
      admin_notes = COALESCE(p_notes, admin_notes),
      resolved_by = v_actor,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_report;

  INSERT INTO moderation_log (actor_kind, actor_id, user_id, target_type, target_id, severity, action, detail)
  VALUES ('admin', v_actor, v_report.target_author_id, v_report.target_type, v_report.target_id, v_report.severity,
          CASE p_action
            WHEN 'restore' THEN 'restored'
            WHEN 'quarantine' THEN 'quarantined'
            WHEN 'remove' THEN 'removed'
            ELSE 'flagged'
          END,
          jsonb_build_object('report_id', p_report, 'notes', p_notes));

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION moderate_report(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION moderate_report(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7. Visibility — these REPLACE the permissive policies
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view posts" ON forum_posts;
CREATE POLICY "Anyone can view posts"
  ON forum_posts FOR SELECT
  USING (
    status = 'active'
    OR author_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Anyone can view replies" ON forum_replies;
CREATE POLICY "Anyone can view replies"
  ON forum_replies FOR SELECT
  USING (
    status = 'active'
    OR author_id = auth.uid()
    OR has_permission(auth.uid(), 'moderation:view')
  );

DROP POLICY IF EXISTS "Comments on public projects are viewable" ON project_comments;
CREATE POLICY "Comments on public projects are viewable"
  ON project_comments FOR SELECT
  USING (
    (status = 'active' OR user_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_id
      AND (is_public = TRUE OR owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON messages;
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    (status = 'active' OR sender_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'))
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );

-- Counts have to agree with what the policies show, the same way 045 patched
-- get_grant_application_count to stop counting drafts.
CREATE OR REPLACE FUNCTION get_board_post_count(board_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_posts WHERE board_id = board_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_post_reply_count(post_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM forum_replies WHERE post_id = post_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_board_latest_post(board_uuid UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
  SELECT MAX(created_at) FROM forum_posts WHERE board_id = board_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_project_comment_count(project_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM project_comments WHERE project_id = project_uuid AND status = 'active';
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 8. Queue
-- ============================================================

-- security_invoker: the view must be filtered by the caller's RLS on
-- content_reports, not by the (superuser) view owner's.
CREATE OR REPLACE VIEW moderation_queue WITH (security_invoker = true) AS
SELECT
  cr.id,
  CASE WHEN cr.reporter_id = cr.target_author_id THEN 'automated' ELSE 'report' END AS source,
  cr.target_type,
  cr.target_id,
  cr.target_author_id,
  cr.category,
  cr.severity,
  cr.status,
  cr.content_snapshot,
  cr.created_at,
  (SELECT COUNT(*)::INTEGER FROM content_reports x
   WHERE x.target_type = cr.target_type AND x.target_id = cr.target_id) AS report_count
FROM content_reports cr;

-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reports" ON content_reports;
CREATE POLICY "Users can view their own reports"
  ON content_reports FOR SELECT
  USING (reporter_id = auth.uid() OR has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Authenticated users can report content" ON content_reports;
CREATE POLICY "Authenticated users can report content"
  ON content_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND status = 'open');

DROP POLICY IF EXISTS "Moderators can triage reports" ON content_reports;
CREATE POLICY "Moderators can triage reports"
  ON content_reports FOR UPDATE
  USING (has_permission(auth.uid(), 'moderation:action'));

-- The term list is a map of what the filter looks for. Restricted to
-- moderators so it cannot be read for evasion.
DROP POLICY IF EXISTS "Moderators can view terms" ON moderation_terms;
CREATE POLICY "Moderators can view terms"
  ON moderation_terms FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Moderators can manage terms" ON moderation_terms;
CREATE POLICY "Moderators can manage terms"
  ON moderation_terms FOR ALL
  USING (has_permission(auth.uid(), 'moderation:action'))
  WITH CHECK (has_permission(auth.uid(), 'moderation:action'));

DROP POLICY IF EXISTS "Moderators can view settings" ON moderation_settings;
CREATE POLICY "Moderators can view settings"
  ON moderation_settings FOR SELECT
  USING (has_permission(auth.uid(), 'moderation:view'));

DROP POLICY IF EXISTS "Moderators can change settings" ON moderation_settings;
CREATE POLICY "Moderators can change settings"
  ON moderation_settings FOR UPDATE
  USING (has_permission(auth.uid(), 'moderation:action'))
  WITH CHECK (has_permission(auth.uid(), 'moderation:action'));

DROP POLICY IF EXISTS "Auditors can view the moderation log" ON moderation_log;
CREATE POLICY "Auditors can view the moderation log"
  ON moderation_log FOR SELECT
  USING (has_permission(auth.uid(), 'audit:view') OR has_permission(auth.uid(), 'moderation:view'));

-- No write policies on moderation_log: it is written only by the SECURITY
-- DEFINER functions above.

NOTIFY pgrst, 'reload schema';
