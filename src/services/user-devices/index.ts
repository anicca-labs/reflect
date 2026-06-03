import { supabase } from '@/src/services/supabase'
import { getFCMToken } from '@/src/services/firebase-messaging'

const upsertDeviceToken = async (userId: string): Promise<void> => {
  const fcmToken = await getFCMToken()
  if (!fcmToken) return

  await supabase.from('device_tokens').upsert(
    { user_id: userId, fcm_token: fcmToken, updated_at: new Date().toISOString() },
    { onConflict: 'fcm_token' },
  )
}

const syncReminderToBackend = async (enabled: boolean, hour: number, minute: number): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const fcmToken = await getFCMToken()
  if (!fcmToken) return

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  await supabase.from('device_tokens').upsert(
    {
      user_id: user.id,
      fcm_token: fcmToken,
      reminder_hour: enabled ? hour : null,
      reminder_minute: enabled ? minute : null,
      timezone: enabled ? timezone : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fcm_token' },
  )
}

export { upsertDeviceToken, syncReminderToBackend }
