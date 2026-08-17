-- Admin RPCs behind the daily-stats console (docs/admin/stats.html → admin-stats).
--
-- Everything the console shows is a per-DAY aggregate, and "a day" only means
-- something in a timezone: the browser passes its IANA zone and the boundaries are
-- computed here, so switching between today / yesterday / any past date is the same
-- query with a different date. An unknown zone falls back to UTC rather than
-- erroring — a bad `tz` should never blank the dashboard.
--
-- PRIVACY: counts and, for the top-writers table, the account's email. Journal
-- content is encrypted at rest (enc:v1:) and is never read here — not even its
-- length. "Top writers" ranks by NUMBER OF ENTRIES, which is the only volume signal
-- the server legitimately has.
--
-- All three are SECURITY DEFINER (they read auth.users and RLS-protected tables)
-- and locked to the service_role — only the admin-stats Edge Function, holding the
-- service key and the admin secret, can call them.

-- Canonicalise a timezone name, falling back to UTC. Kept as its own function so
-- the three RPCs below can't drift on the fallback rule.
create or replace function api.admin_tz(p_tz text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select n.name from pg_catalog.pg_timezone_names n where n.name = p_tz),
    'UTC'
  );
$$;

-- ── One day's headline numbers ───────────────────────────────────────────────
-- Returns a flat jsonb object so new metrics can be added without a signature
-- change (the console renders whatever tiles it knows about).
create or replace function api.admin_day_stats(p_day date, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text := api.admin_tz(p_tz);
  v_start timestamptz;
  v_end   timestamptz;
begin
  v_start := (p_day::timestamp) at time zone v_tz;
  v_end   := ((p_day + 1)::timestamp) at time zone v_tz;

  return jsonb_build_object(
    'day',  p_day,
    'tz',   v_tz,
    'from', v_start,
    'to',   v_end,

    -- Writing
    'entries', (
      select count(*) from api.journal_entries j
       where j.created_at >= v_start and j.created_at < v_end),
    'writers', (
      select count(distinct j.user_id) from api.journal_entries j
       where j.created_at >= v_start and j.created_at < v_end),
    -- Activation: accounts whose FIRST-EVER entry landed on this day.
    'new_writers', (
      select count(*) from (
        select j.user_id, min(j.created_at) as first_at
          from api.journal_entries j group by j.user_id
      ) t where t.first_at >= v_start and t.first_at < v_end),
    -- Guests journal locally, so their entries never reach the server; a device's
    -- first_entry_at is the only server-side signal that a guest started writing.
    'device_activations', (
      select count(*) from api.device_tokens d
       where d.first_entry_at >= v_start and d.first_entry_at < v_end),

    -- Growth
    'signups', (
      select count(*) from auth.users u
       where u.created_at >= v_start and u.created_at < v_end),
    'pro_events', (
      select count(*) from api.entitlements e
       where e.is_pro and e.updated_at >= v_start and e.updated_at < v_end),
    'paywall_views', (
      select count(*) from api.paywall_views p
       where p.created_at >= v_start and p.created_at < v_end),

    -- AI reflections
    'reflections', (
      select count(*) from api.reflections r
       where r.created_at >= v_start and r.created_at < v_end),
    'reflections_seen', (
      select count(*) from api.reflections r
       where r.seen_at >= v_start and r.seen_at < v_end),
    'feedback_yes', (
      select count(*) from api.reflection_feedback f
       where f.felt_true and f.created_at >= v_start and f.created_at < v_end),
    'feedback_no', (
      select count(*) from api.reflection_feedback f
       where not f.felt_true and f.created_at >= v_start and f.created_at < v_end),
    'echoes', (
      select count(*) from api.echo_log e
       where e.created_at >= v_start and e.created_at < v_end),
    'share_taps', (
      select count(*) from api.share_taps s
       where s.created_at >= v_start and s.created_at < v_end),

    -- Push. sent_on is the RECIPIENT's local date (see api.push_log), so this is
    -- deliberately a date match and not a timestamp range.
    'pushes', (
      select count(*) from api.push_log l where l.sent_on = p_day),
    'pushes_by_kind', coalesce((
      select jsonb_object_agg(k.kind, k.n) from (
        select l.kind, count(*) as n from api.push_log l
         where l.sent_on = p_day group by l.kind
      ) k), '{}'::jsonb),

    -- Running totals, as of now (not day-scoped) — context for the day's numbers.
    'totals', jsonb_build_object(
      'users',       (select count(*) from auth.users),
      'entries',     (select count(*) from api.journal_entries),
      'writers',     (select count(distinct j.user_id) from api.journal_entries j),
      'devices',     (select count(*) from api.device_tokens),
      'pro',         (select count(*) from api.entitlements e where e.is_pro),
      'reflections', (select count(*) from api.reflections),
      'ai_opted_in', (select count(*) from api.user_settings s where s.ai_reflections_enabled)
    )
  );
end;
$$;

-- ── Who wrote the most on a given day ────────────────────────────────────────
create or replace function api.admin_top_writers(
  p_day   date,
  p_tz    text default 'UTC',
  p_limit int default 10
)
returns table (
  user_id          uuid,
  email            text,
  entries          bigint,
  first_at         timestamptz,
  last_at          timestamptz,
  lifetime_entries bigint,
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
    coalesce(u.email::text, d.user_id::text)                          as email,
    d.entries,
    d.first_at,
    d.last_at,
    (select count(*) from api.journal_entries a where a.user_id = d.user_id) as lifetime_entries,
    coalesce(e.is_pro, false)                                         as is_pro,
    u.created_at                                                      as signed_up_at
  from (
    select j.user_id,
           count(*)          as entries,
           min(j.created_at) as first_at,
           max(j.created_at) as last_at
      from api.journal_entries j
     where j.created_at >= v_start and j.created_at < v_end
     group by j.user_id
  ) d
  left join auth.users u        on u.id = d.user_id
  left join api.entitlements e  on e.user_id = d.user_id
  order by d.entries desc, d.last_at desc
  limit v_limit;
end;
$$;

-- ── Trailing daily series (the compare-across-days view) ─────────────────────
-- Ends ON p_end and walks backwards p_days days, so the console can chart "the
-- last two weeks up to whichever day is selected", not just up to today.
create or replace function api.admin_day_series(
  p_end  date,
  p_days int default 14,
  p_tz   text default 'UTC'
)
returns table (
  day         date,
  entries     bigint,
  writers     bigint,
  signups     bigint,
  reflections bigint
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
      where r.created_at >= b.s and r.created_at < b.e)
  from b
  order by b.day;
end;
$$;

revoke all on function api.admin_tz(text)                          from public;
revoke all on function api.admin_day_stats(date, text)             from public;
revoke all on function api.admin_top_writers(date, text, int)      from public;
revoke all on function api.admin_day_series(date, int, text)       from public;

grant execute on function api.admin_tz(text)                       to service_role;
grant execute on function api.admin_day_stats(date, text)          to service_role;
grant execute on function api.admin_top_writers(date, text, int)   to service_role;
grant execute on function api.admin_day_series(date, int, text)    to service_role;

-- The day-scoped scans above all filter on created_at; without these they are
-- sequential scans that get slower every day the tables grow.
create index if not exists journal_entries_created_at_idx on api.journal_entries (created_at);
create index if not exists reflections_created_at_idx     on api.reflections (created_at);
create index if not exists paywall_views_created_at_idx   on api.paywall_views (created_at);
