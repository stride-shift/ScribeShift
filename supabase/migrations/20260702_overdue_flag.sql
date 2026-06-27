-- Overdue post flagging: mark posts still 'scheduled' past their time as overdue.
-- Additive/idempotent. Does NOT affect the cron claim predicate (status='scheduled').
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS overdue_since TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS scheduled_posts_overdue_idx
  ON scheduled_posts (overdue_since) WHERE overdue_since IS NOT NULL;
