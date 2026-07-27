-- Analytics RPC functions for admin dashboard

-- Get user count by role
CREATE OR REPLACE FUNCTION get_users_by_role()
RETURNS TABLE(role TEXT, count BIGINT) AS $$
  SELECT unnest(roles) as role, COUNT(*) as count
  FROM profiles
  GROUP BY role
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get user count by country
CREATE OR REPLACE FUNCTION get_users_by_country()
RETURNS TABLE(country TEXT, count BIGINT) AS $$
  SELECT COALESCE(country, 'Unknown') as country, COUNT(*) as count
  FROM profiles
  GROUP BY country
  ORDER BY count DESC
  LIMIT 15;
$$ LANGUAGE sql STABLE;

-- Get projects by category
CREATE OR REPLACE FUNCTION get_projects_by_category()
RETURNS TABLE(category TEXT, count BIGINT) AS $$
  SELECT COALESCE(category, 'uncategorized') as category, COUNT(*) as count
  FROM projects
  GROUP BY category
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get projects by phase
CREATE OR REPLACE FUNCTION get_projects_by_phase()
RETURNS TABLE(phase TEXT, count BIGINT) AS $$
  SELECT phase, COUNT(*) as count
  FROM projects
  GROUP BY phase
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get grant application pipeline
CREATE OR REPLACE FUNCTION get_grant_application_pipeline()
RETURNS TABLE(status TEXT, count BIGINT) AS $$
  SELECT status, COUNT(*) as count
  FROM grant_applications
  GROUP BY status
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- Get monthly user growth
CREATE OR REPLACE FUNCTION get_user_growth(start_date TIMESTAMP DEFAULT NOW() - INTERVAL '12 months', end_date TIMESTAMP DEFAULT NOW())
RETURNS TABLE(month TEXT, count BIGINT) AS $$
  SELECT
    TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') as month,
    COUNT(*) as count
  FROM profiles
  WHERE created_at >= start_date AND created_at <= end_date
  GROUP BY date_trunc('month', created_at)
  ORDER BY month ASC;
$$ LANGUAGE sql STABLE;

-- Get events by type
CREATE OR REPLACE FUNCTION get_events_by_type()
RETURNS TABLE(event_type TEXT, count BIGINT) AS $$
  SELECT event_type, COUNT(*) as count
  FROM events
  GROUP BY event_type
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;
