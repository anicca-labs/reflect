-- AI Weekly Reflections.
--
-- api.reflections: one generated reflection per user per period. `content` is
-- encrypted at rest in the SAME scheme as journal_entries (enc:v1: + base64(IV‖CTR
-- ciphertext), AES-256-CTR) so the client decrypts it with the existing crypto
-- service and the operator never stores plaintext. The generate-reflection edge
-- function (service role) is the only writer; users read their own rows.
create table if not exists api.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz,
  period_end timestamptz,
  entry_count int not null default 0,
  content text not null, -- encrypted (enc:v1:…)
  model text,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

alter table api.reflections enable row level security;

create index if not exists reflections_user_created_idx
  on api.reflections (user_id, created_at desc);

-- Read + mark-seen (update) own rows. Inserts are service-role only (the edge fn).
drop policy if exists reflections_select_own on api.reflections;
create policy reflections_select_own on api.reflections
  for select using (auth.uid() = user_id);
drop policy if exists reflections_update_own on api.reflections;
create policy reflections_update_own on api.reflections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, update on api.reflections to authenticated;
grant select, insert, update, delete on api.reflections to service_role;

-- Per-user, account-level AI opt-in (consent). Reflections are only generated for
-- users who have opted in; ai_consent_at records when they agreed.
create table if not exists api.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_reflections_enabled boolean not null default false,
  ai_consent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table api.user_settings enable row level security;

drop policy if exists user_settings_select_own on api.user_settings;
create policy user_settings_select_own on api.user_settings
  for select using (auth.uid() = user_id);
drop policy if exists user_settings_insert_own on api.user_settings;
create policy user_settings_insert_own on api.user_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists user_settings_update_own on api.user_settings;
create policy user_settings_update_own on api.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on api.user_settings to authenticated;
grant select, insert, update, delete on api.user_settings to service_role;
