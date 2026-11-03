-- Migration 192: Submission Desk, judging and People's Choice
--
-- 062 gave a challenge its brief and 085 gave entrants somewhere to put an
-- answer. This migration closes the loop for a hackathon:
--
--   1. A team hands in one entry, with links, a pitch deck, an AI declaration
--      and evidence against each objective and deliverable in the brief. Any
--      teammate can edit it until the deadline. After that nobody can, and the
--      database is what says no.
--   2. Judges declare conflicts, then score each entry 1 to 10 on every judging
--      criterion. Organisers see every score, a weighted average per entry and
--      a per-judge normalised average that irons out harsh and generous judges.
--      Results stay hidden from participants until an organiser publishes them.
--   3. People's Choice: one vote per venue member per event, never for your
--      own team.
--
-- WHY event_solutions GROWS A team_id INSTEAD OF A NEW TABLE
-- ----------------------------------------------------------
-- 085's table already is the submission. It carries the stage gate on who may
-- read a rival's entry (085, restated in 122), the content filter and
-- moderation status (122), takedown holds (185), entity_documents hooks, the
-- KPI counts (131, 146) and the showcase gallery. A parallel team_submissions
-- table would split every one of those in two, and the showcase would show
-- half the entries. So the team's entry is an event_solutions row with
-- team_id set. team_id is nullable: a solo entry made through 085's form
-- stays valid and keeps working exactly as before. A partial unique index
-- keeps it to one entry per team. author_id stays, and means "who started it".
--
-- HOW THE DEADLINE LOCK WORKS
-- ---------------------------
-- submissions_locked(event) is TRUE once events.submission_deadline has passed
-- or the results are published. A BEFORE trigger on event_solutions refuses
-- any change to the entry's content, its submitted state or its team while
-- that is TRUE, whoever asks: the team, the organiser, an admin. Moderation
-- (the status column) is not content and still works. The same lock guards
-- evidence rows and the submission-files bucket. Only a write with no JWT
-- (service role, migrations) passes, as with the moderation guard in 183.
-- Without a deadline, entries stay open until the results are published.
--
-- HOW CONFLICTS ARE ENFORCED
-- --------------------------
-- judge_conflicts names a team (or, for a solo 085 entry, the entry). A
-- conflicted judge cannot read the entry's internals, it is left out of their
-- queue, save_judge_scores() refuses it, and a trigger on judge_scores refuses
-- it again in case anything else ever writes there. Declaring a conflict after
-- scoring deletes the scores already given.
--
-- WHO IS A JUDGE
-- --------------
-- event_venue_members.role = 'judge', or a room-scoped judge role from 109
-- (venue_room_roles) in any room of the event. Hosts (is_venue_host) may score
-- too, and conflicts bind them the same way.
--
-- WRITES ARE RPC-ONLY
-- -------------------
-- Every new table has RLS on and SELECT policies only. Scores, votes,
-- conflicts and team entries are written by SECURITY DEFINER functions that
-- check the rules in one place, so a client cannot skip a check by talking to
-- the table directly.
--
-- Needs 051, 062, 085, 109, 122, 188, 190. Idempotent: safe to re-run.

