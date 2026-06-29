-- 20260708_review_assigned_to.sql
-- Lets a "send for feedback" target a specific org member (the assigned
-- reviewer), instead of only surfacing to the whole company. Additive +
-- nullable + idempotent.
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS review_assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scheduled_posts_review_assigned_idx
  ON scheduled_posts (review_assigned_to) WHERE review_assigned_to IS NOT NULL;
