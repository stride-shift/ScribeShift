-- Append-only time-series of account-level metrics, so we can chart follower
-- growth / reach / impressions over time. account_metrics keeps only the latest
-- snapshot (overwritten each sync); this table never overwrites — each refresh
-- inserts one row per platform.

CREATE TABLE IF NOT EXISTS account_metrics_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  followers INTEGER,
  following INTEGER,
  posts_count INTEGER,
  profile_views_30d INTEGER,
  reach_30d INTEGER,
  impressions_30d INTEGER,
  engagement_30d INTEGER,
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- Trend queries filter by company/user + platform and order by time.
CREATE INDEX IF NOT EXISTS idx_amh_user_platform_time ON account_metrics_history(user_id, platform, captured_at);
CREATE INDEX IF NOT EXISTS idx_amh_company_time ON account_metrics_history(company_id, captured_at);

ALTER TABLE account_metrics_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON account_metrics_history;
CREATE POLICY "Service role full access" ON account_metrics_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
