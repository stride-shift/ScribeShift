-- Supabase pg_cron jobs to replace Vercel crons.
--
-- Vercel Hobby caps crons at once-per-day, so hourly post-checking never fires.
-- pg_cron + pg_net let us fire /api/cron/check-posts from Postgres on any
-- schedule we want. The HTTP endpoints still validate
-- `Authorization: Bearer <CRON_SECRET>` exactly as before.
--
-- Secrets (cron_secret, cron_base_url) live in Supabase Vault. They were
-- seeded by hand via vault.create_secret(...) at deploy time; this migration
-- is idempotent and re-runnable without touching those values.
--
-- If you need to rotate the secret or point at a different domain, update the
-- Vault entries — pg_cron reads them on every invocation:
--   update vault.secrets set secret = '<new>' where name = 'cron_secret';
--   update vault.secrets set secret = '<new>' where name = 'cron_base_url';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Make re-running safe.
do $$ begin perform cron.unschedule('scribeshift-check-posts'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('scribeshift-daily-reminder'); exception when others then null; end $$;

-- Every 5 minutes: claim due scheduled_posts and publish them.
select cron.schedule(
  'scribeshift-check-posts',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_base_url') || '/api/cron/check-posts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- Daily at 07:00 UTC: send reminder emails for posts scheduled today.
select cron.schedule(
  'scribeshift-daily-reminder',
  '0 7 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_base_url') || '/api/cron/daily-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
