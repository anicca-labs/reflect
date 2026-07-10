import { getMessaging, getToken, onMessage } from '@react-native-firebase/messaging';
import { getApp } from '@react-native-firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { JournalEntry } from '@/src/types/journal';

if (Platform.OS === 'android') {
  ExpoNotifications.setNotificationChannelAsync('default', {
    name: 'Reflect',
    importance: ExpoNotifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const messaging = getMessaging(getApp());

type NotificationPermissionStatus = 'undetermined' | 'granted' | 'denied';

const getNotificationPermissionStatus = async (): Promise<NotificationPermissionStatus> => {
  if (!Device.isDevice) return 'denied';
  const { status } = await ExpoNotifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
};

const requestNotificationPermission = async (): Promise<boolean> => {
  if (!Device.isDevice) return false;
  const { status } = await ExpoNotifications.requestPermissionsAsync();
  return status === 'granted';
};

const getFCMToken = async (): Promise<string | null> => {
  if (!Device.isDevice) return null;
  try {
    return await getToken(messaging);
  } catch (e) {
    console.warn('[FCM token] Failed to get token:', e);
    return null;
  }
};

const subscribeToForegroundMessages = (
  onMessageCallback: (title: string, body: string) => void,
): (() => void) =>
  onMessage(messaging, async (remoteMessage) => {
    onMessageCallback(
      remoteMessage.notification?.title ?? 'Reflect',
      remoteMessage.notification?.body ?? '',
    );
  });

const scheduleLocalNotification = async (title: string, body: string, delaySeconds = 3) => {
  await ExpoNotifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: ExpoNotifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
    },
  });
};

// Fixed identifier: scheduling with an existing identifier REPLACES it, so a
// re-schedule (re-arm on load, time change, rapid toggles) can never create a
// duplicate. REMINDER_NOTIF_ID_KEY is the retired random-id scheme, cleaned up below.
const REMINDER_NOTIF_ID = 'daily-reminder';
const REMINDER_NOTIF_ID_KEY = '@reflect/reminder_notif_id';
const REMINDER_BODY = "Time to jot down today's thoughts.";

// Cancel every reminder currently scheduled — the fixed-id one plus any orphans the
// old random-id scheme could leave behind (a race or a mid-schedule throw once left
// an untracked copy, which is why reminders fired twice). Memory notifications have
// different bodies, so they are untouched.
const clearScheduledReminders = async (): Promise<void> => {
  const scheduled = await ExpoNotifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier === REMINDER_NOTIF_ID || n.content?.body === REMINDER_BODY)
      .map((n) => ExpoNotifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  await AsyncStorage.removeItem(REMINDER_NOTIF_ID_KEY);
};

const scheduleDailyReminder = async (hour: number, minute: number): Promise<void> => {
  await clearScheduledReminders();
  await ExpoNotifications.scheduleNotificationAsync({
    identifier: REMINDER_NOTIF_ID,
    content: {
      title: 'Reflect',
      body: REMINDER_BODY,
      // Tapping the reminder routes straight to the journal composer (see
      // useReminderNotification) so the user lands ready to write.
      data: { type: 'daily-reminder' },
    },
    // DAILY repeats every day at hour:minute and works on both iOS and Android.
    // (CALENDAR is iOS-only — on Android it throws "Trigger of type: calendar is
    // not supported".)
    trigger: {
      type: ExpoNotifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
};

const cancelDailyReminder = async (): Promise<void> => {
  await clearScheduledReminders();
};

const MEMORY_NOTIF_IDS_KEY = '@reflect/memory_notif_ids';
const MEMORY_NOTIF_LAST_SCHEDULED_KEY = '@reflect/memory_notif_last_scheduled';

const buildMemoryPreview = (content: string): string =>
  content.length > 100 ? content.slice(0, 100) + '…' : content;

// Guards against concurrent invocations within the same JS runtime. The daily
// "already scheduled" check is a read-modify-write across many awaits, so without
// this lock two effect runs (e.g. back-to-back React Query refetches that produce
// new `entries` references) could both pass the guard and schedule 30 duplicate
// notifications each — the user would then receive the same memory twice per day.
let memorySchedulingInFlight: Promise<void> | null = null;

const scheduleMemoryNotifications = (
  entries: JournalEntry[],
  title: string,
  hour = 9,
  minute = 0,
): Promise<void> => {
  if (memorySchedulingInFlight) return memorySchedulingInFlight;

  memorySchedulingInFlight = (async () => {
    try {
      // Check the daily guard BEFORE cancelling, otherwise a repeat call on the
      // same day would wipe the already-scheduled notifications and then bail.
      const today = new Date().toDateString();
      const lastScheduled = await AsyncStorage.getItem(MEMORY_NOTIF_LAST_SCHEDULED_KEY);
      if (lastScheduled === today) return;

      const existingJson = await AsyncStorage.getItem(MEMORY_NOTIF_IDS_KEY);
      if (existingJson) {
        const ids: string[] = JSON.parse(existingJson);
        await Promise.all(
          ids.map((id) => ExpoNotifications.cancelScheduledNotificationAsync(id).catch(() => {})),
        );
      }

      const now = new Date();
      const minAgeMs = 30 * 24 * 60 * 60 * 1000;
      const oldEntries = entries.filter(
        (e) => now.getTime() - new Date(e.created_at).getTime() >= minAgeMs,
      );

      if (!oldEntries.length) return;

      // Mark the day as scheduled before the await-heavy loop so any call that
      // races in behind the in-flight lock still sees the guard and bails.
      await AsyncStorage.setItem(MEMORY_NOTIF_LAST_SCHEDULED_KEY, today);

      const shuffled = [...oldEntries].sort(() => Math.random() - 0.5);
      const ids: string[] = [];

      for (let daysAhead = 0; daysAhead < 30; daysAhead++) {
        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() + daysAhead);
        targetDate.setHours(hour, minute, 0, 0);
        if (targetDate <= now) continue;

        const entry = shuffled[daysAhead % shuffled.length];

        const id = await ExpoNotifications.scheduleNotificationAsync({
          content: {
            title,
            body: buildMemoryPreview(entry.content),
            data: { entryId: entry.id, type: 'memory' },
          },
          trigger: {
            type: ExpoNotifications.SchedulableTriggerInputTypes.DATE,
            date: targetDate,
          },
        });
        ids.push(id);
      }

      await AsyncStorage.setItem(MEMORY_NOTIF_IDS_KEY, JSON.stringify(ids));
    } finally {
      memorySchedulingInFlight = null;
    }
  })();

  return memorySchedulingInFlight;
};

export type { NotificationPermissionStatus };
export {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  getFCMToken,
  subscribeToForegroundMessages,
  scheduleLocalNotification,
  scheduleDailyReminder,
  cancelDailyReminder,
  scheduleMemoryNotifications,
};
