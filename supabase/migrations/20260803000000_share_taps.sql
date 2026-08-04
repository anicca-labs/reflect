-- api.share_taps: one row per Share tap, written by the client right before the
-- OS share sheet opens. Answers the only question that justifies building richer
-- sharing (image quote-cards, which need a native release): does anyone share at
-- all? Tapping Share is recorded, not completing it — the OS gives no reliable
-- "actually sent" signal on Android.
--
-- PRIVACY: metadata only. The shared preview is reflection CONTENT and must
-- never be written here — no text column exists, by design.
create table if not exists api.share_taps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- what was shared: reflection | entry
  source text not null default 'reflection',
  created_at timestamptz not null default now()
);

alter table api.share_taps enable row level security;

create index if not exists share_taps_created_idx on api.share_taps (created_at desc);
create index if not exists share_taps_user_idx on api.share_taps (user_id);

drop policy if exists share_taps_insert_own on api.share_taps;
create policy share_taps_insert_own on api.share_taps
  for insert with check (auth.uid() = user_id);

grant insert on api.share_taps to authenticated;
grant select, insert, update, delete on api.share_taps to service_role;
