-- 20260705_generation_jobs_stall_sweeper.sql
-- Server-side resilience for async content generation — the "Supabase half" of
-- the background-jobs system (the Cloud Run worker is the processor).
--
-- WHY: a generation_jobs row can get stranded:
--   * status='running' but the worker died mid-job (crash / redeploy / OOM), or
--   * status='pending' but no worker ever claimed it (worker not deployed/down).
-- Either way the row never reaches a terminal state, and the UI polls forever.
-- This mirrors Justin's battlepack stall-sweeper: a pg_cron job that fails any
-- row left untouched too long, with a plain-language message the UI can show.
--
-- The worker bumps updated_at on every progress step (server/worker.js setJob),
-- so a healthy job is never swept. Pure SQL (no HTTP / Vault).
--
-- Implementation note: we schedule the UPDATE directly as the cron command
-- (no plpgsql wrapper function), and escape inner quotes with doubled '' rather
-- than $$ dollar-quoting — this parses cleanly in every SQL editor.
-- Idempotent: cron.schedule upserts by job name (pg_cron >= 1.4).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'generation-jobs-stall-sweeper',
  '*/5 * * * *',
  'UPDATE generation_jobs SET status = ''error'', error = ''Generation stalled and could not finish. Please try generating again.'', updated_at = now() WHERE status IN (''pending'', ''running'') AND updated_at < now() - interval ''15 minutes'''
);
