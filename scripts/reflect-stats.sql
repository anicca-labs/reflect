-- AI Weekly Reflections — adoption dashboard (prod: orrcfftpaxlldolavipm).
-- Run via the Supabase MCP execute_sql, or the SQL editor. The demo/marketing
-- account (marianoksairi@gmail.com) is excluded from the "real" columns so it
-- doesn't inflate opt-ins / reflections.
--
-- Usage note: execute_sql returns only the LAST statement's rows, so run the two
-- queries below separately (or comment one out).

-- ── 1) Single-row snapshot ───────────────────────────────────────────────────
with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id)
select
  (select count(*) from auth.users)                                                          as users_total,
  (select count(*) from auth.users where created_at >= now() - interval '24 hours')          as users_24h,
  (select count(*) from auth.users where created_at >= now() - interval '7 days')            as users_7d,
  (select count(*) from api.journal_entries where created_at >= now() - interval '24 hours') as entries_24h,
  -- feature adoption (real users only)
  (select count(*) from api.user_settings
     where ai_reflections_enabled and user_id <> (select id from demo))                      as optedin_real,
  (select count(distinct user_id) from api.reflections
     where user_id <> (select id from demo))                                                 as users_with_reflection,
  (select count(*) from api.reflections where user_id <> (select id from demo))              as reflections_real,
  (select count(*) from api.reflections
     where created_at >= now() - interval '24 hours' and user_id <> (select id from demo))   as reflections_24h,
  (select count(*) from api.entitlements where is_pro)                                        as pro_users;

-- ── 2) Daily trend (last 14 days): signups, entries, reflections ─────────────
-- with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id)
-- select d::date as day,
--   (select count(*) from auth.users u where u.created_at::date = d::date)                    as signups,
--   (select count(*) from api.journal_entries j where j.created_at::date = d::date)           as entries,
--   (select count(*) from api.reflections r
--      where r.created_at::date = d::date and r.user_id <> (select id from demo))             as reflections
-- from generate_series(now() - interval '13 days', now(), interval '1 day') d
-- order by day desc;
