-- Account-level analytics (followers, profile views, reach) per user per platform.
-- Complements the existing post_metrics table which tracks per-post numbers.

CREATE TABLE IF NOT EXISTS account_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  platform_user_name TEXT,
  followers INTEGER,
  following INTEGER,
  posts_count INTEGER,
  profile_views_30d INTEGER,
  reach_30d INTEGER,
  impressions_30d INTEGER,
  engagement_30d INTEGER,
  raw_data JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_metrics_user_platform ON account_metrics(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_account_metrics_company ON account_metrics(company_id);

-- Track when we last refreshed metrics for a scheduled post (for stale-data UI hints).
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS metrics_synced_at TIMESTAMPTZ;

-- Distinguish manual entries from API-pulled metrics, and let us update the sync time.
ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
