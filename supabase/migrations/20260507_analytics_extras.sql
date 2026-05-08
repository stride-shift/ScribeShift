-- Native-platform-style analytics: recent posts with their per-post stats,
-- plus a free-form extras object for metrics that don't merit dedicated columns
-- (e.g. Twitter mentions, Instagram website clicks, FB page views).

ALTER TABLE account_metrics
  ADD COLUMN IF NOT EXISTS recent_posts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_metrics JSONB DEFAULT '{}'::jsonb;
