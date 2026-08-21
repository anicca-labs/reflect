-- Raise the free entry limit 7 → 30.
--
-- Seven is reachable in one week of daily use, and the paywall data says that's
-- exactly what happened: every engaged multi-day writer who reached the wall
-- (kitter1022, cumbiakush ×2 in one day, miss.cnelson87's pre-cancelled trial)
-- produced zero revenue, and four of six cap-reachers stopped writing entirely.
-- The wall was interrupting the habit it was supposed to monetize. At 30, a
-- daily writer meets it after a month — with the habit formed and ~4 Sunday
-- reflections received, so the Pro pitch lands on someone who knows what it's
-- for.
--
-- Keep in sync with FREE_ENTRY_LIMIT in JournalScreen, AnonMergeModal and
-- useAuthSession (client UX layer; this trigger stays the authoritative gate).
create or replace function api.enforce_free_entry_limit()
  returns trigger
  language plpgsql
  security definer
  set search_path = api, pg_catalog
as $$
declare
  free_entry_limit constant integer := 30;
  is_pro_active boolean;
  entry_count integer;
begin
  -- Idempotent outbox re-syncs arrive as upserts; a BEFORE INSERT trigger fires
  -- before conflict resolution, so skip the check when the id already exists.
  if exists (select 1 from api.journal_entries where id = new.id) then
    return new;
  end if;

  select e.is_pro and (e.expires_at is null or e.expires_at > now())
    into is_pro_active
    from api.entitlements e
   where e.user_id = new.user_id;

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

revoke execute on function api.enforce_free_entry_limit() from public;