-- ============================================================
-- 1. Columns
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMPTZ;
COMMENT ON COLUMN events.results_published_at IS
  'When an organiser published judging results (192). NULL = hidden from participants';

ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES event_teams(id) ON DELETE SET NULL;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS demo_video_url TEXT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS demo_video_seconds INT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS pitch_deck_url TEXT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS pitch_deck_path TEXT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS ai_use TEXT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS ai_tools TEXT;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;
ALTER TABLE event_solutions ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES submission_receipts(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_solutions_links_check') THEN
    ALTER TABLE event_solutions ADD CONSTRAINT event_solutions_links_check CHECK (
      (repo_url IS NULL OR (repo_url ~* '^https?://' AND char_length(repo_url) <= 500))
      AND (demo_video_url IS NULL OR (demo_video_url ~* '^https?://' AND char_length(demo_video_url) <= 500))
      AND (pitch_deck_url IS NULL OR (pitch_deck_url ~* '^https?://' AND char_length(pitch_deck_url) <= 500))
    );
  END IF;
  -- The demo is three minutes at most. The team states the length; judges
  -- can see for themselves whether that was true.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_solutions_video_length_check') THEN
    ALTER TABLE event_solutions ADD CONSTRAINT event_solutions_video_length_check
      CHECK (demo_video_seconds IS NULL OR demo_video_seconds BETWEEN 1 AND 180);
  END IF;
  -- Same three values as resources.ai_use (170). NULL here means "not
  -- declared yet", which the desk lists as missing; 170 defaults to 'none'
  -- only because its rows predate the question.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_solutions_ai_use_check') THEN
    ALTER TABLE event_solutions ADD CONSTRAINT event_solutions_ai_use_check
      CHECK (ai_use IS NULL OR ai_use IN ('none', 'assisted', 'drafted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_solutions_ai_tools_check') THEN
    ALTER TABLE event_solutions ADD CONSTRAINT event_solutions_ai_tools_check
      CHECK (ai_tools IS NULL OR char_length(ai_tools) <= 1000);
  END IF;
END $$;

-- One entry per team. A team belongs to one event, so team_id alone is enough.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_solutions_team
  ON event_solutions(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_solutions_submitted
  ON event_solutions(event_id, submitted_at) WHERE submitted_at IS NOT NULL;

COMMENT ON COLUMN event_solutions.team_id IS
  'The team that owns this entry (192). NULL = a solo entry from the 085 form';
COMMENT ON COLUMN event_solutions.pitch_deck_path IS
  'Object path in the submission-files bucket, always under <solution id>/. Never a URL';
COMMENT ON COLUMN event_solutions.submitted_at IS
  'Last time the team pressed Submit. Set only by submit_team_submission()';
COMMENT ON COLUMN event_solutions.receipt_id IS
  'The submission_receipts row from the latest Submit';

-- ============================================================
-- 2. Receipts learn about entries
-- ============================================================

ALTER TABLE submission_receipts DROP CONSTRAINT IF EXISTS submission_receipts_kind_check;
ALTER TABLE submission_receipts ADD CONSTRAINT submission_receipts_kind_check
  CHECK (kind IN ('grant_application', 'event_registration', 'grievance', 'event_submission'));

-- ============================================================
-- 3. Helpers
-- ============================================================

-- Venue-wide judge, or a judge in any one room of the event (109).
CREATE OR REPLACE FUNCTION is_event_judge(p_user UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM event_venue_members
      WHERE event_id = p_event_id AND user_id = p_user AND role = 'judge'
    )
    OR EXISTS (
      SELECT 1 FROM venue_room_roles
      WHERE event_id = p_event_id AND user_id = p_user AND role = 'judge'
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Past the deadline, or results out. A missing event counts as locked.
CREATE OR REPLACE FUNCTION submissions_locked(p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT (e.submission_deadline IS NOT NULL AND now() > e.submission_deadline)
           OR e.results_published_at IS NOT NULL
    FROM events e WHERE e.id = p_event_id
  ), TRUE);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION submissions_locked(UUID) IS
  'TRUE once the submission deadline has passed or results are published. Nobody edits an entry after that';

-- People's Choice opens when entries close (085's rule: deadline, else end
-- date, else start date) and shuts when results are published.
CREATE OR REPLACE FUNCTION peoples_choice_open(p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT event_entries_closed(e.id) AND e.results_published_at IS NULL
    FROM events e WHERE e.id = p_event_id
  ), FALSE);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- A teammate, or the author of a solo entry.
CREATE OR REPLACE FUNCTION is_entry_owner(p_user UUID, p_solution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM event_solutions s
    WHERE s.id = p_solution_id
      AND (
        (s.team_id IS NOT NULL AND is_event_team_member(p_user, s.team_id))
        OR (s.team_id IS NULL AND s.author_id = p_user)
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- May change the entry right now: an owner, not suspended, entries open.
CREATE OR REPLACE FUNCTION can_edit_entry(p_user UUID, p_solution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL
    AND NOT is_suspended(p_user)
    AND is_entry_owner(p_user, p_solution_id)
    AND NOT submissions_locked((SELECT event_id FROM event_solutions WHERE id = p_solution_id));
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE TABLE IF NOT EXISTS judge_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES event_teams(id) ON DELETE CASCADE,
  -- Solo 085 entries have no team, so the conflict names the entry.
  solution_id UUID REFERENCES event_solutions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(team_id, solution_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_judge_conflicts_team
  ON judge_conflicts(judge_id, team_id) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_judge_conflicts_solution
  ON judge_conflicts(judge_id, solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_judge_conflicts_event ON judge_conflicts(event_id, judge_id);

COMMENT ON TABLE judge_conflicts IS
  'Teams (or solo entries) a judge may not score or review (192). Written by declare_judge_conflicts() only';

CREATE OR REPLACE FUNCTION is_judge_conflicted(p_user UUID, p_solution_id UUID, p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM judge_conflicts c
    WHERE c.judge_id = p_user
      AND (c.solution_id = p_solution_id OR (p_team_id IS NOT NULL AND c.team_id = p_team_id))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- May score this entry: a judge or host, not conflicted, entry submitted and
-- not held by moderation.
CREATE OR REPLACE FUNCTION may_judge_entry(p_user UUID, p_solution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM event_solutions s
    WHERE s.id = p_solution_id
      AND s.submitted_at IS NOT NULL
      AND s.status = 'active'
      AND (is_venue_host(p_user, s.event_id) OR is_event_judge(p_user, s.event_id))
      AND NOT is_judge_conflicted(p_user, s.id, s.team_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Evidence, deck files and the AI note: the team, the hosts, and judges free
-- to score it. Never spectators, never rival teams.
CREATE OR REPLACE FUNCTION can_view_entry_internals(p_user UUID, p_solution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_user IS NOT NULL AND (
    is_entry_owner(p_user, p_solution_id)
    OR is_venue_host(p_user, (SELECT event_id FROM event_solutions WHERE id = p_solution_id))
    OR may_judge_entry(p_user, p_solution_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 4. Who reads an entry (122 restated, plus team, host and judge arms)
-- ============================================================

DROP POLICY IF EXISTS "Solutions are readable per event stage" ON event_solutions;
CREATE POLICY "Solutions are readable per event stage"
  ON event_solutions FOR SELECT
  USING (
    (
      status = 'active'
      OR author_id = auth.uid()
      OR has_permission(auth.uid(), 'moderation:view')
      OR (team_id IS NOT NULL AND is_entry_owner(auth.uid(), id))
    )
    AND (
      author_id = auth.uid()
      OR is_oecs_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_solutions.event_id
          AND e.organizer_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_solutions.event_id
          AND e.end_date IS NOT NULL
          AND e.end_date < now()
      )
      -- 192: the team, the venue's hosts, and judges free to score it. One
      -- SECURITY DEFINER helper rather than is_venue_host() inline, because
      -- 070 revoked is_venue_host from PUBLIC and anon reads this table for
      -- the public showcase; a direct call would be a permission error.
      OR (auth.uid() IS NOT NULL AND can_view_entry_internals(auth.uid(), id))
    )
  );

-- ============================================================
-- 5. Evidence per objective and deliverable
-- ============================================================

CREATE TABLE IF NOT EXISTS event_solution_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID NOT NULL REFERENCES event_solutions(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES event_criteria(id) ON DELETE CASCADE,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  url TEXT CHECK (url IS NULL OR (url ~* '^https?://' AND char_length(url) <= 500)),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (solution_id, criterion_id),
  CHECK (note IS NOT NULL OR url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_event_solution_evidence_solution ON event_solution_evidence(solution_id);

ALTER TABLE event_solution_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Entry evidence is read by the team, hosts and free judges" ON event_solution_evidence;
CREATE POLICY "Entry evidence is read by the team, hosts and free judges"
  ON event_solution_evidence FOR SELECT
  USING (can_view_entry_internals(auth.uid(), solution_id));

COMMENT ON TABLE event_solution_evidence IS
  'How an entry meets one objective or deliverable of the brief (192). Written by save_submission() only';

-- ============================================================
-- 6. The lock, in triggers
-- ============================================================

CREATE OR REPLACE FUNCTION guard_event_solution_write()
RETURNS TRIGGER AS $$
DECLARE
  v_rpc BOOLEAN := current_setting('ktip.submission_rpc', TRUE) = 'on';
  v_content_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_edited_at := now();
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF submissions_locked(NEW.event_id) THEN
      RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
    END IF;
    IF NOT v_rpc THEN
      -- 085's form inserts directly. It may not claim a team or a receipt.
      IF NEW.team_id IS NOT NULL THEN
        RAISE EXCEPTION 'Team entries are saved from the Submission Desk' USING ERRCODE = '42501';
      END IF;
      NEW.submitted_at := NULL;
      NEW.receipt_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_content_changed :=
    (NEW.title, NEW.description, NEW.link_url, NEW.repo_url, NEW.demo_video_url,
     NEW.demo_video_seconds, NEW.pitch_deck_url, NEW.pitch_deck_path, NEW.ai_use, NEW.ai_tools)
    IS DISTINCT FROM
    (OLD.title, OLD.description, OLD.link_url, OLD.repo_url, OLD.demo_video_url,
     OLD.demo_video_seconds, OLD.pitch_deck_url, OLD.pitch_deck_path, OLD.ai_use, OLD.ai_tools);

  IF v_content_changed THEN
    NEW.last_edited_at := now();
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- submitted_at and receipt_id belong to submit_team_submission(). A receipt
  -- going away (its owner's account was purged) is the one exception.
  IF NOT v_rpc AND (
    NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR (NEW.receipt_id IS DISTINCT FROM OLD.receipt_id AND NEW.receipt_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'An entry is submitted from the Submission Desk' USING ERRCODE = '42501';
  END IF;

  -- A team is set by save_submission() and nothing else. Losing it is allowed:
  -- that is ON DELETE SET NULL when the last member leaves.
  IF NOT v_rpc AND NEW.team_id IS DISTINCT FROM OLD.team_id AND NEW.team_id IS NOT NULL THEN
    RAISE EXCEPTION 'An entry cannot be moved to another team' USING ERRCODE = '42501';
  END IF;

  IF (v_content_changed OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at)
     AND submissions_locked(OLD.event_id) THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_event_solution_write_trigger ON event_solutions;
CREATE TRIGGER guard_event_solution_write_trigger
  BEFORE INSERT OR UPDATE ON event_solutions
  FOR EACH ROW EXECUTE FUNCTION guard_event_solution_write();

-- 085 lets an author withdraw at any time. For a team entry that would let
-- whoever started it delete the whole team's work after the deadline, so once
-- entries are locked only removal as moderation (a host or a moderator) goes
-- through. A cascade from the author's own account being deleted also passes:
-- by then the profile row is gone.
CREATE OR REPLACE FUNCTION guard_event_solution_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.team_id IS NOT NULL
     AND submissions_locked(OLD.event_id)
     AND EXISTS (SELECT 1 FROM profiles WHERE id = OLD.author_id)
     AND NOT is_venue_host(auth.uid(), OLD.event_id)
     AND NOT has_permission(auth.uid(), 'moderation:action') THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_event_solution_delete_trigger ON event_solutions;
CREATE TRIGGER guard_event_solution_delete_trigger
  BEFORE DELETE ON event_solutions
  FOR EACH ROW EXECUTE FUNCTION guard_event_solution_delete();

-- Evidence: same lock, and it must answer an objective or deliverable of the
-- entry's own event. Deletes are not guarded here: the only paths are
-- save_submission() (which checks the lock) and cascades from the entry or
-- the brief, which must keep working after the deadline.
CREATE OR REPLACE FUNCTION guard_solution_evidence_write()
RETURNS TRIGGER AS $$
DECLARE
  v_event UUID;
BEGIN
  SELECT event_id INTO v_event FROM event_solutions WHERE id = NEW.solution_id;

  IF NOT EXISTS (
    SELECT 1 FROM event_criteria c
    WHERE c.id = NEW.criterion_id
      AND c.event_id = v_event
      AND c.kind IN ('objective', 'deliverable')
  ) THEN
    RAISE EXCEPTION 'Evidence must answer an objective or deliverable of this event';
  END IF;

  IF auth.uid() IS NOT NULL AND submissions_locked(v_event) THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_solution_evidence_write_trigger ON event_solution_evidence;
CREATE TRIGGER guard_solution_evidence_write_trigger
  BEFORE INSERT OR UPDATE ON event_solution_evidence
  FOR EACH ROW EXECUTE FUNCTION guard_solution_evidence_write();

-- ============================================================
-- 7. What is still missing before Submit
-- ============================================================
--
-- Mirrored in src/lib/submission-checklist.ts, which draws the "still missing"
-- list. This copy is the one that decides.
--   title, summary, repo, video, video_length, deck, ai,
--   evidence:<criterion id> for each required objective or deliverable.

CREATE OR REPLACE FUNCTION submission_missing(p_solution_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  s event_solutions;
  v_out TEXT[] := '{}';
  v_crit UUID;
BEGIN
  SELECT * INTO s FROM event_solutions WHERE id = p_solution_id;
  IF s.id IS NULL THEN
    RETURN ARRAY['title'];
  END IF;

  IF coalesce(btrim(s.title), '') = '' THEN v_out := v_out || 'title'; END IF;
  IF coalesce(btrim(s.description), '') = '' THEN v_out := v_out || 'summary'; END IF;
  IF s.repo_url IS NULL THEN v_out := v_out || 'repo'; END IF;
  IF s.demo_video_url IS NULL THEN
    v_out := v_out || 'video';
  ELSIF s.demo_video_seconds IS NULL THEN
    v_out := v_out || 'video_length';
  END IF;
  IF s.pitch_deck_url IS NULL AND s.pitch_deck_path IS NULL THEN v_out := v_out || 'deck'; END IF;
  IF s.ai_use IS NULL THEN v_out := v_out || 'ai'; END IF;

  FOR v_crit IN
    SELECT c.id FROM event_criteria c
    WHERE c.event_id = s.event_id
      AND c.kind IN ('objective', 'deliverable')
      AND c.is_required
      AND NOT EXISTS (
        SELECT 1 FROM event_solution_evidence ev
        WHERE ev.solution_id = s.id AND ev.criterion_id = c.id
      )
    ORDER BY c.kind, c.sort_order
  LOOP
    v_out := v_out || ('evidence:' || v_crit::text);
  END LOOP;

  RETURN v_out;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 8. Saving and submitting a team entry
-- ============================================================

-- p_fields: any of title, description, repo_url, demo_video_url,
-- demo_video_seconds, pitch_deck_url, pitch_deck_path, ai_use, ai_tools.
-- A key that is absent is left alone; a key set to null or '' clears it.
-- p_evidence: [{criterion_id, note, url}]. Both note and url empty deletes it.
CREATE OR REPLACE FUNCTION save_submission(
  p_event_id UUID,
  p_fields JSONB,
  p_evidence JSONB DEFAULT NULL
)
RETURNS event_solutions AS $$
DECLARE
  v_user UUID := auth.uid();
  v_team event_teams;
  v_sol event_solutions;
  v_event events;
  v_item JSONB;
  v_crit UUID;
  v_note TEXT;
  v_url TEXT;
  v_path TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'fields must be an object';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.id IS NULL OR v_event.status = 'draft' THEN
    RAISE EXCEPTION 'this event is not taking entries';
  END IF;

  SELECT t.* INTO v_team
  FROM event_teams t
  JOIN event_team_members m ON m.team_id = t.id
  WHERE t.event_id = p_event_id AND m.user_id = v_user;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'join or form a team before you submit';
  END IF;

  IF submissions_locked(p_event_id) THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('ktip.submission_rpc', 'on', TRUE);

  INSERT INTO event_solutions (event_id, author_id, team_id, title)
  VALUES (
    p_event_id,
    v_user,
    v_team.id,
    coalesce(nullif(btrim(p_fields->>'title'), ''), v_team.name)
  )
  ON CONFLICT (team_id) WHERE team_id IS NOT NULL DO NOTHING;

  SELECT * INTO v_sol FROM event_solutions WHERE team_id = v_team.id;

  IF p_fields ? 'pitch_deck_path' THEN
    v_path := nullif(btrim(coalesce(p_fields->>'pitch_deck_path', '')), '');
    IF v_path IS NOT NULL AND v_path !~ ('^' || v_sol.id::text || '/[A-Za-z0-9._-]{1,160}$') THEN
      RAISE EXCEPTION 'the pitch deck must be a file uploaded to this entry';
    END IF;
  END IF;

  IF p_fields ? 'demo_video_seconds'
     AND jsonb_typeof(p_fields->'demo_video_seconds') NOT IN ('number', 'null') THEN
    RAISE EXCEPTION 'video length must be a number of seconds';
  END IF;

  UPDATE event_solutions SET
    title = CASE WHEN p_fields ? 'title'
      THEN coalesce(nullif(btrim(p_fields->>'title'), ''), title) ELSE title END,
    description = CASE WHEN p_fields ? 'description'
      THEN nullif(btrim(coalesce(p_fields->>'description', '')), '') ELSE description END,
    repo_url = CASE WHEN p_fields ? 'repo_url'
      THEN nullif(btrim(coalesce(p_fields->>'repo_url', '')), '') ELSE repo_url END,
    demo_video_url = CASE WHEN p_fields ? 'demo_video_url'
      THEN nullif(btrim(coalesce(p_fields->>'demo_video_url', '')), '') ELSE demo_video_url END,
    demo_video_seconds = CASE WHEN p_fields ? 'demo_video_seconds'
      THEN (p_fields->>'demo_video_seconds')::NUMERIC::INT ELSE demo_video_seconds END,
    pitch_deck_url = CASE WHEN p_fields ? 'pitch_deck_url'
      THEN nullif(btrim(coalesce(p_fields->>'pitch_deck_url', '')), '') ELSE pitch_deck_url END,
    pitch_deck_path = CASE WHEN p_fields ? 'pitch_deck_path' THEN v_path ELSE pitch_deck_path END,
    ai_use = CASE WHEN p_fields ? 'ai_use'
      THEN nullif(btrim(coalesce(p_fields->>'ai_use', '')), '') ELSE ai_use END,
    ai_tools = CASE WHEN p_fields ? 'ai_tools'
      THEN nullif(btrim(coalesce(p_fields->>'ai_tools', '')), '') ELSE ai_tools END
  WHERE id = v_sol.id;

  IF p_evidence IS NOT NULL THEN
    IF jsonb_typeof(p_evidence) <> 'array' THEN
      RAISE EXCEPTION 'evidence must be an array';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_evidence)
    LOOP
      v_crit := safe_uuid(v_item->>'criterion_id');
      IF v_crit IS NULL THEN
        RAISE EXCEPTION 'every evidence item needs a criterion';
      END IF;
      v_note := nullif(btrim(coalesce(v_item->>'note', '')), '');
      v_url := nullif(btrim(coalesce(v_item->>'url', '')), '');
      IF v_note IS NULL AND v_url IS NULL THEN
        DELETE FROM event_solution_evidence WHERE solution_id = v_sol.id AND criterion_id = v_crit;
      ELSE
        INSERT INTO event_solution_evidence (solution_id, criterion_id, note, url, updated_by)
        VALUES (v_sol.id, v_crit, v_note, v_url, v_user)
        ON CONFLICT (solution_id, criterion_id) DO UPDATE SET
          note = EXCLUDED.note,
          url = EXCLUDED.url,
          updated_by = EXCLUDED.updated_by;
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('ktip.submission_rpc', 'off', TRUE);

  SELECT * INTO v_sol FROM event_solutions WHERE id = v_sol.id;
  RETURN v_sol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Freezes what the team handed in as a receipt (051's table), tells every
-- teammate, and marks the entry submitted. Pressing it again after an edit
-- issues a fresh receipt; the old ones stay as history.
CREATE OR REPLACE FUNCTION submit_team_submission(p_solution_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_sol event_solutions;
  v_event events;
  v_team event_teams;
  v_missing TEXT[];
  v_receipt UUID;
  v_now TIMESTAMPTZ := now();
  v_snapshot JSONB;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_sol FROM event_solutions WHERE id = p_solution_id;
  IF v_sol.id IS NULL OR v_sol.team_id IS NULL OR NOT is_event_team_member(v_user, v_sol.team_id) THEN
    RAISE EXCEPTION 'only the team can submit this entry';
  END IF;
  IF submissions_locked(v_sol.event_id) THEN
    RAISE EXCEPTION 'Entries for this event are closed' USING ERRCODE = '42501';
  END IF;

  v_missing := submission_missing(p_solution_id);
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'missing', to_jsonb(v_missing));
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_sol.event_id;
  SELECT * INTO v_team FROM event_teams WHERE id = v_sol.team_id;

  v_snapshot := jsonb_build_object(
    'team_id', v_team.id::text,
    'team', v_team.name,
    'members', (
      SELECT coalesce(jsonb_agg(coalesce(p.display_name, p.username) ORDER BY m.joined_at), '[]'::jsonb)
      FROM event_team_members m JOIN profiles p ON p.id = m.user_id
      WHERE m.team_id = v_team.id
    ),
    'summary', v_sol.description,
    'repo_url', v_sol.repo_url,
    'video_url', v_sol.demo_video_url,
    'video_length', (v_sol.demo_video_seconds / 60)::text || ':' || lpad((v_sol.demo_video_seconds % 60)::text, 2, '0'),
    'pitch_deck', coalesce(v_sol.pitch_deck_url, regexp_replace(v_sol.pitch_deck_path, '^[^/]+/', '')),
    'ai_use', v_sol.ai_use,
    'ai_tools', v_sol.ai_tools,
    'evidence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'criterion', c.title, 'kind', c.kind, 'note', ev.note, 'url', ev.url
      ) ORDER BY c.kind, c.sort_order), '[]'::jsonb)
      FROM event_solution_evidence ev
      JOIN event_criteria c ON c.id = ev.criterion_id
      WHERE ev.solution_id = v_sol.id
    )
  );

  -- One receipt per press of Submit. source_id is fresh each time, so 051's
  -- UNIQUE (source_table, source_id) never collides with an earlier copy.
  INSERT INTO submission_receipts (
    user_id, kind, source_table, source_id, title, subtitle,
    data, template_key, link, submitted_at
  )
  VALUES (
    v_user,
    'event_submission',
    'event_solution_submits',
    gen_random_uuid(),
    v_sol.title,
    v_event.title,
    v_snapshot,
    'event_submission_v1',
    '/events/' || v_event.id::text,
    v_now
  )
  RETURNING id INTO v_receipt;

  PERFORM set_config('ktip.submission_rpc', 'on', TRUE);
  UPDATE event_solutions
  SET submitted_at = v_now, receipt_id = v_receipt
  WHERE id = v_sol.id;
  PERFORM set_config('ktip.submission_rpc', 'off', TRUE);

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT
    m.user_id,
    'submission_receipt',
    'Entry submitted',
    v_team.name || ' handed in "' || v_sol.title || '" for ' || coalesce(v_event.title, 'the event') ||
      '. A copy is saved in your dashboard.',
    '/dashboard/submissions/' || v_receipt::text
  FROM event_team_members m
  WHERE m.team_id = v_team.id;

  RETURN jsonb_build_object('ok', TRUE, 'receipt_id', v_receipt, 'submitted_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Teammates read the receipts of their team's entry, whoever pressed Submit.
DROP POLICY IF EXISTS "Team members can view their entry receipts" ON submission_receipts;
CREATE POLICY "Team members can view their entry receipts"
  ON submission_receipts FOR SELECT
  USING (
    kind = 'event_submission'
    AND is_event_team_member(auth.uid(), safe_uuid(data->>'team_id'))
  );

-- Everything the Submission Desk draws, in one round trip.
CREATE OR REPLACE FUNCTION my_team_submission(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event events;
  v_team event_teams;
  v_sol event_solutions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;

  SELECT t.* INTO v_team
  FROM event_teams t
  JOIN event_team_members m ON m.team_id = t.id
  WHERE t.event_id = p_event_id AND m.user_id = v_user;

  IF v_team.id IS NOT NULL THEN
    SELECT * INTO v_sol FROM event_solutions WHERE team_id = v_team.id;
  END IF;

  RETURN jsonb_build_object(
    'deadline', v_event.submission_deadline,
    'locked', submissions_locked(p_event_id),
    'results_published_at', v_event.results_published_at,
    'criteria', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'title', c.title,
        'description', c.description, 'is_required', c.is_required
      ) ORDER BY c.kind, c.sort_order), '[]'::jsonb)
      FROM event_criteria c
      WHERE c.event_id = p_event_id AND c.kind IN ('objective', 'deliverable')
    ),
    'team', CASE WHEN v_team.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_team.id,
      'name', v_team.name,
      'members', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'user_id', m.user_id, 'role', m.role,
          'display_name', coalesce(p.display_name, p.username)
        ) ORDER BY m.joined_at), '[]'::jsonb)
        FROM event_team_members m JOIN profiles p ON p.id = m.user_id
        WHERE m.team_id = v_team.id
      )
    ) END,
    'solution', CASE WHEN v_sol.id IS NULL THEN NULL ELSE to_jsonb(v_sol) END,
    'evidence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'criterion_id', ev.criterion_id, 'note', ev.note, 'url', ev.url
      )), '[]'::jsonb)
      FROM event_solution_evidence ev
      WHERE v_sol.id IS NOT NULL AND ev.solution_id = v_sol.id
    ),
    'missing', CASE WHEN v_sol.id IS NULL THEN NULL ELSE to_jsonb(submission_missing(v_sol.id)) END,
    'receipt', (
      SELECT to_jsonb(r) FROM submission_receipts r
      WHERE v_sol.receipt_id IS NOT NULL AND r.id = v_sol.receipt_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 9. Pitch deck files
-- ============================================================

-- Private. One folder per entry: <solution id>/<file>. The team writes while
-- entries are open; the team, the hosts and free judges read. A deck pasted
-- outside that circle is a signed link that dies in minutes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submission-files',
  'submission-files',
  FALSE,
  26214400, -- 25MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Entry files are read by the team, hosts and free judges" ON storage.objects;
CREATE POLICY "Entry files are read by the team, hosts and free judges"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'submission-files'
    AND can_view_entry_internals(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Teams upload entry files while entries are open" ON storage.objects;
CREATE POLICY "Teams upload entry files while entries are open"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'submission-files'
    AND can_edit_entry(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Teams replace entry files while entries are open" ON storage.objects;
CREATE POLICY "Teams replace entry files while entries are open"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'submission-files'
    AND can_edit_entry(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Teams remove entry files while entries are open" ON storage.objects;
CREATE POLICY "Teams remove entry files while entries are open"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'submission-files'
    AND can_edit_entry(auth.uid(), safe_uuid((storage.foldername(name))[1]))
  );

-- ============================================================
-- 10. Conflicts of interest
-- ============================================================

ALTER TABLE judge_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Judges see their conflicts, hosts see all" ON judge_conflicts;
CREATE POLICY "Judges see their conflicts, hosts see all"
  ON judge_conflicts FOR SELECT
  USING (judge_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

-- "I have been through the team list" is a fact worth keeping even when the
-- answer is "no conflicts". The console holds the queue back until it exists.
CREATE TABLE IF NOT EXISTS judge_declarations (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, judge_id)
);

ALTER TABLE judge_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Judges see their declaration, hosts see all" ON judge_declarations;
CREATE POLICY "Judges see their declaration, hosts see all"
  ON judge_declarations FOR SELECT
  USING (judge_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

-- Replaces the caller's whole set for the event. Scores already given to a
-- newly conflicted entry are deleted, not hidden.
CREATE OR REPLACE FUNCTION declare_judge_conflicts(
  p_event_id UUID,
  p_team_ids UUID[],
  p_solution_ids UUID[] DEFAULT '{}'
)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (is_event_judge(v_user, p_event_id) OR is_venue_host(v_user, p_event_id)) THEN
    RAISE EXCEPTION 'only judges and organisers declare conflicts';
  END IF;
  IF EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND results_published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'results are published; conflicts can no longer change';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(p_team_ids, '{}')) x(id)
    WHERE NOT EXISTS (SELECT 1 FROM event_teams t WHERE t.id = x.id AND t.event_id = p_event_id)
  ) OR EXISTS (
    SELECT 1 FROM unnest(coalesce(p_solution_ids, '{}')) x(id)
    WHERE NOT EXISTS (SELECT 1 FROM event_solutions s WHERE s.id = x.id AND s.event_id = p_event_id)
  ) THEN
    RAISE EXCEPTION 'a conflict must name a team or entry in this event';
  END IF;

  DELETE FROM judge_conflicts
  WHERE event_id = p_event_id AND judge_id = v_user
    AND NOT (coalesce(team_id = ANY(p_team_ids), FALSE)
             OR coalesce(solution_id = ANY(p_solution_ids), FALSE));

  INSERT INTO judge_conflicts (event_id, judge_id, team_id)
  SELECT p_event_id, v_user, x.id FROM unnest(coalesce(p_team_ids, '{}')) x(id)
  ON CONFLICT (judge_id, team_id) WHERE team_id IS NOT NULL DO NOTHING;

  INSERT INTO judge_conflicts (event_id, judge_id, solution_id)
  SELECT p_event_id, v_user, x.id FROM unnest(coalesce(p_solution_ids, '{}')) x(id)
  ON CONFLICT (judge_id, solution_id) WHERE solution_id IS NOT NULL DO NOTHING;

  DELETE FROM judge_scores js
  USING event_solutions s
  WHERE js.solution_id = s.id
    AND js.judge_id = v_user
    AND s.event_id = p_event_id
    AND is_judge_conflicted(v_user, s.id, s.team_id);

  DELETE FROM judge_comments jc
  USING event_solutions s
  WHERE jc.solution_id = s.id
    AND jc.judge_id = v_user
    AND s.event_id = p_event_id
    AND is_judge_conflicted(v_user, s.id, s.team_id);

  INSERT INTO judge_declarations (event_id, judge_id)
  VALUES (p_event_id, v_user)
  ON CONFLICT (event_id, judge_id) DO UPDATE SET declared_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 11. Scores
-- ============================================================

CREATE TABLE IF NOT EXISTS judge_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised so results and policies need no join through the entry.
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  solution_id UUID NOT NULL REFERENCES event_solutions(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES event_criteria(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (judge_id, solution_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_judge_scores_event ON judge_scores(event_id, solution_id);

-- One comment per judge per entry, not per criterion.
CREATE TABLE IF NOT EXISTS judge_comments (
  judge_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solution_id UUID NOT NULL REFERENCES event_solutions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (judge_id, solution_id)
);

ALTER TABLE judge_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Judges see their own scores, hosts see all" ON judge_scores;
CREATE POLICY "Judges see their own scores, hosts see all"
  ON judge_scores FOR SELECT
  USING (judge_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

DROP POLICY IF EXISTS "Judges see their own comments, hosts see all" ON judge_comments;
CREATE POLICY "Judges see their own comments, hosts see all"
  ON judge_comments FOR SELECT
  USING (judge_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

-- Second line of defence behind save_judge_scores(): whatever writes a score,
-- it must be for a judging criterion of the entry's event, by someone free to
-- judge that entry.
CREATE OR REPLACE FUNCTION guard_judge_score()
RETURNS TRIGGER AS $$
DECLARE
  v_sol event_solutions;
BEGIN
  SELECT * INTO v_sol FROM event_solutions WHERE id = NEW.solution_id;
  IF v_sol.id IS NULL OR v_sol.event_id <> NEW.event_id THEN
    RAISE EXCEPTION 'score does not match the entry''s event';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM event_criteria c
    WHERE c.id = NEW.criterion_id AND c.event_id = NEW.event_id AND c.kind = 'judging_criterion'
  ) THEN
    RAISE EXCEPTION 'scores are given against judging criteria only';
  END IF;
  IF is_judge_conflicted(NEW.judge_id, v_sol.id, v_sol.team_id) THEN
    RAISE EXCEPTION 'this judge declared a conflict with this entry' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_judge_score_trigger ON judge_scores;
CREATE TRIGGER guard_judge_score_trigger
  BEFORE INSERT OR UPDATE ON judge_scores
  FOR EACH ROW EXECUTE FUNCTION guard_judge_score();

-- p_scores: {"<criterion id>": 1..10 | null}. null removes that score.
-- p_comment: NULL leaves the comment alone, '' removes it.
CREATE OR REPLACE FUNCTION save_judge_scores(
  p_solution_id UUID,
  p_scores JSONB,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_sol event_solutions;
  r RECORD;
  v_crit UUID;
  v_score NUMERIC;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT * INTO v_sol FROM event_solutions WHERE id = p_solution_id;
  IF v_sol.id IS NULL THEN
    RAISE EXCEPTION 'entry not found';
  END IF;
  IF NOT (is_event_judge(v_user, v_sol.event_id) OR is_venue_host(v_user, v_sol.event_id)) THEN
    RAISE EXCEPTION 'only judges and organisers can score' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM events WHERE id = v_sol.event_id AND results_published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'results are published; scores are final';
  END IF;
  IF NOT may_judge_entry(v_user, p_solution_id) THEN
    RAISE EXCEPTION 'you cannot score this entry' USING ERRCODE = '42501';
  END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'object' THEN
    RAISE EXCEPTION 'scores must be an object';
  END IF;

  FOR r IN SELECT key, value FROM jsonb_each(p_scores)
  LOOP
    v_crit := safe_uuid(r.key);
    IF v_crit IS NULL THEN
      RAISE EXCEPTION 'unknown criterion %', r.key;
    END IF;
    IF jsonb_typeof(r.value) = 'null' THEN
      DELETE FROM judge_scores
      WHERE judge_id = v_user AND solution_id = p_solution_id AND criterion_id = v_crit;
      CONTINUE;
    END IF;
    IF jsonb_typeof(r.value) <> 'number' THEN
      RAISE EXCEPTION 'a score must be a whole number from 1 to 10';
    END IF;
    v_score := (r.value #>> '{}')::NUMERIC;
    IF v_score <> trunc(v_score) OR v_score < 1 OR v_score > 10 THEN
      RAISE EXCEPTION 'a score must be a whole number from 1 to 10';
    END IF;

    INSERT INTO judge_scores (event_id, solution_id, criterion_id, judge_id, score)
    VALUES (v_sol.event_id, p_solution_id, v_crit, v_user, v_score::SMALLINT)
    ON CONFLICT (judge_id, solution_id, criterion_id)
    DO UPDATE SET score = EXCLUDED.score;
  END LOOP;

  IF p_comment IS NOT NULL THEN
    IF btrim(p_comment) = '' THEN
      DELETE FROM judge_comments WHERE judge_id = v_user AND solution_id = p_solution_id;
    ELSE
      INSERT INTO judge_comments (judge_id, solution_id, event_id, comment)
      VALUES (v_user, p_solution_id, v_sol.event_id, left(btrim(p_comment), 2000))
      ON CONFLICT (judge_id, solution_id)
      DO UPDATE SET comment = EXCLUDED.comment, updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The judge's console: the brief's judging criteria, the teams to declare
-- conflicts against, and the queue with this judge's own scores.
CREATE OR REPLACE FUNCTION judging_console(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_host BOOLEAN;
  v_judge BOOLEAN;
  v_event events;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_host := is_venue_host(v_user, p_event_id);
  v_judge := is_event_judge(v_user, p_event_id);
  IF NOT (v_host OR v_judge) THEN
    RETURN jsonb_build_object('allowed', FALSE);
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'is_host', v_host,
    'deadline', v_event.submission_deadline,
    'locked', submissions_locked(p_event_id),
    'results_published_at', v_event.results_published_at,
    'declared_at', (
      SELECT declared_at FROM judge_declarations WHERE event_id = p_event_id AND judge_id = v_user
    ),
    'criteria', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description, 'weight', c.weight
      ) ORDER BY c.sort_order), '[]'::jsonb)
      FROM event_criteria c
      WHERE c.event_id = p_event_id AND c.kind = 'judging_criterion'
    ),
    'teams', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'members', (
          SELECT coalesce(jsonb_agg(coalesce(p.display_name, p.username) ORDER BY m.joined_at), '[]'::jsonb)
          FROM event_team_members m JOIN profiles p ON p.id = m.user_id
          WHERE m.team_id = t.id
        )
      ) ORDER BY t.name), '[]'::jsonb)
      FROM event_teams t WHERE t.event_id = p_event_id
    ),
    'solo_entries', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'author', coalesce(p.display_name, p.username)
      ) ORDER BY s.title), '[]'::jsonb)
      FROM event_solutions s JOIN profiles p ON p.id = s.author_id
      WHERE s.event_id = p_event_id AND s.team_id IS NULL AND s.status = 'active'
    ),
    'conflicts', jsonb_build_object(
      'team_ids', (
        SELECT coalesce(jsonb_agg(team_id), '[]'::jsonb) FROM judge_conflicts
        WHERE event_id = p_event_id AND judge_id = v_user AND team_id IS NOT NULL
      ),
      'solution_ids', (
        SELECT coalesce(jsonb_agg(solution_id), '[]'::jsonb) FROM judge_conflicts
        WHERE event_id = p_event_id AND judge_id = v_user AND solution_id IS NOT NULL
      )
    ),
    'entries', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'summary', s.description,
        'team_id', s.team_id,
        'team_name', t.name,
        'repo_url', s.repo_url,
        'link_url', s.link_url,
        'demo_video_url', s.demo_video_url,
        'demo_video_seconds', s.demo_video_seconds,
        'pitch_deck_url', s.pitch_deck_url,
        'pitch_deck_path', s.pitch_deck_path,
        'ai_use', s.ai_use,
        'ai_tools', s.ai_tools,
        'submitted_at', s.submitted_at,
        'evidence', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'criterion_id', c.id, 'title', c.title, 'kind', c.kind, 'note', ev.note, 'url', ev.url
          ) ORDER BY c.kind, c.sort_order), '[]'::jsonb)
          FROM event_solution_evidence ev JOIN event_criteria c ON c.id = ev.criterion_id
          WHERE ev.solution_id = s.id
        ),
        'my_scores', (
          SELECT coalesce(jsonb_object_agg(js.criterion_id::text, js.score), '{}'::jsonb)
          FROM judge_scores js WHERE js.solution_id = s.id AND js.judge_id = v_user
        ),
        'my_comment', (
          SELECT jc.comment FROM judge_comments jc WHERE jc.solution_id = s.id AND jc.judge_id = v_user
        )
      ) ORDER BY s.submitted_at), '[]'::jsonb)
      FROM event_solutions s
      LEFT JOIN event_teams t ON t.id = s.team_id
      WHERE s.event_id = p_event_id
        AND s.submitted_at IS NOT NULL
        AND s.status = 'active'
        AND NOT is_judge_conflicted(v_user, s.id, s.team_id)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 12. People's Choice
