-- Retention pruning (scripts/prune-ota-updates.mjs) runs as service_role and must be able
-- to remove rows for superseded OTA updates. The original grant covered select/insert/update
-- but not delete, so the prune failed with "permission denied for table expo_updates".
grant delete on api.expo_updates to service_role;
