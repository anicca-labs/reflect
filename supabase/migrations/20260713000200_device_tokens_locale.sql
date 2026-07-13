-- Store the device's active app language (normalized to a supported locale: en, es,
-- pt-BR, fr, id, ar) so server push can be sent in the user's language. The daily
-- reminder is a fixed string, so send-reminders picks the translation from a static
-- map by this locale (English fallback) — no per-notification translation needed.
-- Dynamic (marketing) pushes can instead translate their custom text once per locale.
ALTER TABLE api.device_tokens
  ADD COLUMN IF NOT EXISTS locale TEXT;
