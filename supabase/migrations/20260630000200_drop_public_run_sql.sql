-- Remove a leftover admin/debug helper that was a critical hole on staging:
-- public.run_sql(text) was SECURITY DEFINER and EXECUTE-able by `anon`, and it
-- ran caller-supplied SQL with the definer's privileges (bypassing RLS). With
-- the public anon key, anyone could exfiltrate the entire database via
-- /rest/v1/rpc/run_sql. Nothing in the app references it.
--
-- Idempotent: it never existed on production, so this is a no-op there.
drop function if exists public.run_sql(text);
