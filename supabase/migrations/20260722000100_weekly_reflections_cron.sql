-- Weekly AI-reflection cron: every Sunday, call generate-reflection in admin mode so it
-- loops opted-in users and writes each a fresh reflection for the past week.
--
-- Mirrors the send-reminders cron: URL + keys live in private.cron_config (seeded ONCE per
-- env, NOT in this file), so this migration is identical across environments and secret-free.
-- The generate-reflection function is deployed --no-verify-jwt and authenticates the admin
-- path via the X-Admin-Secret header (compared to the ADMIN_PUSH_SECRET function secret).
--
-- One-time per environment (run once, e.g. via the dashboard SQL editor — NOT committed):
--   insert into private.cron_config(key, value) values
--     ('edge_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
--     ('cron_anon_key', '<that env''s anon/publishable key>'),
--     ('admin_push_secret', '<that env''s ADMIN_PUSH_SECRET value>'),
--     ('weekly_reflections_enabled', 'true')  -- set 'false' to keep the job mirrored but idle
--   on conflict (key) do update set value = excluded.value;
--
-- edge_base_url + cron_anon_key are already seeded for the reminder cron; only
-- admin_push_secret (+ optionally weekly_reflections_enabled) are new here.
--
-- weekly_reflections_enabled gates whether the cron actually calls the function. Absent →
-- treated as ON (so prod runs once promoted without extra setup). Set it 'false' on staging
-- if you'd rather test only via the in-app "Generate" button and not have Sunday fire.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Sunday 16:00 UTC. cron.schedule upserts by job name → idempotent across re-applies.
select cron.schedule(
  'generate-weekly-reflections',
  '0 16 * * 0',
  $cmd$
  select net.http_post(
    url := (select value from private.cron_config where key = 'edge_base_url') || '/generate-reflection',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from private.cron_config where key = 'cron_anon_key'),
      'X-Admin-Secret', (select value from private.cron_config where key = 'admin_push_secret')
    ),
    body := jsonb_build_object('action', 'run-weekly')
  )
  where coalesce((select value from private.cron_config where key = 'weekly_reflections_enabled'), 'true') = 'true';
  $cmd$
);
