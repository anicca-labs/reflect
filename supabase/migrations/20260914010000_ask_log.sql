-- api.ask_log: one row per ask-your-journal question answered. METADATA ONLY —
-- never the question, never the answer (same privacy rule as echo_log and
-- push_log). Counting rows enforces the free-ask limit (FREE_ASKS in
-- generate-reflection); Pro users log too, for usage visibility.
create table if not exists api.ask_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table api.ask_log enable row level security;

create index if not exists ask_log_user_idx on api.ask_log (user_id);
create index if not exists ask_log_created_idx on api.ask_log (created_at desc);

grant select, insert, delete on api.ask_log to service_role;
