-- Admin RPCs so the push console can read + toggle the daily-reminder cron's send flag
-- without hand-run SQL. The flag lives in private.cron_config (not exposed to PostgREST),
-- so these SECURITY DEFINER functions in the api schema are the bridge. Locked to the
-- service_role (admin-push calls them with the service key); not callable by anon/auth.

create or replace function api.reminder_cron_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled     text;
  v_scheduled   boolean;
  v_last_run    timestamptz;
  v_last_status text;
begin
  select value into v_enabled
    from private.cron_config where key = 'automated_sends_enabled';
  select active into v_scheduled
    from cron.job where jobname = 'send-reminders-every-minute';
  select start_time, status into v_last_run, v_last_status
    from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'send-reminders-every-minute')
    order by start_time desc limit 1;
  return jsonb_build_object(
    'enabled',     coalesce(v_enabled, 'true') = 'true',
    'scheduled',   coalesce(v_scheduled, false),
    'last_run',    v_last_run,
    'last_status', v_last_status
  );
end;
$$;

create or replace function api.reminder_cron_set(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.cron_config(key, value)
  values ('automated_sends_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  return api.reminder_cron_status();
end;
$$;

revoke all on function api.reminder_cron_status()        from public;
revoke all on function api.reminder_cron_set(boolean)    from public;
grant execute on function api.reminder_cron_status()     to service_role;
grant execute on function api.reminder_cron_set(boolean) to service_role;
