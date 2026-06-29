-- 20260704_brand_assets.sql
-- Brand asset library: a gallery of reusable reference images per brand
-- (in-context logos, product shots, past graphics, mood/style references).
-- These are persisted so they can be reused across generations as style
-- references, instead of re-uploading a one-off image each time.
--
-- Idempotent: IF NOT EXISTS throughout; guarded DROP POLICY before CREATE.

CREATE TABLE IF NOT EXISTS brand_assets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  storage_url TEXT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_assets_brand_idx ON brand_assets (brand_id);

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON brand_assets;
CREATE POLICY "Service role full access" ON brand_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
