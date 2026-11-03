-- Migration 195: Homebase integrations — the team's repo and outside links
--
-- One row per team: the GitHub repository it builds in, and where else it
-- lives (a Discord channel, a backup Zoom room, a Notion page). The Homebase
-- shows these as cards; the repo card reads GitHub's public API from the
-- browser, so no token is stored and nothing is proxied.
--
-- Only https URLs on the services they claim to be, so a "Zoom" card cannot
-- point anywhere else. Team and hosts only, through can_use_team() (190).
--
-- Needs 188 and 190. Idempotent.

CREATE TABLE IF NOT EXISTS team_links (
  team_id UUID PRIMARY KEY REFERENCES event_teams(id) ON DELETE CASCADE,
  -- owner/name, as GitHub writes it.
  github_repo TEXT CHECK (github_repo IS NULL OR github_repo ~ '^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$'),
  discord_url TEXT CHECK (discord_url IS NULL OR discord_url ~ '^https://(discord\.gg|discord\.com)/'),
  zoom_url TEXT CHECK (zoom_url IS NULL OR zoom_url ~ '^https://([a-z0-9-]+\.)?zoom\.us/'),
  notion_url TEXT CHECK (notion_url IS NULL OR notion_url ~ '^https://([a-z0-9-]+\.)?(notion\.so|notion\.site)/'),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads its links" ON team_links;
CREATE POLICY "Team reads its links" ON team_links FOR SELECT
  USING (can_use_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Team adds its links" ON team_links;
CREATE POLICY "Team adds its links" ON team_links FOR INSERT
  WITH CHECK (can_use_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Team changes its links" ON team_links;
CREATE POLICY "Team changes its links" ON team_links FOR UPDATE
  USING (can_use_team(auth.uid(), team_id))
  WITH CHECK (can_use_team(auth.uid(), team_id));

NOTIFY pgrst, 'reload schema';
