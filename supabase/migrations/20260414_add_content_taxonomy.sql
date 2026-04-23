-- Add taxonomy / organization columns used by the Content Bank UI.
-- The frontend filters generated content by pillar, tone, status, and pinned,
-- but those columns did not exist on generated_content, causing the error
-- "column generated_content.pinned does not exist".

ALTER TABLE generated_content
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pillar TEXT,
  ADD COLUMN IF NOT EXISTS tone   TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Back-fill status for existing rows so NOT-NULL semantics behave consistently.
UPDATE generated_content SET status = 'draft' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_pinned ON generated_content(pinned) WHERE pinned;
CREATE INDEX IF NOT EXISTS idx_content_pillar ON generated_content(pillar);
CREATE INDEX IF NOT EXISTS idx_content_tone   ON generated_content(tone);
CREATE INDEX IF NOT EXISTS idx_content_status ON generated_content(status);
