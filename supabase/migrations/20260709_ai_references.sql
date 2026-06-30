-- 20260709_ai_references.sql
-- Personal "References" library: images, docs, and PDFs a user uploads for the
-- AI to look at when generating posts/images. Each reference can be tagged with
-- what the AI should take from it (tone / look / imagery). Documents/PDFs also
-- store extracted text so the model can read them.
-- ("references" is a SQL reserved word, hence ai_references.)
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS ai_references (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  storage_url    TEXT NOT NULL,
  filename       TEXT,
  mime_type      TEXT,
  kind           TEXT DEFAULT 'image',   -- image | document
  extracted_text TEXT,                   -- for docs/pdfs
  purposes       TEXT[] DEFAULT '{}',    -- subset of: tone | look | imagery
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_references_user_idx ON ai_references (user_id);

ALTER TABLE ai_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON ai_references;
CREATE POLICY "Service role full access" ON ai_references
  FOR ALL TO service_role USING (true) WITH CHECK (true);
