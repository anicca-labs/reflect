-- Growth funnel — install → activation → habit → paywall → paid (prod: orrcfftpaxlldolavipm).
-- Companion to reflect-stats.sql, which is a feature-adoption snapshot. This file is
-- the *funnel*: where users leak out, cohorted by signup date.
--
-- The demo/marketing account is excluded everywhere so it doesn't inflate the rates.
-- Usage: execute_sql returns only the LAST statement's rows — run one block at a time.

-- ── 0) Funnel snapshot ───────────────────────────────────────────────────────
with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id),
u as (select id, created_at, is_anonymous from auth.users where id <> (select id from demo))
select
  count(*)                                                                   as users_total,
  count(*) filter (where is_anonymous)                                       as anon_users,
  count(*) filter (where exists (select 1 from api.journal_entries j where j.user_id = u.id)) as activated_users,
  round(100.0 * count(*) filter (where exists (select 1 from api.journal_entries j where j.user_id = u.id))
        / nullif(count(*),0), 1)                                             as activation_pct,
  (select count(*) from api.journal_entries j where j.user_id <> (select id from demo)) as entries_total,
  (select count(*) from api.entitlements where is_pro)                       as pro_users,
  (select count(*) from api.paywall_views)                                   as paywall_views
from u;

-- ── 1) Retention by weeks-since-signup ───────────────────────────────────────
-- "Retained" = wrote >=1 entry in the window (the value action, not just an app open).
-- eligible_users guards against right-censoring: a user 3 days old CANNOT have a
-- day-15 entry, so counting them in the denominator would fake a retention drop.
-- with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id),
-- u as (select id, created_at from auth.users where id <> (select id from demo)),
-- w(label, lo, hi) as (values ('d0_signup_day',0,1),('w1_d1_7',1,8),('w2_d8_14',8,15),('w4_d15_30',15,31))
-- select w.label,
--   count(*) filter (where now() >= u.created_at + (w.hi||' days')::interval) as eligible_users,
--   count(*) filter (where now() >= u.created_at + (w.hi||' days')::interval
--                      and exists (select 1 from api.journal_entries j
--                                  where j.user_id=u.id
--                                    and j.created_at >= u.created_at + (w.lo||' days')::interval
--                                    and j.created_at <  u.created_at + (w.hi||' days')::interval)) as wrote,
--   round(100.0*count(*) filter (where now() >= u.created_at + (w.hi||' days')::interval
--                      and exists (select 1 from api.journal_entries j
--                                  where j.user_id=u.id
--                                    and j.created_at >= u.created_at + (w.lo||' days')::interval
--                                    and j.created_at <  u.created_at + (w.hi||' days')::interval))
--         / nullif(count(*) filter (where now() >= u.created_at + (w.hi||' days')::interval),0),1) as wrote_pct
-- from u cross join w group by w.label, w.lo order by w.lo;

-- ── 2) Guest-first before/after (2026-07-17) ─────────────────────────────────
-- NOT a controlled experiment: sequential cohorts, and the post-period is dominated
-- by an acquisition spike (49 of 94 users landed in the week of 2026-07-27), so the
-- channel mix differs between arms. Read as directional only.
-- with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id),
-- u as (select id, created_at,
--              case when created_at < timestamptz '2026-07-17' then 'A_pre' else 'B_post' end as cohort
--       from auth.users where id <> (select id from demo)),
-- act as (select u.id, u.cohort, u.created_at,
--                (select min(j.created_at) from api.journal_entries j where j.user_id=u.id) as first_entry_at,
--                (select count(*)          from api.journal_entries j where j.user_id=u.id) as entries
--         from u)
-- select cohort, count(*) as users,
--   round(100.0*count(*) filter (where first_entry_at is not null)/count(*),1)                    as activation_pct,
--   round(100.0*count(*) filter (where first_entry_at < created_at + interval '1 hour')/count(*),1) as act_1h_pct,
--   round(100.0*count(*) filter (where entries >= 2)/count(*),1)                                  as two_plus_pct,
--   round(avg(entries),2)                                                                         as avg_entries
-- from act group by cohort order by cohort;

-- ── 3) Weekly signups + activation (spots acquisition spikes) ────────────────
-- with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id)
-- select date_trunc('week', created_at)::date as week, count(*) as signups,
--   round(100.0*count(*) filter (where exists (
--     select 1 from api.journal_entries j where j.user_id = auth.users.id))/count(*),1) as act_pct
-- from auth.users where id <> (select id from demo) group by 1 order by 1;

-- ── 4) Paywall reach — do users ever hit the 7-entry free gate? ──────────────
-- The monetization gate can only convert users who reach it. If pct_reaching_gate is
-- ~0, the paywall's placement is the constraint, not its copy or its price.
-- with demo as (select 'e90cffc7-7fe7-4d5b-8095-097afa58c64a'::uuid as id),
-- per_user as (select u.id, (select count(*) from api.journal_entries j where j.user_id=u.id) as n
--              from auth.users u where u.id <> (select id from demo))
-- select count(*) as users,
--   count(*) filter (where n = 0)             as e0,
--   count(*) filter (where n = 1)             as e1,
--   count(*) filter (where n between 2 and 3) as e2_3,
--   count(*) filter (where n between 4 and 6) as e4_6,
--   count(*) filter (where n >= 7)            as reached_free_gate,
--   round(100.0*count(*) filter (where n >= 7)/count(*),1) as pct_reaching_gate
-- from per_user;

-- ── 5) Paywall view → purchase, by trigger source ────────────────────────────
-- Returns nothing until api.paywall_views ships to prod (currently stg-only).
-- Guest paywall views are a known blind spot — RLS requires auth.uid().
-- select pv.source,
--   count(*)                                            as views,
--   count(distinct pv.user_id)                          as viewers,
--   count(distinct pv.user_id) filter (where e.is_pro)  as converted,
--   round(100.0*count(distinct pv.user_id) filter (where e.is_pro)
--         / nullif(count(distinct pv.user_id),0),1)     as cvr_pct
-- from api.paywall_views pv
-- left join api.entitlements e on e.user_id = pv.user_id
-- group by pv.source order by views desc;

-- ── 6) Entitlement provenance — is the RevenueCat webhook actually firing? ───
-- All rows written by 'client_refresh' means no webhook-originated event has ever
-- landed in this environment. Purchase-side events (INITIAL_PURCHASE, RENEWAL,
-- CANCELLATION) should appear here once the webhook is live.
-- select event_type, count(*) as rows_, count(*) filter (where is_pro) as pro
-- from api.entitlements group by event_type order by rows_ desc;
