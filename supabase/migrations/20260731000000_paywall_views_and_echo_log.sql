-- Funnel instrumentation.
--
-- api.paywall_views: one row per paywall presentation, written by the client
-- right before RevenueCatUI presents. Lets us measure paywall reach and identify
-- "bouncers" (viewed but never purchased — join against api.entitlements) for
-- precisely-targeted offers instead of broadcast pushes. Guests can't write here
-- (no auth.uid()); their paywall views are a known blind spot.
create table if not exists api.paywall_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- where the paywall was triggered from: entry-limit | reflection-limit |
  -- settings | merge | pro-intent | unknown
  source text not null default 'unknown',
  created_at timestamptz not null default now()
);

alter table api.paywall_views enable row level security;

create index if not exists paywall_views_created_idx on api.paywall_views (created_at desc);
create index if not exists paywall_views_user_idx on api.paywall_views (user_id);

drop policy if exists paywall_views_insert_own on api.paywall_views;
create policy paywall_views_insert_own on api.paywall_views
  for insert with check (auth.uid() = user_id);

grant insert on api.paywall_views to authenticated;
grant select, insert, update, delete on api.paywall_views to service_role;

-- api.echo_log: one row per entry-echo served (written by the generate-reflection
-- edge function, service role only). Purely a metric — echo text itself is never
-- stored anywhere.
create table if not exists api.echo_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table api.echo_log enable row level security;

create index if not exists echo_log_created_idx on api.echo_log (created_at desc);

grant select, insert, update, delete on api.echo_log to service_role;