-- ============================================================

CREATE TABLE IF NOT EXISTS peoples_choice_votes (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solution_id UUID NOT NULL REFERENCES event_solutions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One vote per person per event. Changing it is an update, not a second row.
  PRIMARY KEY (event_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_peoples_choice_votes_solution ON peoples_choice_votes(solution_id);

ALTER TABLE peoples_choice_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voters see their own vote, hosts see all" ON peoples_choice_votes;
CREATE POLICY "Voters see their own vote, hosts see all"
  ON peoples_choice_votes FOR SELECT
  USING (voter_id = auth.uid() OR is_venue_host(auth.uid(), event_id));

-- Never for your own team, and only for a submitted entry of the same event.
CREATE OR REPLACE FUNCTION guard_peoples_choice_vote()
RETURNS TRIGGER AS $$
DECLARE
  v_sol event_solutions;
BEGIN
  SELECT * INTO v_sol FROM event_solutions WHERE id = NEW.solution_id;
  IF v_sol.id IS NULL OR v_sol.event_id <> NEW.event_id OR v_sol.submitted_at IS NULL THEN
    RAISE EXCEPTION 'that entry is not on the ballot';
  END IF;
  IF is_entry_owner(NEW.voter_id, v_sol.id) THEN
    RAISE EXCEPTION 'you cannot vote for your own team' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_peoples_choice_vote_trigger ON peoples_choice_votes;
CREATE TRIGGER guard_peoples_choice_vote_trigger
  BEFORE INSERT OR UPDATE ON peoples_choice_votes
  FOR EACH ROW EXECUTE FUNCTION guard_peoples_choice_vote();

CREATE OR REPLACE FUNCTION cast_peoples_choice_vote(p_solution_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID := auth.uid();
  v_event UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF is_suspended(v_user) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT event_id INTO v_event FROM event_solutions
  WHERE id = p_solution_id AND submitted_at IS NOT NULL AND status = 'active';
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'that entry is not on the ballot';
  END IF;
  IF NOT is_venue_member(v_user, v_event) THEN
    RAISE EXCEPTION 'join the venue to vote';
  END IF;
  IF NOT peoples_choice_open(v_event) THEN
    RAISE EXCEPTION 'voting is not open';
  END IF;

  INSERT INTO peoples_choice_votes (event_id, voter_id, solution_id)
  VALUES (v_event, v_user, p_solution_id)
  ON CONFLICT (event_id, voter_id) DO UPDATE SET solution_id = EXCLUDED.solution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The ballot, the caller's vote, and the tally when they may see it: hosts
-- always, everyone in the venue once results are published.
CREATE OR REPLACE FUNCTION peoples_choice_ballot(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_host BOOLEAN;
  v_event events;
  v_show_entries BOOLEAN;
  v_show_tally BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_host := is_venue_host(v_user, p_event_id);
  IF NOT (v_host OR is_venue_member(v_user, p_event_id)) THEN
    RETURN jsonb_build_object('allowed', FALSE);
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  v_show_entries := v_host OR event_entries_closed(p_event_id) OR v_event.results_published_at IS NOT NULL;
  v_show_tally := v_host OR v_event.results_published_at IS NOT NULL;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'is_host', v_host,
    'open', peoples_choice_open(p_event_id),
    'results_published_at', v_event.results_published_at,
    'my_vote', (
      SELECT solution_id FROM peoples_choice_votes WHERE event_id = p_event_id AND voter_id = v_user
    ),
    'entries', CASE WHEN NOT v_show_entries THEN '[]'::jsonb ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'summary', s.description,
        'team_name', t.name,
        'demo_video_url', s.demo_video_url,
        'repo_url', s.repo_url,
        'is_mine', is_entry_owner(v_user, s.id),
        'votes', CASE WHEN v_show_tally THEN (
          SELECT count(*) FROM peoples_choice_votes v WHERE v.solution_id = s.id
        ) ELSE NULL END
      ) ORDER BY s.title), '[]'::jsonb)
      FROM event_solutions s
      LEFT JOIN event_teams t ON t.id = s.team_id
      WHERE s.event_id = p_event_id AND s.submitted_at IS NOT NULL AND s.status = 'active'
    ) END,
    'total_votes', CASE WHEN v_show_tally THEN (
      SELECT count(*) FROM peoples_choice_votes WHERE event_id = p_event_id
    ) ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 13. Results
