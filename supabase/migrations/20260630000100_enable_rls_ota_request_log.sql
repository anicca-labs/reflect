-- Close the anon/authenticated exposure on the OTA debug log. The table is
-- written exclusively by the expo-update-manifest Edge Function via the service
-- role (which bypasses RLS), and no client-facing role reads it — so enabling
-- RLS with no policy locks it to service-role-only, which is the intent. OTA
-- delivery is unaffected (it reads api.expo_updates, which already runs with RLS
-- enabled the same way).
alter table api.ota_request_log enable row level security;
