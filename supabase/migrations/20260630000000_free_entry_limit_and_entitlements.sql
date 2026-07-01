-- Server-side enforcement of the free-plan journal entry limit.
--
-- The client already gates this (JournalScreen), but a determined user could
-- insert straight through PostgREST. This makes the limit authoritative:
-- a non-Pro user may hold at most FREE_ENTRY_LIMIT entries; Pro users are
-- unlimited.
--
-- "Pro" is unknowable to the database on its own (it lives in RevenueCat), so a
-- companion `revenuecat-webhook` Edge Function mirrors each user's entitlement
-- into api.entitlements. The trigger reads that table.

-- ---------------------------------------------------------------------------
-- Entitlement mirror. One row per user; written ONLY by the service role (via
-- the webhook). Users may read their own row but never write it.
-- ---------------------------------------------------------------------------
create table if not exists api.entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  is_pro     boolean not null default false,
  -- null while is_pro = true means a lifetime/non-expiring grant.
  expires_at timestamptz,
  event_type text,
  updated_at timestamptz not null default now()
);

alter table api.entitlements enable row level security;

-- Tables in the `api` schema need explicit role grants (unlike `public`). The
-- webhook writes as service_role; authenticated users only read their own row
-- (gated further by the RLS policy below). No write grant for authenticated.
grant select, insert, update, delete on api.entitlements to service_role;
grant select on api.entitlements to authenticated;

-- Readable by its owner (handy for debugging / future client use). No write
-- policies → authenticated users cannot insert/update/delete; the service role
-- bypasses RLS and is the sole writer.
drop policy if exists "users read own entitlement" on api.entitlements;
create policy "users read own entitlement"
  on api.entitlements
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Limit enforcement.
-- ---------------------------------------------------------------------------
create or replace function api.enforce_free_entry_limit()
  returns trigger
  language plpgsql
  -- SECURITY DEFINER so the count sees ALL of the user's rows regardless of the
  -- caller's RLS, and so it can read api.entitlements (no user read needed).
  security definer
  set search_path = api, pg_catalog
as $$
declare
  free_entry_limit constant integer := 7;
  is_pro_active boolean;
  entry_count integer;
begin
  select e.is_pro and (e.expires_at is null or e.expires_at > now())
    into is_pro_active
    from api.entitlements e
   where e.user_id = new.user_id;

  -- Active Pro entitlement: unlimited.
  if coalesce(is_pro_active, false) then
    return new;
  end if;

  select count(*) into entry_count
    from api.journal_entries
   where user_id = new.user_id;

  if entry_count >= free_entry_limit then
    raise exception 'free_entry_limit_reached'
      using hint = 'Upgrade to Pro to add more entries.';
  end if;

  return new;
end;
$$;

-- This is a trigger function and is never meant to be called directly. The
-- trigger fires it regardless of EXECUTE grants, so revoke the default public
-- EXECUTE — otherwise, living in the PostgREST-exposed `api` schema, it would be
-- callable as a SECURITY DEFINER RPC by anon/authenticated.
revoke execute on function api.enforce_free_entry_limit() from public;

-- BEFORE INSERT only: re-syncs from the offline outbox arrive as upserts that
-- resolve to UPDATE on conflict, which must not be blocked. New inserts are
-- what the limit governs.
drop trigger if exists enforce_free_entry_limit on api.journal_entries;
create trigger enforce_free_entry_limit
  before insert on api.journal_entries
  for each row
  execute function api.enforce_free_entry_limit();
