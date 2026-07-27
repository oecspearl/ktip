  -- ============================================================
  -- COMBINED MIGRATION: 031-040
  -- Run this whole file once in the Supabase SQL Editor.
  -- Idempotent -- safe to re-run.
  -- ============================================================


  -- >>>>>>>>>> migrations/031_project_members.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 031: Project Team Members
  -- Adds project_members table (membership + invite flow in one),
  -- a SECURITY DEFINER membership helper (avoids RLS recursion),
  -- and extends projects policies so accepted members can view
  -- private projects and editors can update them.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, status);

  DROP TRIGGER IF EXISTS set_project_members_updated_at ON project_members;
  CREATE TRIGGER set_project_members_updated_at
    BEFORE UPDATE ON project_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  -- ============================================================
  -- Helper: SECURITY DEFINER membership check.
  -- Policies on projects reference project_members and policies on
  -- project_members reference project_members — going through this
  -- function (which bypasses RLS) prevents infinite policy recursion.
  -- p_min_role 'viewer' matches any accepted member; 'editor'
  -- requires the editor role.
  -- ============================================================
  CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID, p_min_role TEXT DEFAULT 'viewer')
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND user_id = p_user_id
        AND status = 'accepted'
        AND (p_min_role = 'viewer' OR role = 'editor')
    );
  $$;

  CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID, p_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM projects WHERE id = p_project_id AND owner_id = p_user_id
    );
  $$;

  -- ============================================================
  -- RLS: project_members
  -- ============================================================
  ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

  -- Owner, the member themself, or any accepted member can see the team
  DROP POLICY IF EXISTS "Team is visible to owner and members" ON project_members;
  CREATE POLICY "Team is visible to owner and members"
    ON project_members FOR SELECT
    USING (
      user_id = auth.uid()
      OR is_project_owner(project_id, auth.uid())
      OR is_project_member(project_id, auth.uid())
    );

  -- Only the project owner can invite (insert) members
  DROP POLICY IF EXISTS "Owner can invite members" ON project_members;
  CREATE POLICY "Owner can invite members"
    ON project_members FOR INSERT
    WITH CHECK (
      is_project_owner(project_id, auth.uid())
      AND user_id <> auth.uid()
      AND invited_by = auth.uid()
    );

  -- Invitee can accept/decline; owner can change roles
  DROP POLICY IF EXISTS "Invitee or owner can update membership" ON project_members;
  CREATE POLICY "Invitee or owner can update membership"
    ON project_members FOR UPDATE
    USING (
      user_id = auth.uid()
      OR is_project_owner(project_id, auth.uid())
    );

  -- Owner can remove members; members can leave
  DROP POLICY IF EXISTS "Owner can remove members and members can leave" ON project_members;
  CREATE POLICY "Owner can remove members and members can leave"
    ON project_members FOR DELETE
    USING (
      user_id = auth.uid()
      OR is_project_owner(project_id, auth.uid())
    );

  -- ============================================================
  -- Extend projects policies to the team
  -- ============================================================

  -- Accepted members can view private projects they belong to
  DROP POLICY IF EXISTS "Public projects are viewable by everyone" ON projects;
  CREATE POLICY "Public projects are viewable by everyone"
    ON projects FOR SELECT
    USING (
      is_public = TRUE
      OR owner_id = auth.uid()
      OR is_project_member(id, auth.uid())
    );

  -- Editors can update projects they belong to
  DROP POLICY IF EXISTS "Users can update own projects" ON projects;
  CREATE POLICY "Users can update own projects"
    ON projects FOR UPDATE
    USING (
      auth.uid() = owner_id
      OR is_project_member(id, auth.uid(), 'editor')
    );

  -- >>>>>>>>>> migrations/032_project_engagement.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 032: Project Engagement — Follows + View Tracking
  -- project_follows mirrors project_likes; view tracking is a
  -- counter column bumped through a SECURITY DEFINER RPC so
  -- viewers don't need UPDATE rights on projects.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS project_follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_project_follows_project ON project_follows(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_follows_user ON project_follows(user_id);

  ALTER TABLE project_follows ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Anyone can view follows" ON project_follows;
  CREATE POLICY "Anyone can view follows"
    ON project_follows FOR SELECT
    USING (TRUE);

  DROP POLICY IF EXISTS "Authenticated users can follow projects" ON project_follows;
  CREATE POLICY "Authenticated users can follow projects"
    ON project_follows FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can unfollow projects" ON project_follows;
  CREATE POLICY "Users can unfollow projects"
    ON project_follows FOR DELETE
    USING (auth.uid() = user_id);

  -- ============================================================
  -- View tracking
  -- ============================================================
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

  CREATE OR REPLACE FUNCTION increment_project_view(p_project_id UUID)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  AS $$
    UPDATE projects SET view_count = view_count + 1 WHERE id = p_project_id;
  $$;

  -- >>>>>>>>>> migrations/033_connections.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 033: Networking & Connections
  -- Mutual (request -> accept) connection model between users.
  -- An ordered-pair unique index prevents a reverse-direction
  -- duplicate (A->B blocks B->A).
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(requester_id, addressee_id),
    CHECK (requester_id <> addressee_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_pair
    ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
  CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id, status);
  CREATE INDEX IF NOT EXISTS idx_connections_addressee ON connections(addressee_id, status);

  DROP TRIGGER IF EXISTS set_connections_updated_at ON connections;
  CREATE TRIGGER set_connections_updated_at
    BEFORE UPDATE ON connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

  -- Only the two parties can see the relationship
  DROP POLICY IF EXISTS "Parties can view own connections" ON connections;
  CREATE POLICY "Parties can view own connections"
    ON connections FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

  -- Only the requester can create a request
  DROP POLICY IF EXISTS "Users can send connection requests" ON connections;
  CREATE POLICY "Users can send connection requests"
    ON connections FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

  -- Only the addressee can accept/decline
  DROP POLICY IF EXISTS "Addressee can respond to requests" ON connections;
  CREATE POLICY "Addressee can respond to requests"
    ON connections FOR UPDATE
    USING (auth.uid() = addressee_id);

  -- Either party can cancel a request / remove the connection
  DROP POLICY IF EXISTS "Parties can remove connections" ON connections;
  CREATE POLICY "Parties can remove connections"
    ON connections FOR DELETE
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

  -- >>>>>>>>>> migrations/034_group_messaging.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 034: Group Messaging + Messaging RLS hardening
  -- 1. Adds conversation name / is_group / created_by and a
  --    participant role (admin | member).
  -- 2. Fixes security holes from 004:
  --    - participants INSERT allowed ANY authenticated user to add
  --      anyone to any conversation -> now restricted to self,
  --      the conversation creator, or a group admin.
  --    - adds the missing participants DELETE policy (leave /
  --      admin-remove).
  --    - replaces the self-referencing participants SELECT policy
  --      with a SECURITY DEFINER helper (recursion guard).
  --    - find_conversation_between matched group conversations
  --      containing both users -> now restricted to 1-to-1.
  -- Idempotent — safe to re-run.
  -- ============================================================

  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

  ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'));

  -- ============================================================
  -- SECURITY DEFINER helpers (bypass RLS -> no policy recursion)
  -- ============================================================
  CREATE OR REPLACE FUNCTION is_conversation_participant(p_conversation_id UUID, p_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    );
  $$;

  CREATE OR REPLACE FUNCTION is_conversation_admin(p_conversation_id UUID, p_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = p_conversation_id AND user_id = p_user_id AND role = 'admin'
    );
  $$;

  CREATE OR REPLACE FUNCTION is_conversation_creator(p_conversation_id UUID, p_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM conversations
      WHERE id = p_conversation_id AND created_by = p_user_id
    );
  $$;

  -- ============================================================
  -- conversations policies
  -- ============================================================

  -- Include creator so the creator can operate on the conversation
  -- between creating it and inserting their own participant row.
  DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
  CREATE POLICY "Users can view own conversations"
    ON conversations FOR SELECT
    USING (
      is_conversation_participant(id, auth.uid())
      OR created_by = auth.uid()
    );

  -- Creator must stamp themselves on new conversations
  DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
  CREATE POLICY "Authenticated users can create conversations"
    ON conversations FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

  -- Rename etc.: group admins (or creator); 1-to-1 participants keep
  -- the updated_at bump path via the SECURITY DEFINER trigger from 029.
  DROP POLICY IF EXISTS "Participants can update own conversations" ON conversations;
  CREATE POLICY "Participants can update own conversations"
    ON conversations FOR UPDATE
    USING (
      is_conversation_admin(id, auth.uid())
      OR created_by = auth.uid()
      OR (is_group = FALSE AND is_conversation_participant(id, auth.uid()))
    );

  -- ============================================================
  -- conversation_participants policies
  -- ============================================================

  DROP POLICY IF EXISTS "Users can view participants of own conversations" ON conversation_participants;
  CREATE POLICY "Users can view participants of own conversations"
    ON conversation_participants FOR SELECT
    USING (is_conversation_participant(conversation_id, auth.uid()));

  -- FIX: was WITH CHECK (auth.uid() IS NOT NULL) — anyone could add
  -- anyone to any conversation. Now: add yourself, or the creator /
  -- a group admin adds others.
  DROP POLICY IF EXISTS "Authenticated users can add participants" ON conversation_participants;
  CREATE POLICY "Authenticated users can add participants"
    ON conversation_participants FOR INSERT
    WITH CHECK (
      user_id = auth.uid()
      OR is_conversation_creator(conversation_id, auth.uid())
      OR is_conversation_admin(conversation_id, auth.uid())
    );

  -- Role changes (promote/demote): admins and creator only
  DROP POLICY IF EXISTS "Admins can update participants" ON conversation_participants;
  CREATE POLICY "Admins can update participants"
    ON conversation_participants FOR UPDATE
    USING (
      is_conversation_admin(conversation_id, auth.uid())
      OR is_conversation_creator(conversation_id, auth.uid())
    );

  -- FIX: no DELETE policy existed. Members can leave; admins/creator can remove.
  DROP POLICY IF EXISTS "Members can leave and admins can remove" ON conversation_participants;
  CREATE POLICY "Members can leave and admins can remove"
    ON conversation_participants FOR DELETE
    USING (
      user_id = auth.uid()
      OR is_conversation_admin(conversation_id, auth.uid())
      OR is_conversation_creator(conversation_id, auth.uid())
    );

  -- ============================================================
  -- FIX: find_conversation_between matched any conversation that
  -- happened to contain both users (including groups). Restrict to
  -- non-group conversations with exactly two participants.
  -- ============================================================
  CREATE OR REPLACE FUNCTION find_conversation_between(user1 UUID, user2 UUID)
  RETURNS UUID AS $$
    SELECT cp1.conversation_id
    FROM conversation_participants cp1
    JOIN conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    JOIN conversations c
      ON c.id = cp1.conversation_id
    WHERE cp1.user_id = user1
      AND cp2.user_id = user2
      AND c.is_group = FALSE
      AND (
        SELECT COUNT(*) FROM conversation_participants cp3
        WHERE cp3.conversation_id = cp1.conversation_id
      ) = 2
    LIMIT 1;
  $$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

  -- >>>>>>>>>> migrations/035_verification.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 035: Identity Verification Workflow
  -- verification_requests table + the platform's first PRIVATE
  -- storage bucket (verification-documents). Admin approval flips
  -- profiles.is_verified via the existing admin update path.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS verification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    document_paths TEXT[] NOT NULL DEFAULT '{}',
    user_note TEXT,
    admin_note TEXT,
    reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status, created_at DESC);

  -- One open request per user
  CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
    ON verification_requests(user_id) WHERE status = 'pending';

  DROP TRIGGER IF EXISTS set_verification_requests_updated_at ON verification_requests;
  CREATE TRIGGER set_verification_requests_updated_at
    BEFORE UPDATE ON verification_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
  CREATE POLICY "Users can view own verification requests"
    ON verification_requests FOR SELECT
    USING (
      auth.uid() = user_id
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  DROP POLICY IF EXISTS "Users can submit verification requests" ON verification_requests;
  CREATE POLICY "Users can submit verification requests"
    ON verification_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Admins can review verification requests" ON verification_requests;
  CREATE POLICY "Admins can review verification requests"
    ON verification_requests FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  -- ============================================================
  -- PRIVATE bucket for identity documents (PDF + images).
  -- public = FALSE: reads require signed URLs / authorized download.
  -- Path convention: {userId}/{filename}
  -- ============================================================
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'verification-documents',
    'verification-documents',
    FALSE,
    10485760, -- 10MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS "Users can upload own verification documents" ON storage.objects;
  CREATE POLICY "Users can upload own verification documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'verification-documents'
      AND auth.uid() IS NOT NULL
      AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

  DROP POLICY IF EXISTS "Users and admins can view verification documents" ON storage.objects;
  CREATE POLICY "Users and admins can view verification documents"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'verification-documents'
      AND (
        (storage.foldername(name))[1] = auth.uid()::TEXT
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
      )
    );

  DROP POLICY IF EXISTS "Users can delete own verification documents" ON storage.objects;
  CREATE POLICY "Users can delete own verification documents"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'verification-documents'
      AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

  -- >>>>>>>>>> migrations/036_notification_preferences.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 036: Notification Preferences + notification hardening
  -- 1. notification_preferences table (per-user category toggles;
  --    replaces the localStorage-only 'ktip_preferences' blob).
  -- 2. Enforcement at the DB layer: a BEFORE INSERT trigger on
  --    notifications silently drops rows whose category the
  --    recipient has switched off — enforced no matter who inserts.
  -- 3. FIX security hole from 017: INSERT policy was
  --    WITH CHECK (true), letting any user spam notifications at
  --    any user. Direct inserts are now removed in favour of a
  --    send_notification() RPC (SECURITY DEFINER) with basic
  --    validation. All client call sites use the RPC.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    email BOOLEAN NOT NULL DEFAULT TRUE,
    messages BOOLEAN NOT NULL DEFAULT TRUE,
    events BOOLEAN NOT NULL DEFAULT TRUE,
    projects BOOLEAN NOT NULL DEFAULT TRUE,
    forums BOOLEAN NOT NULL DEFAULT TRUE,
    collaboration BOOLEAN NOT NULL DEFAULT TRUE,
    connections BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON notification_preferences;
  CREATE TRIGGER set_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
  CREATE POLICY "Users can view own preferences"
    ON notification_preferences FOR SELECT
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can create own preferences" ON notification_preferences;
  CREATE POLICY "Users can create own preferences"
    ON notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
  CREATE POLICY "Users can update own preferences"
    ON notification_preferences FOR UPDATE
    USING (auth.uid() = user_id);

  -- ============================================================
  -- Enforcement trigger: category is derived from notification.type.
  -- No preferences row (or unknown type) = allow. Returning NULL
  -- silently drops the insert — correct for fire-and-forget senders.
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
      WHEN NEW.type IN ('video_invite', 'whiteboard_share', 'document_share') THEN collaboration
      WHEN NEW.type IN ('project_invite', 'project_update', 'project_follow') THEN projects
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

  DROP TRIGGER IF EXISTS check_notification_prefs ON notifications;
  CREATE TRIGGER check_notification_prefs
    BEFORE INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION enforce_notification_preferences();

  -- ============================================================
  -- Replace open direct inserts with a validated RPC.
  -- ============================================================
  DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;

  CREATE OR REPLACE FUNCTION send_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_body TEXT DEFAULT NULL,
    p_link TEXT DEFAULT NULL
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_user_id = auth.uid() THEN
      RETURN; -- no self-notifications
    END IF;
    IF length(coalesce(p_title, '')) = 0 OR length(p_title) > 200 THEN
      RAISE EXCEPTION 'invalid title';
    END IF;
    IF length(coalesce(p_body, '')) > 1000 OR length(coalesce(p_link, '')) > 500 THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (p_user_id, coalesce(p_type, 'general'), p_title, p_body, p_link);
  END;
  $$;

  -- >>>>>>>>>> migrations/037_feedback.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 037: General User Feedback Channel
  -- Lightweight always-available feedback (distinct from the UAT
  -- survey and the grievance system). Modeled on grievances:
  -- user-scoped rows + OECS admin triage.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('bug', 'feature_request', 'general', 'content')),
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'dismissed')),
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

  DROP TRIGGER IF EXISTS set_feedback_updated_at ON feedback;
  CREATE TRIGGER set_feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

  -- Authenticated users submit as themselves (or anonymously with NULL)
  DROP POLICY IF EXISTS "Authenticated users can submit feedback" ON feedback;
  CREATE POLICY "Authenticated users can submit feedback"
    ON feedback FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

  -- Users see their own submissions; admins see all
  DROP POLICY IF EXISTS "Users can view own feedback" ON feedback;
  CREATE POLICY "Users can view own feedback"
    ON feedback FOR SELECT
    USING (
      auth.uid() = user_id
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  -- Admin triage (status / admin_note)
  DROP POLICY IF EXISTS "Admins can update feedback" ON feedback;
  CREATE POLICY "Admins can update feedback"
    ON feedback FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  -- >>>>>>>>>> migrations/038_integrations.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 038: Integration Directory
  -- Admin-curated public directory of external tools / services /
  -- partner platforms. Same content model as resources: published
  -- rows are public, admins have full CRUD.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'productivity' CHECK (category IN ('funding', 'productivity', 'government', 'education', 'developer', 'other')),
    logo_url TEXT,
    website_url TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_integrations_published ON integrations(is_published, category, sort_order);

  DROP TRIGGER IF EXISTS set_integrations_updated_at ON integrations;
  CREATE TRIGGER set_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

  -- Published integrations are public (anon + authenticated); admins see all
  DROP POLICY IF EXISTS "Published integrations are viewable by everyone" ON integrations;
  CREATE POLICY "Published integrations are viewable by everyone"
    ON integrations FOR SELECT
    USING (
      is_published = TRUE
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  DROP POLICY IF EXISTS "Admins can create integrations" ON integrations;
  CREATE POLICY "Admins can create integrations"
    ON integrations FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  DROP POLICY IF EXISTS "Admins can update integrations" ON integrations;
  CREATE POLICY "Admins can update integrations"
    ON integrations FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  DROP POLICY IF EXISTS "Admins can delete integrations" ON integrations;
  CREATE POLICY "Admins can delete integrations"
    ON integrations FOR DELETE
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );

  -- >>>>>>>>>> migrations/039_badges.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 039: Achievement Badges
  -- badges (definitions) + user_badges (awards). Awards happen only
  -- through SECURITY DEFINER trigger functions — there is no client
  -- INSERT path, so badges cannot be self-awarded. Award inserts a
  -- notification (type 'badge_awarded') which flows through the
  -- notification-preferences trigger from 036.
  -- Idempotent — safe to re-run.
  -- ============================================================

  CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'award',
    color TEXT NOT NULL DEFAULT 'ocean',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, badge_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, awarded_at DESC);

  ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
  ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

  -- Definitions and awards are public; no client writes on either
  -- (awards go through SECURITY DEFINER functions only).
  DROP POLICY IF EXISTS "Badges are viewable by everyone" ON badges;
  CREATE POLICY "Badges are viewable by everyone"
    ON badges FOR SELECT
    USING (TRUE);

  DROP POLICY IF EXISTS "User badges are viewable by everyone" ON user_badges;
  CREATE POLICY "User badges are viewable by everyone"
    ON user_badges FOR SELECT
    USING (TRUE);

  -- ============================================================
  -- Badge definitions
  -- ============================================================
  INSERT INTO badges (slug, name, description, icon, color) VALUES
    ('first_project',    'Innovator',       'Created your first project', 'rocket', 'ocean'),
    ('popular_project',  'Crowd Favourite', 'One of your projects reached 25 likes', 'heart', 'tropical'),
    ('first_connection', 'Networker',       'Made your first connection', 'users', 'ocean'),
    ('community_voice',  'Community Voice', 'Posted 10 times in the forums', 'message-square', 'sand'),
    ('verified_member',  'Verified Member', 'Completed identity verification', 'shield-check', 'tropical'),
    ('event_goer',       'Event Goer',      'RSVP''d to your first event', 'calendar', 'sand')
  ON CONFLICT (slug) DO NOTHING;

  -- ============================================================
  -- Award helper: idempotent; notifies on first award only.
  -- ============================================================
  CREATE OR REPLACE FUNCTION award_badge(p_user_id UUID, p_slug TEXT)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_badge badges%ROWTYPE;
    v_inserted UUID;
  BEGIN
    SELECT * INTO v_badge FROM badges WHERE slug = p_slug;
    IF v_badge.id IS NULL THEN
      RETURN;
    END IF;

    INSERT INTO user_badges (user_id, badge_id)
    VALUES (p_user_id, v_badge.id)
    ON CONFLICT (user_id, badge_id) DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, link)
      VALUES (
        p_user_id,
        'badge_awarded',
        'Achievement unlocked: ' || v_badge.name,
        v_badge.description,
        '/profile/me'
      );
    END IF;
  END;
  $$;

  -- ============================================================
  -- Awarding triggers
  -- ============================================================

  -- first_project
  CREATE OR REPLACE FUNCTION badge_on_project_insert()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    PERFORM award_badge(NEW.owner_id, 'first_project');
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS badge_on_project_insert ON projects;
  CREATE TRIGGER badge_on_project_insert
    AFTER INSERT ON projects
    FOR EACH ROW EXECUTE FUNCTION badge_on_project_insert();

  -- popular_project (25 likes -> owner)
  CREATE OR REPLACE FUNCTION badge_on_project_like()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_owner UUID;
    v_count BIGINT;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM project_likes WHERE project_id = NEW.project_id;
    IF v_count >= 25 THEN
      SELECT owner_id INTO v_owner FROM projects WHERE id = NEW.project_id;
      IF v_owner IS NOT NULL THEN
        PERFORM award_badge(v_owner, 'popular_project');
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS badge_on_project_like ON project_likes;
  CREATE TRIGGER badge_on_project_like
    AFTER INSERT ON project_likes
    FOR EACH ROW EXECUTE FUNCTION badge_on_project_like();

  -- first_connection (both parties, on acceptance)
  CREATE OR REPLACE FUNCTION badge_on_connection_accepted()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
      PERFORM award_badge(NEW.requester_id, 'first_connection');
      PERFORM award_badge(NEW.addressee_id, 'first_connection');
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS badge_on_connection_accepted ON connections;
  CREATE TRIGGER badge_on_connection_accepted
    AFTER UPDATE ON connections
    FOR EACH ROW EXECUTE FUNCTION badge_on_connection_accepted();

  -- community_voice (10 forum posts + replies combined)
  CREATE OR REPLACE FUNCTION badge_on_forum_activity()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_count BIGINT;
  BEGIN
    SELECT
      (SELECT COUNT(*) FROM forum_posts WHERE author_id = NEW.author_id)
      + (SELECT COUNT(*) FROM forum_replies WHERE author_id = NEW.author_id)
    INTO v_count;
    IF v_count >= 10 THEN
      PERFORM award_badge(NEW.author_id, 'community_voice');
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS badge_on_forum_post ON forum_posts;
  CREATE TRIGGER badge_on_forum_post
    AFTER INSERT ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION badge_on_forum_activity();
  DROP TRIGGER IF EXISTS badge_on_forum_reply ON forum_replies;
  CREATE TRIGGER badge_on_forum_reply
    AFTER INSERT ON forum_replies
    FOR EACH ROW EXECUTE FUNCTION badge_on_forum_activity();

  -- verified_member
  CREATE OR REPLACE FUNCTION badge_on_profile_verified()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NEW.is_verified = TRUE AND coalesce(OLD.is_verified, FALSE) = FALSE THEN
      PERFORM award_badge(NEW.id, 'verified_member');
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS badge_on_profile_verified ON profiles;
  CREATE TRIGGER badge_on_profile_verified
    AFTER UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION badge_on_profile_verified();

  -- event_goer
  CREATE OR REPLACE FUNCTION badge_on_event_rsvp()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    PERFORM award_badge(NEW.user_id, 'event_goer');
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS badge_on_event_rsvp ON event_rsvps;
  CREATE TRIGGER badge_on_event_rsvp
    AFTER INSERT ON event_rsvps
    FOR EACH ROW EXECUTE FUNCTION badge_on_event_rsvp();

  -- ============================================================
  -- Backfill: award already-earned badges without notifications
  -- ============================================================
  INSERT INTO user_badges (user_id, badge_id)
  SELECT DISTINCT p.owner_id, b.id
  FROM projects p, badges b
  WHERE b.slug = 'first_project'
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  INSERT INTO user_badges (user_id, badge_id)
  SELECT DISTINCT p.owner_id, b.id
  FROM projects p
  JOIN (
    SELECT project_id FROM project_likes GROUP BY project_id HAVING COUNT(*) >= 25
  ) pop ON pop.project_id = p.id,
  badges b
  WHERE b.slug = 'popular_project'
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  INSERT INTO user_badges (user_id, badge_id)
  SELECT author_id, b.id
  FROM (
    SELECT author_id FROM (
      SELECT author_id FROM forum_posts
      UNION ALL
      SELECT author_id FROM forum_replies
    ) fa GROUP BY author_id HAVING COUNT(*) >= 10
  ) authors, badges b
  WHERE b.slug = 'community_voice'
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  INSERT INTO user_badges (user_id, badge_id)
  SELECT pr.id, b.id
  FROM profiles pr, badges b
  WHERE pr.is_verified = TRUE AND b.slug = 'verified_member'
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  INSERT INTO user_badges (user_id, badge_id)
  SELECT DISTINCT r.user_id, b.id
  FROM event_rsvps r, badges b
  WHERE b.slug = 'event_goer'
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  -- >>>>>>>>>> migrations/040_security_fixes.sql <<<<<<<<<<

  -- ============================================================
  -- Migration 040: Security fixes
  -- uat_responses SELECT was open to ALL authenticated users —
  -- survey responses (free-text feedback) should be admin-only.
  -- (The messaging INSERT/DELETE holes are fixed in 034; the open
  -- notifications INSERT policy is replaced by send_notification()
  -- in 036.)
  -- Idempotent — safe to re-run.
  -- ============================================================

  DROP POLICY IF EXISTS "Authenticated users can read UAT responses" ON uat_responses;
  CREATE POLICY "Admins can read UAT responses"
    ON uat_responses FOR SELECT
    TO authenticated
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND 'oecs' = ANY(roles))
    );
