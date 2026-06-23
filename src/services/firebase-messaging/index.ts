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
    shouldShowAlert: true,
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

const REMINDER_NOTIF_ID_KEY = '@reflect/reminder_notif_id';

const scheduleDailyReminder = async (hour: number, minute: number): Promise<void> => {
  const existingId = await AsyncStorage.getItem(REMINDER_NOTIF_ID_KEY);
  if (existingId) {
    await ExpoNotifications.cancelScheduledNotificationAsync(existingId);
  }

  const id = await ExpoNotifications.scheduleNotificationAsync({
    content: {
      title: 'Reflect',
      body: "Time to jot down today's thoughts.",
    },
    trigger: {
      type: ExpoNotifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  });

  await AsyncStorage.setItem(REMINDER_NOTIF_ID_KEY, id);
};

const cancelDailyReminder = async (): Promise<void> => {
  const id = await AsyncStorage.getItem(REMINDER_NOTIF_ID_KEY);
  if (id) {
    await ExpoNotifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(REMINDER_NOTIF_ID_KEY);
  }
};

const MEMORY_NOTIF_IDS_KEY = '@reflect/memory_notif_ids';
const MEMORY_NOTIF_LAST_SCHEDULED_KEY = '@reflect/memory_notif_last_scheduled';

const scheduleMemoryNotifications = async (
  entries: JournalEntry[],
  title: string,
  hour = 9,
  minute = 0,
): Promise<void> => {
  const existingJson = await AsyncStorage.getItem(MEMORY_NOTIF_IDS_KEY);
  if (existingJson) {
    const ids: string[] = JSON.parse(existingJson);
    await Promise.all(
      ids.map((id) => ExpoNotifications.cancelScheduledNotificationAsync(id).catch(() => {})),
    );
  }

  const today = new Date().toDateString();
  const lastScheduled = await AsyncStorage.getItem(MEMORY_NOTIF_LAST_SCHEDULED_KEY);
  if (lastScheduled === today) return;

  const now = new Date();
  const minAgeMs = 30 * 24 * 60 * 60 * 1000;
  const oldEntries = entries.filter(
    (e) => now.getTime() - new Date(e.created_at).getTime() >= minAgeMs,
  );

  if (!oldEntries.length) return;

  const shuffled = [...oldEntries].sort(() => Math.random() - 0.5);
  const ids: string[] = [];

  for (let daysAhead = 0; daysAhead < 30; daysAhead++) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysAhead);
    targetDate.setHours(hour, minute, 0, 0);
    if (targetDate <= now) continue;

    const entry = shuffled[daysAhead % shuffled.length];
    const preview = entry.content.length > 100 ? entry.content.slice(0, 100) + '…' : entry.content;

    const id = await ExpoNotifications.scheduleNotificationAsync({
      content: {
        title,
        body: preview,
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
  await AsyncStorage.setItem(MEMORY_NOTIF_LAST_SCHEDULED_KEY, today);
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
