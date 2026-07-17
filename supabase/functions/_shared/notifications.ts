// Routing contract for push notifications. A notification whose `data.type` equals
// REMINDER_DATA_TYPE opens the journal composer when tapped (handled client-side in
// src/hooks/useReminderNotification). Set by every "go write" push: the send-reminders
// cron and admin re-engagement pushes.
//
// Mirror of REMINDER_DATA_TYPE in src/services/firebase-messaging — the app (React
// Native) and these edge functions (Deno) can't share a module, so keep the string in
// sync across both.
export const REMINDER_DATA_TYPE = 'daily-reminder';
