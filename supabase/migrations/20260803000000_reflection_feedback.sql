-- One-tap quality signal on weekly reflections ("Did this feel true to your
-- week?"). Deliberately a bare boolean — no free text — so the metric stays
-- completely content-free (nothing journal-adjacent ever lands here).
create table if not exists api.reflection_feedback (
  reflection_id uuid primary key references api.reflections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  felt_true boolean not null,
  created_at timestamptz not null default now()
);

alter table api.reflection_feedback enable row level security;

create index if not exists reflection_feedback_created_idx
  on api.reflection_feedback (created_at desc);

drop policy if exists reflection_feedback_own on api.reflection_feedback;
create policy reflection_feedback_own on api.reflection_feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on api.reflection_feedback to authenticated;
grant select, insert, update, delete on api.reflection_feedback to service_role;
