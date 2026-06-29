-- ============================================================================
-- ScribeShift — apply the 20260608 migration set to PRODUCTION
-- ----------------------------------------------------------------------------
-- These four were NOT in the 9 migrations applied during the deploy. Without
-- them, three features silently fail in prod:
--   * invitations          -> invite-only signup (auth.js findPendingInvite)
--   * generation_jobs       -> async/background content generation + worker
--   * generation_jobs.input -> the Cloud Run worker reads its payload here
--   * account_metrics_history -> analytics trend charts
--
-- Every statement is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), so
-- pasting this whole block is SAFE whether or not a table already exists.
-- Run in: Supabase Dashboard -> SQL Editor. Paste the whole block, run once.
--
-- NOT included here: 20260608_metrics_cron.sql — it needs Vault secrets
-- (cron_base_url, cron_secret) and the /api/cron/refresh-metrics endpoint live
-- first. Apply that one separately, post-deploy.
-- ============================================================================

-- ── 1. invitations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email ON invitations (lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (lower(email));
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON invitations;
CREATE POLICY "Service role full access" ON invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. generation_jobs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content_types TEXT[] DEFAULT '{}',
  progress JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at);
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own jobs" ON generation_jobs;
CREATE POLICY "Users read own jobs" ON generation_jobs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access" ON generation_jobs;
CREATE POLICY "Service role full access" ON generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. generation_jobs.input (worker payload) ───────────────────────
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}'::jsonb;

-- ── 4. account_metrics_history ──────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_amh_user_platform_time ON account_metrics_history(user_id, platform, captured_at);
CREATE INDEX IF NOT EXISTS idx_amh_company_time ON account_metrics_history(company_id, captured_at);
ALTER TABLE account_metrics_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON account_metrics_history;
CREATE POLICY "Service role full access" ON account_metrics_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Verify (optional — run after; all four should return a table name) ──
-- SELECT to_regclass('public.invitations'), to_regclass('public.generation_jobs'),
--        to_regclass('public.account_metrics_history');
