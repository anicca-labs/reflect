-- Signals for smart re-engagement targeting (so win-back pushes aren't spammy):
--   reminder_enabled — whether the user has the daily reminder ON. Recorded for
--     guests too (whose reminder is local, so reminder_hour stays null) via the
--     register-device-token edge function. Lets a future "come back and journal"
--     campaign EXCLUDE people already being nudged daily; a coupon/promo ignores it.
--   last_active_at   — last time the app was foregrounded (debounced ~daily). The
--     primary recency signal for "haven't opened in N days -> bring them back".
ALTER TABLE api.device_tokens
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
