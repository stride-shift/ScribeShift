-- Periodic metrics refresh via pg_cron + pg_net (mirrors the check-posts job).
--
-- Until now, analytics only refreshed when a user clicked "Refresh" in the
-- dashboard — so data was stale by default. This fires /api/cron/refresh-metrics
-- every 6 hours; that endpoint walks connected users (stalest first, time-boxed)
-- and pulls account + post metrics for each.
--
-- Reuses the same Vault secrets (cron_secret, cron_base_url) as the other jobs.
-- Idempotent / re-runnable.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$ begin perform cron.unschedule('scribeshift-refresh-metrics'); exception when others then null; end $$;

-- Every 6 hours: refresh analytics for connected users.
select cron.schedule(
  'scribeshift-refresh-metrics',
  '0 */6 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_base_url') || '/api/cron/refresh-metrics',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
