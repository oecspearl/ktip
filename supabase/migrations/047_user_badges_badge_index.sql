-- Directory badge filter: 039's only index is (user_id, awarded_at) — the
-- "find members holding badge X" lookup needs the reverse direction.
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id, user_id);
