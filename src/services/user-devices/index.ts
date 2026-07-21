import { i18n } from '@lingui/core';
import { supabase } from '@/src/services/supabase';
import { getFCMToken } from '@/src/services/firebase-messaging';

const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'reflect-8e62d';

// Signed-in: authed upsert (RLS: auth.uid() = user_id). Stamps last_active_at so any
// call doubles as an activity ping for re-engagement targeting.
const upsertDeviceToken = async (userId: string): Promise<void> => {
  const fcmToken = await getFCMToken();
  if (!fcmToken) return;

  const now = new Date().toISOString();
  // Stamp timezone on every sync (not just when a reminder is set) so re-engagement
  // winbacks can be timed to the user's local evening for the whole base.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await supabase.from('device_tokens').upsert(
    {
      user_id: userId,
      fcm_token: fcmToken,
      firebase_project_id: FIREBASE_PROJECT_ID,
      locale: i18n.locale,
      timezone,
      updated_at: now,
      last_active_at: now,
    },
    { onConflict: 'fcm_token' },
  );
};

// Signed-in reminder → server delivery (the cron reads reminder_hour). Also records
// reminder_enabled (targeting) and stamps activity.
const syncReminderToBackend = async (
  enabled: boolean,
  hour: number,
  minute: number,
): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const fcmToken = await getFCMToken();
  if (!fcmToken) return;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date().toISOString();
  await supabase.from('device_tokens').upsert(
    {
      user_id: user.id,
      fcm_token: fcmToken,
      firebase_project_id: FIREBASE_PROJECT_ID,
      reminder_enabled: enabled,
      reminder_hour: enabled ? hour : null,
      reminder_minute: enabled ? minute : null,
      // Keep timezone even when the reminder is off — the daily-reminder cron gates on
      // reminder_hour (null when off) so it stays excluded, but re-engagement winbacks
      // still need the tz to send at a sane local hour.
      timezone,
      locale: i18n.locale,
      updated_at: now,
      last_active_at: now,
    },
    { onConflict: 'fcm_token' },
  );
};

// Pure-local guests have no Supabase session, so RLS blocks a direct write — they
// register via the public edge function (service role). Stored with user_id +
// reminder_* null so the send-reminders cron skips them (their reminder is local);
// the row exists for admin-push re-engagement. reminderEnabled records the (locally
// delivered) on/off state for targeting; the function also stamps last_active_at.
const registerGuestDeviceToken = async (reminderEnabled?: boolean): Promise<void> => {
  const fcmToken = await getFCMToken();
  if (!fcmToken) return;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await supabase.functions.invoke('register-device-token', {
    body: {
      fcmToken,
      firebaseProjectId: FIREBASE_PROJECT_ID,
      locale: i18n.locale,
      timezone,
      ...(typeof reminderEnabled === 'boolean' ? { reminderEnabled } : {}),
    },
  });
};

// Activation signal: stamp the moment this device writes its FIRST entry. Guests
// journal locally (their entries never reach journal_entries), so without this a guest
// who activates is invisible server-side — and activation is the metric that matters.
// Written once: both paths update only where first_entry_at is null, so later entries
// never move it. Fire-and-forget — a failure here must never affect saving an entry.
//
// Uses getSession() (local, no network) rather than getUser(): getUser() round-trips
// and can return null when offline, which would misroute a signed-in user down the
// guest path and detach their token's user_id.
const markFirstEntryWritten = async (): Promise<void> => {
  const fcmToken = await getFCMToken();
  if (!fcmToken) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    await supabase
      .from('device_tokens')
      .update({ first_entry_at: new Date().toISOString() })
      .eq('fcm_token', fcmToken)
      .is('first_entry_at', null);
    return;
  }

  // Guests have no session, so RLS blocks the direct write — go through the
  // service-role edge function, same as registerGuestDeviceToken.
  await supabase.functions.invoke('register-device-token', {
    body: { fcmToken, firebaseProjectId: FIREBASE_PROJECT_ID, markFirstEntry: true },
  });
};

// Capture/refresh this device's push token for the current account type, stamping
// last_active_at. Doubles as the activity ping — safe to call on notification-
// permission grant and on app foreground.
const captureDeviceToken = async (): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await upsertDeviceToken(user.id);
  else await registerGuestDeviceToken();
};

export {
  upsertDeviceToken,
  syncReminderToBackend,
  registerGuestDeviceToken,
  captureDeviceToken,
  markFirstEntryWritten,
};
