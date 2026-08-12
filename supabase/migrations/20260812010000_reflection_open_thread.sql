-- Follow-up on an unresolved worry: "something seemed to be sitting with you — how's
-- it going?", a few days after the reflection that noticed it.
--
-- WHAT IS STORED, AND WHAT DELIBERATELY IS NOT
--
-- Only a classification and a timestamp. No topic, no summary, no phrase, nothing
-- derived from the entry text beyond a single enum. The obvious design — store "job
-- interview" so the follow-up can name it — is rejected on purpose:
--
--   * A notification naming the worry is readable on a LOCK SCREEN by anyone holding
--     the phone. This feature selects for the most sensitive entries a person has,
--     then broadcasts them outside the device. "How's it going with the diagnosis?"
--     in front of the wrong person is a real harm, and we already shipped one leak of
--     this shape (memory notifications replaying entry text after sign-out).
--   * It would create a new class of plaintext sensitive data. Entries are encrypted;
--     an extracted "worry" column would not be.
--
-- So the push is content-free and the same for everyone. Specificity, if ever wanted,
-- belongs behind the biometric lock — never in a notification.
--
-- open_thread values:
--   'none'      — nothing unresolved worth revisiting (the default; no follow-up)
--   'thread'    — an ordinary worry still in motion. THE ONLY VALUE THAT FOLLOWS UP.
--   'sensitive' — acute distress, crisis, grief, self-harm signals. NEVER followed up
--                 automatically. An upbeat "how's it going?" aimed at someone in
--                 crisis is worse than silence, and a scheduled check-in is not a
--                 substitute for the crisis guidance already in the reflection prompt.
alter table api.reflections
  add column if not exists open_thread text not null default 'none',
  add column if not exists followup_sent_at timestamptz;

alter table api.reflections
  drop constraint if exists reflections_open_thread_check;
alter table api.reflections
  add constraint reflections_open_thread_check
  check (open_thread in ('none', 'thread', 'sensitive'));

-- The sender's lookup: unfollowed-up 'thread' reflections past the delay.
create index if not exists reflections_followup_idx
  on api.reflections (open_thread, followup_sent_at)
  where open_thread = 'thread' and followup_sent_at is null;
