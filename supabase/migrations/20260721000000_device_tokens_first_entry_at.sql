-- Activation signal: when this device wrote its FIRST journal entry.
--
-- Guests journal locally — their entries never reach api.journal_entries — so a guest
-- who activates is otherwise invisible server-side. This column is the only first-party
-- guest-activation signal, and because it lives on device_tokens it joins straight to
-- the rest of the engagement data, which is what re-engagement targeting needs
-- ("registered but never wrote" vs "wrote once and lapsed").
--
-- Stamped ONCE and never moved: every writer sets it only where first_entry_at is null,
-- so later entries can't overwrite the activation moment. Signed-in devices write it
-- directly (RLS: auth.uid() = user_id); guests have no session, so they go through the
-- register-device-token edge function (service role).
alter table api.device_tokens
  add column if not exists first_entry_at timestamptz;

comment on column api.device_tokens.first_entry_at is
  'When this device wrote its first journal entry (guest or signed-in). Set once, never updated. Guest entries stay on-device, so this is the only server-side guest-activation signal.';
