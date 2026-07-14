-- Manage the daily-reminder cron as code so staging and prod mirror exactly: applying
-- migrations (re)creates the job — no hand-run SQL per environment.
--
-- The cron's target URL and auth differ per environment, so they live in a small private
-- config table seeded ONCE per env (values are NOT in this file — see the one-time seed
-- below). This keeps the migration identical across environments and free of secrets.
--
-- One-time per environment (run once, e.g. via the dashboard SQL editor — NOT committed):
--   insert into private.cron_config(key, value) values
--     ('edge_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
--     ('cron_anon_key', '<that env''s anon/publishable key>')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create table if not exists private.cron_config (
  key text primary key,
  value text not null
);
-- Never expose to the API roles (the anon key living here is public anyway, but keep the
-- table out of PostgREST regardless).
revoke all on private.cron_config from anon, authenticated;

-- cron.schedule upserts by job name, so this is idempotent — it also replaces any earlier
-- hand-made job of the same name. The command reads URL + key from private.cron_config at
-- run time, so rotating a key or moving environments is just an update to that table.
select cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $cmd$
  select net.http_post(
    url := (select value from private.cron_config where key = 'edge_base_url') || '/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from private.cron_config where key = 'cron_anon_key')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
