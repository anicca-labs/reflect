-- Let a signed-in user CLAIM an unowned (guest) device-token row.
--
-- The old single policy (auth.uid() = user_id for ALL commands) blocked this: when a
-- device signs out it becomes a guest row (user_id NULL, written by the service-role
-- register-device-token fn), and on sign-in the client upserts to attach user_id — but
-- Postgres requires the target row to be visible via the SELECT policy AND to pass the
-- UPDATE USING policy to update it, and both were auth.uid() = user_id, which is NULL
-- for a guest row → the upsert matched nothing and user_id stayed null.
--
-- Fix: per-command policies where SELECT + UPDATE also permit an unowned (NULL) row so
-- it can be claimed; WITH CHECK still guarantees the resulting row is owned by the
-- claimer. Tradeoff: an authenticated user can read guest rows (user_id NULL). Those
-- hold only an FCM token + locale + activity time — no user identity or content, and
-- the token is unusable without the server FCM credentials — so the exposure is low.
-- (A stricter alternative is to route the claim through a service-role edge function.)
DROP POLICY IF EXISTS "Users can manage their own device tokens" ON api.device_tokens;

CREATE POLICY "device_tokens_select_own" ON api.device_tokens
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "device_tokens_insert_own" ON api.device_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_tokens_update_own_or_claim" ON api.device_tokens
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_tokens_delete_own" ON api.device_tokens
  FOR DELETE USING (auth.uid() = user_id);
