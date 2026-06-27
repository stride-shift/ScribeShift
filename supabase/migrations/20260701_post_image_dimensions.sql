-- 20260701_post_image_dimensions.sql
-- Wave 1 (Layer A): per-platform image dimension storage.
--
-- Creates a child table `post_image_variants` so each scheduled post can carry
-- one storage URL (and optional aspect/width/height) per target platform.
--
-- Layer A pass-through: the image-finalizer service stores the base image URL
-- as every platform's variant. Layer B (branding/image-quality rework) swaps
-- image-finalizer's producePlatformVariant() to do real per-format rendering
-- and upload; this table and all surrounding plumbing require no further change.
--
-- Idempotent: IF NOT EXISTS throughout; guarded DROP POLICY IF EXISTS before CREATE.

-- ── post_image_variants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_image_variants (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id  UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id         UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL,        -- linkedin | twitter | facebook | instagram
  storage_url        TEXT NOT NULL,        -- Layer A: = base image URL (pass-through)
  aspect             TEXT,                 -- target aspect, e.g. '1.91:1', '4:5'
  width              INTEGER,
  height             INTEGER,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Efficient lookup by parent post
CREATE INDEX IF NOT EXISTS post_image_variants_post_idx
  ON post_image_variants (scheduled_post_id);

-- Ensures at most one variant row per (post, platform); enables idempotent upsert
CREATE UNIQUE INDEX IF NOT EXISTS post_image_variants_post_platform_uniq
  ON post_image_variants (scheduled_post_id, platform);

ALTER TABLE post_image_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON post_image_variants;
CREATE POLICY "Service role full access" ON post_image_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);
