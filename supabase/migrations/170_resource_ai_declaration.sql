-- ============================================================================
-- 170_resource_ai_declaration.sql — the AI declaration ticked at upload
-- ============================================================================
-- The AI Use Disclosure now requires a member to say so when AI tools
-- materially helped create something they publish, and to say so when AI wrote
-- the full first draft. The resource submission form asks; this column holds
-- the answer, and the library shows it as a label on the card and the page.
--
--   ai_use  TEXT  'none'     no material AI help (spelling and grammar fixes
--                            do not count, per the policy)
--                 'assisted' AI tools materially helped
--                 'drafted'  AI wrote the full first draft
--
-- One column with three values rather than two booleans: 'drafted' without
-- 'assisted' is not a state anyone can be in, and a CHECK cannot be
-- contradicted by a client that sets one flag and forgets the other.
--
-- Defaults to 'none' so existing rows, all published before the declaration
-- existed, carry no label. That is a statement about the form, not about the
-- rows, and the column comment says so.
--
-- No policy changes. 135's INSERT and UPDATE policies already let the author
-- write any column on their own draft or pending row, and resource:manage
-- holders write through 116's FOR ALL policy. The table has no column-level
-- grants, so SELECT * picks the column up for every reader.
--
-- The second half bumps the AI Use Disclosure to version 2, whose "Your side
-- of it" section now carries the declaration rule. It is 'informational', so
-- nobody is asked to re-accept; the row only keeps the register in step with
-- the text in src/lib/legal/ai-disclosure.ts.
-- ============================================================================

ALTER TABLE resources ADD COLUMN IF NOT EXISTS ai_use TEXT NOT NULL DEFAULT 'none';
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_ai_use_check;
ALTER TABLE resources ADD CONSTRAINT resources_ai_use_check
  CHECK (ai_use IN ('none', 'assisted', 'drafted'));

COMMENT ON COLUMN resources.ai_use IS
  'AI declaration made at upload (migration 170): none, assisted (AI materially helped) or drafted (AI wrote the full first draft). Rows written before 170 default to none because the form did not ask, not because the author declared it.';

UPDATE legal_documents SET is_current = FALSE
 WHERE key = 'ai-disclosure' AND version <> 2;

INSERT INTO legal_documents (key, version, effective_date, bundle, is_current, title)
VALUES ('ai-disclosure', 2, DATE '2026-10-11', 'informational', TRUE, 'AI Use Disclosure')
ON CONFLICT (key, version) DO UPDATE SET
  effective_date = EXCLUDED.effective_date,
  is_current     = TRUE;
