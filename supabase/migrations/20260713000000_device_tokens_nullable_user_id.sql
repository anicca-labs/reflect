-- Guests are pure-local (no Supabase session) but can still grant notification
-- permission and hand us a push token. Allow storing a device token without a user
-- so we can reach guests with manual / re-engagement pushes (via admin-push).
--
-- Guest rows are written by the register-device-token edge function (service role,
-- bypassing RLS) with user_id NULL and reminder_* NULL — so the send-reminders cron,
-- which skips null-reminder rows, never touches them; their daily reminder stays
-- local. When a guest signs in, the authed upsert (keyed on fcm_token) attaches
-- their user_id to the same row.
ALTER TABLE api.device_tokens
  ALTER COLUMN user_id DROP NOT NULL;
