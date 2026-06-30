-- 20260710_content_image_url.sql
-- Generated images were only ever shown transiently (ResultsPanel) + uploaded to
-- the generated-images bucket — never saved as content, so they never appeared
-- in History. Add an image_url column so a generated image can be persisted as a
-- generated_content row (content_type='image') and shown in the Content Bank.
-- Additive + idempotent.
ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS image_url TEXT;
