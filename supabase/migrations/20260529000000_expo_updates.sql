-- Storage bucket for OTA update bundles and assets (public so devices can download directly)
insert into storage.buckets (id, name, public)
values ('expo-updates', 'expo-updates', true)
on conflict (id) do nothing;

-- Allow anyone to read from the bucket (devices download bundles without auth)
create policy "Public read access"
  on storage.objects for select
  using (bucket_id = 'expo-updates');

create table api.expo_updates (
  id uuid primary key,
  channel text not null,
  platform text not null check (platform in ('ios', 'android')),
  runtime_version text not null,
  created_at timestamptz not null default now(),
  launch_asset jsonb not null,
  assets jsonb not null default '[]',
  extra jsonb not null default '{}',
  active boolean not null default true
);

alter table api.expo_updates enable row level security;

-- Only service_role (CI upload script) can write; no direct client access needed
grant select, insert, update on api.expo_updates to service_role;

create index expo_updates_lookup_idx
  on api.expo_updates (channel, platform, runtime_version, created_at desc)
  where active = true;
