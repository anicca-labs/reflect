import { supabase } from '@/src/services/supabase';
import { getFCMToken } from '@/src/services/firebase-messaging';

const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'reflect-8e62d';

const upsertDeviceToken = async (userId: string): Promise<void> => {
  const fcmToken = await getFCMToken();
  if (!fcmToken) return;

  await supabase
    .from('device_tokens')
    .upsert(
      {
        user_id: userId,
        fcm_token: fcmToken,
        firebase_project_id: FIREBASE_PROJECT_ID,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fcm_token' },
    );
};

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

  await supabase.from('device_tokens').upsert(
    {
      user_id: user.id,
      fcm_token: fcmToken,
      firebase_project_id: FIREBASE_PROJECT_ID,
      reminder_hour: enabled ? hour : null,
      reminder_minute: enabled ? minute : null,
      timezone: enabled ? timezone : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fcm_token' },
  );
};

export { upsertDeviceToken, syncReminderToBackend };
