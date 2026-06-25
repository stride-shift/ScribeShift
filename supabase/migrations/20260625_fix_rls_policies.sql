-- 20260625_fix_rls_policies.sql
-- Security hardening (from micro audit 2026-06-25).
--
-- Scope the bare "Service role full access" RLS policies to the service_role
-- role only, and enable RLS on social_credentials (which had none).
--
-- WHY: these policies were written `FOR ALL USING (true)` with no `TO` clause,
-- so they applied to PUBLIC -- including the `authenticated` and `anon` roles.
-- Any authenticated session could read/write/delete these rows directly via the
-- Supabase REST API. The Express server and Cloud Run worker use the SERVICE-ROLE
-- key, which BYPASSES RLS entirely, so tightening these policies does NOT affect
-- server-side access.
--
-- generation_jobs is the only browser-reachable table in this set
-- (src/hooks/useGenerationJob.js polls it with the anon key). Its
-- "Users read own jobs" SELECT policy is left UNCHANGED so legitimate polling
-- keeps working; only the bare full-access policy is scoped to service_role.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.
-- This migration changes policies only -- no data is modified.

-- generation_jobs ---------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON generation_jobs;
CREATE POLICY "Service role full access" ON generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- NOTE: the "Users read own jobs" SELECT policy is intentionally preserved.

-- account_metrics_history -------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON account_metrics_history;
CREATE POLICY "Service role full access" ON account_metrics_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- invitations -------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON invitations;
CREATE POLICY "Service role full access" ON invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- social_oauth_tokens -----------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON social_oauth_tokens;
CREATE POLICY "Service role full access" ON social_oauth_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- password_resets ---------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON password_resets;
CREATE POLICY "Service role full access" ON password_resets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- google_calendar_tokens --------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON google_calendar_tokens;
CREATE POLICY "Service role full access" ON google_calendar_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- social_credentials -- RLS was never enabled on this table ---------------------
ALTER TABLE social_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON social_credentials;
CREATE POLICY "Service role full access" ON social_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);
