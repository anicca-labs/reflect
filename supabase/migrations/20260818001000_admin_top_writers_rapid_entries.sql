-- Adds burst detection to the top-writers rows: `rapid_entries` counts, per user,
-- how many of their entries were created less than 60 seconds after their previous
-- one. Real journaling takes minutes; a run of entries seconds apart is someone
-- poking at the app (or a test account), and the console wants to tag those so a
-- burst of 19 "entries" doesn't read as a power user.
--
-- The SQL only reports the count — the threshold for CALLING someone phony
-- (share of rapid gaps, minimum entries) is the console's judgment, kept client-side
-- so tuning it doesn't need a migration.
--
-- The OUT columns change (rapid_entries is new), so the function must be dropped
-- rather than replaced.

drop function if exists api.admin_top_writers(date, text, int);

create or replace function api.admin_top_writers(
  p_day   date,
  p_tz    text default 'UTC',
  p_limit int default 10
)
returns table (
  user_id          uuid,
  email            text,
  lifetime_entries bigint,
  entries_on_day   bigint,
  first_at         timestamptz,
  last_at          timestamptz,
  is_pro           boolean,
  signed_up_at     timestamptz,
  is_top           boolean,
  rapid_entries    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text := api.admin_tz(p_tz);
  v_start timestamptz;
  v_end   timestamptz;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
begin
  v_start := (p_day::timestamp) at time zone v_tz;
  v_end   := ((p_day + 1)::timestamp) at time zone v_tz;

  return query
  with gaps as (
    -- Each entry with the time since the same user's previous entry (null for
    -- their first ever). Content is encrypted, so timing is the only signal
    -- the server has about how an account writes.
    select j.user_id    as uid,
           j.created_at as created_at,
           j.created_at - lag(j.created_at) over (
             partition by j.user_id order by j.created_at) as gap
      from api.journal_entries j
  ),
  agg as (
    -- One pass: all-time aggregates, the day's count, and the burst count come
    -- out of the same scan via filtered aggregates.
    select g.uid,
           count(*)                                                      as lifetime,
           count(*) filter (
             where g.created_at >= v_start and g.created_at < v_end)      as on_day,
           min(g.created_at)                                             as first_entry,
           max(g.created_at)                                             as last_entry,
           count(*) filter (where g.gap < interval '60 seconds')         as rapid
      from gaps g
     group by g.uid
  ),
  top as (
    select a.*, row_number() over (order by a.lifetime desc, a.last_entry desc) as ord
      from agg a
     order by a.lifetime desc, a.last_entry desc
     limit v_limit
  ),
  day_extra as (
    -- Day writers outside the top, ranked by that day's output. Bounded by real
    -- day activity; the limit 100 is a backstop, not a knob.
    select a.*, v_limit + row_number() over (order by a.on_day desc, a.lifetime desc) as ord
      from agg a
     where a.on_day > 0
       and not exists (select 1 from top t where t.uid = a.uid)
     order by a.on_day desc, a.lifetime desc
     limit 100
  ),
  ranked as (
    select t.uid, t.lifetime, t.on_day, t.first_entry, t.last_entry, t.rapid, t.ord,
           true as top_flag
      from top t
    union all
    select x.uid, x.lifetime, x.on_day, x.first_entry, x.last_entry, x.rapid, x.ord,
           false
      from day_extra x
  )
  select
    r.uid,
    -- auth.users.email is varchar(255); the ::text cast is required or the row type
    -- won't match this function's declared `email text` column.
    coalesce(u.email::text, r.uid::text) as email,
    r.lifetime,
    r.on_day,
    r.first_entry,
    r.last_entry,
    coalesce(e.is_pro, false)            as is_pro,
    u.created_at                         as signed_up_at,
    r.top_flag,
    r.rapid
  from ranked r
  left join auth.users u       on u.id = r.uid
  left join api.entitlements e on e.user_id = r.uid
  order by r.ord;
end;
$$;

revoke all on function api.admin_top_writers(date, text, int)    from public;
grant execute on function api.admin_top_writers(date, text, int) to service_role;
