-- Add retry_count column to scheduled_posts for tracking failed post attempts
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
