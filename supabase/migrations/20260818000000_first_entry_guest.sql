-- Split the activation signal into guests vs signed-in, and make the split STABLE.
--
-- device_tokens.user_id is filled in when a device's owner signs in, so asking
-- "was this a guest?" by reading user_id today gives a different answer than it gave
-- yesterday: a guest who activated on Monday and signed up on Tuesday silently moves
-- out of Monday's guest count. A dashboard whose history rewrites itself is a
-- dashboard you have to remember how to read.
--
-- So the answer is recorded once, at the moment it's true. first_entry_at is only
-- ever set by an UPDATE (both the signed-in path in src/services/user-devices and the
-- guest path through register-device-token deliberately update `where first_entry_at
-- is null`), so a trigger on that transition can stamp whether the device had an
-- account right then. No client change and no app release needed.
alter table api.device_tokens
  add column if not exists first_entry_guest boolean;

comment on column api.device_tokens.first_entry_guest is
  'Whether this device had NO account at the moment it wrote its first entry. Stamped once by the stamp_first_entry_guest trigger and never updated, so historical guest counts stay put when the owner later signs up. Rows predating the trigger were backfilled from user_id, which understates guests that had already converted.';

create or replace function api.stamp_first_entry_guest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only on the null → non-null transition of first_entry_at, and only if nothing has
  -- been stamped yet: re-registering a device must never restate its activation.
  if new.first_entry_at is not null
     and (tg_op = 'INSERT' or old.first_entry_at is null)
     and new.first_entry_guest is null then
    new.first_entry_guest := new.user_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_first_entry_guest on api.device_tokens;
create trigger stamp_first_entry_guest
  before insert or update on api.device_tokens
  for each row execute function api.stamp_first_entry_guest();

-- Backfill: the best available answer for rows that activated before the trigger
-- existed. Guests who have since signed up are counted as signed-in here — the one
-- place the history is approximate, and it stops being approximate from now on.
update api.device_tokens
   set first_entry_guest = (user_id is null)
 where first_entry_at is not null
   and first_entry_guest is null;

-- The day-scoped activation counts filter on this.
create index if not exists device_tokens_first_entry_at_idx
  on api.device_tokens (first_entry_at);
