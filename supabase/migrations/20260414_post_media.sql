-- Generic media attachment for scheduled posts.
-- Replaces single-purpose post_image_url with media_url + media_type so we
-- can handle image, video, pdf/docx (LinkedIn document posts), and audio
-- (auto-converted to video). post_image_url is kept for backwards compat.

ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS post_media_url TEXT;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS post_media_type TEXT;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS post_media_filename TEXT;

-- Backfill from existing image column so old rows keep rendering.
UPDATE scheduled_posts
SET post_media_url = post_image_url, post_media_type = 'image'
WHERE post_media_url IS NULL AND post_image_url IS NOT NULL;