-- ============================================================
--
-- The arithmetic is mirrored in src/lib/judging-math.ts (with tests):
--   weight      = event_criteria.weight, NULL counts as 1; if every weight is
--                 0, all count as 1.
--   judge total = sum(weight * score) / sum(weight), only when the judge has
--                 scored every judging criterion for that entry.
--   weighted    = mean of judge totals for the entry.
--   z           = (judge total - that judge's mean total) / that judge's
--                 population standard deviation; 0 when it is 0.
--   normalised  = mean of z for the entry. Rank is by normalised, then weighted.

CREATE OR REPLACE FUNCTION judging_ranking(p_event_id UUID)
RETURNS TABLE (
  solution_id UUID,
  title TEXT,
  team_name TEXT,
  judges INT,
  weighted NUMERIC,
  normalised NUMERIC,
  place INT
) AS $$
  WITH crit AS (
    SELECT c.id, coalesce(c.weight, 1)::NUMERIC AS w
    FROM event_criteria c
    WHERE c.event_id = p_event_id AND c.kind = 'judging_criterion'
  ),
  critn AS (
    SELECT id, CASE WHEN (SELECT sum(w) FROM crit) > 0 THEN w ELSE 1 END AS w FROM crit
  ),
  entries AS (
    SELECT s.id, s.title, t.name AS team_name
    FROM event_solutions s
    LEFT JOIN event_teams t ON t.id = s.team_id
    WHERE s.event_id = p_event_id AND s.submitted_at IS NOT NULL AND s.status = 'active'
  ),
  per_judge AS (
    SELECT js.judge_id, js.solution_id, sum(cn.w * js.score) / nullif(sum(cn.w), 0) AS total
    FROM judge_scores js
    JOIN critn cn ON cn.id = js.criterion_id
    WHERE js.event_id = p_event_id AND js.solution_id IN (SELECT id FROM entries)
    GROUP BY js.judge_id, js.solution_id
    HAVING count(*) = (SELECT count(*) FROM critn)
  ),
  judge_stats AS (
    SELECT judge_id, avg(total) AS mu, stddev_pop(total) AS sd
    FROM per_judge GROUP BY judge_id
  ),
  z AS (
    SELECT pj.solution_id, pj.total,
      CASE WHEN st.sd IS NULL OR st.sd = 0 THEN 0 ELSE (pj.total - st.mu) / st.sd END AS z
    FROM per_judge pj JOIN judge_stats st ON st.judge_id = pj.judge_id
  ),
  agg AS (
    SELECT z.solution_id, count(*)::INT AS judges, avg(z.total) AS weighted, avg(z.z) AS normalised
    FROM z GROUP BY z.solution_id
  )
  SELECT
    e.id,
    e.title,
    e.team_name,
    coalesce(a.judges, 0),
    round(a.weighted, 3),
    round(a.normalised, 3),
    CASE WHEN a.judges IS NULL THEN NULL
      ELSE (rank() OVER (ORDER BY a.judges IS NULL, a.normalised DESC NULLS LAST, a.weighted DESC NULLS LAST))::INT
    END
  FROM entries e
  LEFT JOIN agg a ON a.solution_id = e.id
  ORDER BY a.judges IS NULL, a.normalised DESC NULLS LAST, a.weighted DESC NULLS LAST, e.title;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Not callable directly: it would hand out unpublished results.
REVOKE ALL ON FUNCTION judging_ranking(UUID) FROM PUBLIC, anon, authenticated;

-- Hosts: the ranking plus every score, comment, judge and conflict.
-- Venue members, once published: the ranking only.
-- Anyone else, or before publishing: {visible: false}.
CREATE OR REPLACE FUNCTION event_judging_results(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user UUID := auth.uid();
  v_host BOOLEAN;
  v_published TIMESTAMPTZ;
  v_ranking JSONB;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_host := is_venue_host(v_user, p_event_id);
  SELECT results_published_at INTO v_published FROM events WHERE id = p_event_id;

  IF NOT v_host AND (v_published IS NULL OR NOT is_venue_member(v_user, p_event_id)) THEN
    RETURN jsonb_build_object('visible', FALSE, 'published_at', v_published);
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_ranking
  FROM judging_ranking(p_event_id) r;

  IF NOT v_host THEN
    RETURN jsonb_build_object('visible', TRUE, 'is_host', FALSE, 'published_at', v_published, 'ranking', v_ranking);
  END IF;

  RETURN jsonb_build_object(
    'visible', TRUE,
    'is_host', TRUE,
    'published_at', v_published,
    'ranking', v_ranking,
    'criteria', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'weight', c.weight
      ) ORDER BY c.sort_order), '[]'::jsonb)
      FROM event_criteria c
      WHERE c.event_id = p_event_id AND c.kind = 'judging_criterion'
    ),
    'judges', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', j.user_id,
        'name', coalesce(p.display_name, p.username),
        'declared_at', d.declared_at
      ) ORDER BY coalesce(p.display_name, p.username)), '[]'::jsonb)
      FROM (
        SELECT user_id FROM event_venue_members WHERE event_id = p_event_id AND role = 'judge'
        UNION
        SELECT user_id FROM venue_room_roles WHERE event_id = p_event_id AND role = 'judge'
        UNION
        SELECT judge_id FROM judge_scores WHERE event_id = p_event_id
      ) j
      JOIN profiles p ON p.id = j.user_id
      LEFT JOIN judge_declarations d ON d.event_id = p_event_id AND d.judge_id = j.user_id
    ),
    'scores', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'judge_id', js.judge_id, 'solution_id', js.solution_id,
        'criterion_id', js.criterion_id, 'score', js.score
      )), '[]'::jsonb)
      FROM judge_scores js WHERE js.event_id = p_event_id
    ),
    'comments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'judge_id', jc.judge_id, 'solution_id', jc.solution_id, 'comment', jc.comment
      )), '[]'::jsonb)
      FROM judge_comments jc WHERE jc.event_id = p_event_id
    ),
    'conflicts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'judge_id', c.judge_id, 'team_id', c.team_id, 'solution_id', c.solution_id
      )), '[]'::jsonb)
      FROM judge_conflicts c WHERE c.event_id = p_event_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Organisers only. Publishing also locks entries and scores for good, because
