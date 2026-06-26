-- Background generation jobs. The Supabase Edge Function `generate-content`
-- writes progress/results here while it runs in the background, so the browser
-- can fire-and-forget a long generation, navigate away, and poll this table for
-- the result instead of holding a request open (which Vercel caps at 60s).

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | running | done | error
  content_types TEXT[] DEFAULT '{}',
  progress JSONB DEFAULT '{}'::jsonb,          -- { current, total, label }
  result JSONB DEFAULT '{}'::jsonb,            -- { [contentType]: text }
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users may read their own jobs (so the browser can poll with the anon key +
-- their session). The Edge Function uses the service-role key and bypasses RLS.
DROP POLICY IF EXISTS "Users read own jobs" ON generation_jobs;
CREATE POLICY "Users read own jobs" ON generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access" ON generation_jobs;
CREATE POLICY "Service role full access" ON generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
