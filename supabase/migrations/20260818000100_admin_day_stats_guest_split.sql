-- admin_day_stats: report guest and signed-in activations separately.
--
-- The combined "device activations" number answered a question nobody asks. What the
-- console wants to show is "how many guests started writing" next to "how many people
-- signed up", with no mental arithmetic and no footnote. Both are emitted; the
-- combined total stays in the payload for anyone querying the API directly.
create or replace function api.admin_day_stats(p_day date, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text := api.admin_tz(p_tz);
  v_start timestamptz;
  v_end   timestamptz;
begin
  v_start := (p_day::timestamp) at time zone v_tz;
  v_end   := ((p_day + 1)::timestamp) at time zone v_tz;

  return jsonb_build_object(
    'day',  p_day,
    'tz',   v_tz,
    'from', v_start,
    'to',   v_end,

    -- Writing (signed-in accounts: guest entries never reach the server)
    'entries', (
      select count(*) from api.journal_entries j
       where j.created_at >= v_start and j.created_at < v_end),
    'writers', (
      select count(distinct j.user_id) from api.journal_entries j
       where j.created_at >= v_start and j.created_at < v_end),
    'new_writers', (
      select count(*) from (
        select j.user_id, min(j.created_at) as first_at
          from api.journal_entries j group by j.user_id
      ) t where t.first_at >= v_start and t.first_at < v_end),

    -- Activation, split at the moment it happened (api.device_tokens.first_entry_guest).
    -- coalesce keeps any row the trigger somehow missed out of the wrong bucket.
    'guest_activations', (
      select count(*) from api.device_tokens d
       where d.first_entry_at >= v_start and d.first_entry_at < v_end
         and coalesce(d.first_entry_guest, d.user_id is null)),
    'signed_in_activations', (
      select count(*) from api.device_tokens d
       where d.first_entry_at >= v_start and d.first_entry_at < v_end
         and not coalesce(d.first_entry_guest, d.user_id is null)),
    'device_activations', (
      select count(*) from api.device_tokens d
       where d.first_entry_at >= v_start and d.first_entry_at < v_end),

    -- Growth
    'signups', (
      select count(*) from auth.users u
       where u.created_at >= v_start and u.created_at < v_end),
    'pro_events', (
      select count(*) from api.entitlements e
       where e.is_pro and e.updated_at >= v_start and e.updated_at < v_end),
    'paywall_views', (
      select count(*) from api.paywall_views p
       where p.created_at >= v_start and p.created_at < v_end),

    -- AI reflections
    'reflections', (
      select count(*) from api.reflections r
       where r.created_at >= v_start and r.created_at < v_end),
    'reflections_seen', (
      select count(*) from api.reflections r
       where r.seen_at >= v_start and r.seen_at < v_end),
    'feedback_yes', (
      select count(*) from api.reflection_feedback f
       where f.felt_true and f.created_at >= v_start and f.created_at < v_end),
    'feedback_no', (
      select count(*) from api.reflection_feedback f
       where not f.felt_true and f.created_at >= v_start and f.created_at < v_end),
    'echoes', (
      select count(*) from api.echo_log e
       where e.created_at >= v_start and e.created_at < v_end),
    'share_taps', (
      select count(*) from api.share_taps s
       where s.created_at >= v_start and s.created_at < v_end),

    -- Push. sent_on is the RECIPIENT's local date (see api.push_log), so this is
    -- deliberately a date match and not a timestamp range.
    'pushes', (
      select count(*) from api.push_log l where l.sent_on = p_day),
    'pushes_by_kind', coalesce((
      select jsonb_object_agg(k.kind, k.n) from (
        select l.kind, count(*) as n from api.push_log l
         where l.sent_on = p_day group by l.kind
      ) k), '{}'::jsonb),

    -- Running totals, as of now (not day-scoped) — context for the day's numbers.
    'totals', jsonb_build_object(
      'users',       (select count(*) from auth.users),
      'entries',     (select count(*) from api.journal_entries),
      'writers',     (select count(distinct j.user_id) from api.journal_entries j),
      'devices',     (select count(*) from api.device_tokens),
      'guests',      (select count(*) from api.device_tokens d where d.user_id is null),
      'pro',         (select count(*) from api.entitlements e where e.is_pro),
      'reflections', (select count(*) from api.reflections),
      'ai_opted_in', (select count(*) from api.user_settings s where s.ai_reflections_enabled)
    )
  );
end;
$$;

revoke all on function api.admin_day_stats(date, text)    from public;
grant execute on function api.admin_day_stats(date, text) to service_role;