-- submissions_locked() and save_judge_scores() both read this column.
-- Unpublishing hides the results again and reopens scoring, but not entries
-- whose deadline has passed.
CREATE OR REPLACE FUNCTION set_event_results_published(p_event_id UUID, p_published BOOLEAN DEFAULT TRUE)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_at TIMESTAMPTZ;
BEGIN
  IF NOT is_venue_host(auth.uid(), p_event_id) THEN
    RAISE EXCEPTION 'only organisers can publish results' USING ERRCODE = '42501';
  END IF;

  UPDATE events
  SET results_published_at = CASE WHEN p_published THEN coalesce(results_published_at, now()) ELSE NULL END
  WHERE id = p_event_id
  RETURNING results_published_at INTO v_at;

  RETURN v_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 14. Grants
-- ============================================================

-- Helpers used inside policies must be executable by the reader.
GRANT EXECUTE ON FUNCTION is_event_judge(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION submissions_locked(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION peoples_choice_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_entry_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_judge_conflicted(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION may_judge_entry(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION can_view_entry_internals(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION submission_missing(UUID) TO authenticated;

REVOKE ALL ON FUNCTION save_submission(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_submission(UUID, JSONB, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION submit_team_submission(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_team_submission(UUID) TO authenticated;
REVOKE ALL ON FUNCTION my_team_submission(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_team_submission(UUID) TO authenticated;
REVOKE ALL ON FUNCTION declare_judge_conflicts(UUID, UUID[], UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION declare_judge_conflicts(UUID, UUID[], UUID[]) TO authenticated;
REVOKE ALL ON FUNCTION save_judge_scores(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_judge_scores(UUID, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION judging_console(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION judging_console(UUID) TO authenticated;
REVOKE ALL ON FUNCTION cast_peoples_choice_vote(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cast_peoples_choice_vote(UUID) TO authenticated;
REVOKE ALL ON FUNCTION peoples_choice_ballot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION peoples_choice_ballot(UUID) TO authenticated;
REVOKE ALL ON FUNCTION event_judging_results(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION event_judging_results(UUID) TO authenticated;
REVOKE ALL ON FUNCTION set_event_results_published(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_event_results_published(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 15. Verification (read-only)
-- ============================================================
--
--   -- As a team member, before the deadline: returns the entry.
--   SELECT save_submission('<event>', '{"title":"Tidewatch"}');
--   -- After the deadline, as anyone (organiser included): must fail with
--   -- "Entries for this event are closed".
--   UPDATE event_solutions SET title = 'x' WHERE id = '<entry>';
--   -- As a judge with a conflict on the entry's team: must fail.
--   SELECT save_judge_scores('<entry>', '{"<criterion>": 7}');
--   -- As a member of the entry's team: must fail.
--   SELECT cast_peoples_choice_vote('<entry>');
--   -- As a participant before publishing: {"visible": false, ...}
--   SELECT event_judging_results('<event>');
