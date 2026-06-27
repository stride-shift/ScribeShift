-- Per-post image intent (caption-only / generated / uploaded). Additive + idempotent.
-- 'auto' (default) preserves legacy media-presence-driven behaviour.
ALTER TABLE scheduled_posts  ADD COLUMN IF NOT EXISTS image_mode TEXT DEFAULT 'auto';
ALTER TABLE post_revisions   ADD COLUMN IF NOT EXISTS image_mode TEXT DEFAULT 'auto';
