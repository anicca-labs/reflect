-- Top writers stays an all-time leaderboard, but now also answers "who ELSE wrote
-- on this day?". Anyone with entries on the selected day who didn't make the
-- all-time top-N is appended after the leaderboard, flagged is_top = false and
-- ordered by how much they wrote that day. Before this, a brand-new writer with 2
-- lifetime entries was invisible on their most active day — the one day the admin
-- is actually looking at.
--
-- The OUT columns change (is_top is new), so the function must be dropped rather
-- than replaced.

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
  is_top           boolean
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
  with agg as (
    -- One pass over the whole table: the all-time aggregates and the day's count
    -- come out of the same scan via a filtered aggregate.
    select j.user_id                                                     as uid,
           count(*)                                                      as lifetime,
           count(*) filter (
             where j.created_at >= v_start and j.created_at < v_end)      as on_day,
           min(j.created_at)                                             as first_entry,
           max(j.created_at)                                             as last_entry
      from api.journal_entries j
     group by j.user_id
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
    select t.uid, t.lifetime, t.on_day, t.first_entry, t.last_entry, t.ord, true as top_flag
      from top t
    union all
    select x.uid, x.lifetime, x.on_day, x.first_entry, x.last_entry, x.ord, false
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
    r.top_flag
  from ranked r
  left join auth.users u       on u.id = r.uid
  left join api.entitlements e on e.user_id = r.uid
  order by r.ord;
end;
$$;

revoke all on function api.admin_top_writers(date, text, int)    from public;
grant execute on function api.admin_top_writers(date, text, int) to service_role;
