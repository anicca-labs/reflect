-- api.push_log: one row per server push actually sent.
--
-- Two jobs:
--
-- 1. VOLUME GOVERNANCE. There are now several independent push types (daily
--    reminder, streak-at-risk, Wednesday teaser, Sunday reflection, the reflective
--    "presence" line) and until now NOTHING coordinated them — each decided on its
--    own whether to fire, so a user could receive several in a day and no code
--    anywhere could tell. The presence push checks this table and stays silent if
--    the user already heard from us today.
--
-- 2. MEASUREMENT. "How many people actually receive this?" was previously
--    unanswerable; sends left no trace.
--
-- PRIVACY: metadata only. `kind` is a fixed enum-ish string, never message text and
-- never anything derived from a journal entry — the same rule as share_taps.
--
-- NOTE: local notifications (the guest daily reminder and "Remember this?") are
-- scheduled on-device and never reach the server, so they cannot be logged here and
-- the guard cannot see them. Server-side pushes only.
create table if not exists api.push_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- daily_reminder | streak_at_risk | weekly_teaser | weekly_reflection | reflective_line | admin
  kind text not null,
  -- The user's LOCAL date, passed in by the sender. Stored as a date so "did we
  -- already push today?" is a plain equality check and doesn't depend on the
  -- server's timezone.
  sent_on date not null,
  created_at timestamptz not null default now()
);

alter table api.push_log enable row level security;

-- Idempotency: the cron runs hourly and can retry, so the same (user, kind, day)
-- must not produce duplicate rows and must not make one send look like several.
create unique index if not exists push_log_user_kind_day_uniq
  on api.push_log (user_id, kind, sent_on);

-- The guard's query: "anything at all for this user today?"
create index if not exists push_log_user_day_idx on api.push_log (user_id, sent_on);
create index if not exists push_log_kind_day_idx on api.push_log (kind, sent_on);

-- Written only by the service role (edge functions). No client access at all: users
-- have no reason to read or write it, and RLS with no policy denies by default.
grant select, insert, update, delete on api.push_log to service_role;
grant usage, select on sequence api.push_log_id_seq to service_role;
