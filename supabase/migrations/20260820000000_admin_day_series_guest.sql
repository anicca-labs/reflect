-- admin_day_series: add guest activations per day, so the CHART tells the same story
-- as the tiles.
--
-- The day tiles were split guest/signed-in on 2026-08-18, but the trend chart still
-- plotted only server-visible entries — which is how a healthy week read as a
-- collapse on 2026-08-20: new installs since 1.3.0 write as guests (device-local
-- entries, invisible here) and the chart showed only the shrinking signed-in slice.
-- The series now carries the guests' first entries per day — the one guest event the
-- server ever sees — so the console can stack it on the bars.
--
-- Same stamped-at-the-moment logic as admin_day_stats: first_entry_guest records
-- whether the device had an account when it first wrote, so a guest who later signs
-- up doesn't silently move out of their activation day's count.
--
-- The return type changes, so create-or-replace won't do; drop + recreate + re-grant.
drop function if exists api.admin_day_series(date, int, text);

create function api.admin_day_series(
  p_end  date,
  p_days int default 14,
  p_tz   text default 'UTC'
)
returns table (
  day               date,
  entries           bigint,
  writers           bigint,
  signups           bigint,
  reflections       bigint,
  guest_activations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz   text := api.admin_tz(p_tz);
  v_days int  := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  return query
  with d as (
    select (p_end - offs)::date as day
      from generate_series(0, v_days - 1) as offs
  ), b as (
    select d.day,
           (d.day::timestamp) at time zone v_tz       as s,
           ((d.day + 1)::timestamp) at time zone v_tz as e
      from d
  )
  select
    b.day,
    (select count(*) from api.journal_entries j
      where j.created_at >= b.s and j.created_at < b.e),
    (select count(distinct j.user_id) from api.journal_entries j
      where j.created_at >= b.s and j.created_at < b.e),
    (select count(*) from auth.users u
      where u.created_at >= b.s and u.created_at < b.e),
    (select count(*) from api.reflections r
      where r.created_at >= b.s and r.created_at < b.e),
    (select count(*) from api.device_tokens t
      where t.first_entry_at >= b.s and t.first_entry_at < b.e
        and coalesce(t.first_entry_guest, t.user_id is null))
  from b
  order by b.day;
end;
$$;

revoke all on function api.admin_day_series(date, int, text) from public;
grant execute on function api.admin_day_series(date, int, text) to service_role;
