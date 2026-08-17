-- Top writers becomes an ALL-TIME leaderboard instead of a one-day ranking.
--
-- The day-scoped version answered "who wrote most today?", which on a quiet day is
-- a table of one person with two entries — a ranking of noise. "Who are the heaviest
-- users of this app?" is the question the panel is actually there to answer, and it
-- doesn't change shape with the selected day.
--
-- The selected day is still passed in: `entries_on_day` keeps the day context by
-- showing what each all-time top writer did on that particular day (usually 0, which
-- is itself the interesting part — the leaderboard doubles as a "did my heaviest
-- users show up today?" check). first_at / last_at are now the account's first and
-- last entry EVER, not the day's.
--
-- The OUT columns change, so the function must be dropped rather than replaced.
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
  signed_up_at     timestamptz
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
  select
    d.user_id,
    -- auth.users.email is varchar(255); the ::text cast is required or the row type
    -- won't match this function's declared `email text` column.
    coalesce(u.email::text, d.user_id::text) as email,
    d.lifetime_entries,
    d.entries_on_day,
    d.first_at,
    d.last_at,
    coalesce(e.is_pro, false)                as is_pro,
    u.created_at                             as signed_up_at
  from (
    -- One pass over the whole table: the all-time aggregates and the day's count
    -- come out of the same scan via a filtered aggregate.
    select j.user_id,
           count(*)                                                          as lifetime_entries,
           count(*) filter (
             where j.created_at >= v_start and j.created_at < v_end)          as entries_on_day,
           min(j.created_at)                                                 as first_at,
           max(j.created_at)                                                 as last_at
      from api.journal_entries j
     group by j.user_id
  ) d
  left join auth.users u       on u.id = d.user_id
  left join api.entitlements e on e.user_id = d.user_id
  order by d.lifetime_entries desc, d.last_at desc
  limit v_limit;
end;
$$;

revoke all on function api.admin_top_writers(date, text, int)    from public;
grant execute on function api.admin_top_writers(date, text, int) to service_role;
