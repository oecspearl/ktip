-- UAT Feedback Responses table (v2)
-- Refactored: focuses on usefulness & user experience
-- Fully anonymous survey — no authentication required

DROP TABLE IF EXISTS uat_responses;

CREATE TABLE uat_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Section 1: Usefulness & Value (Q1-Q5)
  q1_usefulness text NOT NULL CHECK (q1_usefulness IN ('very_useful', 'somewhat', 'not_very', 'not_at_all')),
  q2_valuable_features text[] NOT NULL DEFAULT '{}',       -- multi-select array
  q3_connect_innovators text NOT NULL CHECK (q3_connect_innovators IN ('yes', 'somewhat', 'no')),
  q4_discover_opportunities text NOT NULL CHECK (q4_discover_opportunities IN ('yes', 'somewhat', 'no')),
  q5_recommend_rating int NOT NULL CHECK (q5_recommend_rating BETWEEN 1 AND 5),

  -- Section 2: User Experience (Q6-Q10)
  q6_ease_of_navigation text NOT NULL CHECK (q6_ease_of_navigation IN ('very_easy', 'easy', 'neutral', 'difficult', 'very_difficult')),
  q7_professional text NOT NULL CHECK (q7_professional IN ('yes', 'somewhat', 'no')),
  q8_overall_experience text NOT NULL CHECK (q8_overall_experience IN ('excellent', 'good', 'average', 'poor', 'very_poor')),
  q9_issues boolean NOT NULL,
  q9_issues_detail text,
  q10_performance text NOT NULL CHECK (q10_performance IN ('fast', 'acceptable', 'slow')),

  -- Section 3: Open Feedback (Q11-Q12)
  q11_improvements text,
  q12_comments text,

  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_uat_responses_created_at ON uat_responses(created_at DESC);

ALTER TABLE uat_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit UAT responses"
  ON uat_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read UAT responses"
  ON uat_responses
  FOR SELECT
  TO authenticated
  USING (true);
