import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLingui } from '@lingui/react/macro';
import { scheduleMemoryNotifications, scheduleMemoryNotificationTest } from '@firebase-messaging';
import { useJournalEntries } from './useJournalEntries';
import { useSessionStore, usePeekStore } from '@/src/stores';

const HOUR_KEY = '@reflect/reminder_hour';
const MINUTE_KEY = '@reflect/reminder_minute';

// stg-only: fire a memory notification 15s after the app opens so the full
// schedule → tap → deep-link flow can be tested without waiting for 9am.
const NOTIF_TEST_MODE = process.env.EXPO_PUBLIC_ENV === 'stg';

const useMemoryNotification = () => {
  const router = useRouter();
  const { t } = useLingui();
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const { data: entries } = useJournalEntries();
  const pendingPeekEntryId = usePeekStore((s) => s.pendingPeekEntryId);
  const setPendingPeekEntryId = usePeekStore((s) => s.setPendingPeekEntryId);
  // The schedule effect re-runs on every entries refetch; only fire the test
  // notification once per app session so we don't queue a burst of them.
  const testScheduled = useRef(false);
  // Tracks notification responses already recorded so the cold-start lookup and
  // the live listener never stash the same tap twice.
  const handledResponseIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isAnonymous || !entries?.length) return;
    const schedule = async () => {
      const [hourStr, minuteStr] = await Promise.all([
        AsyncStorage.getItem(HOUR_KEY),
        AsyncStorage.getItem(MINUTE_KEY),
      ]);
      const hour = hourStr ? parseInt(hourStr, 10) : 9;
      const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
      scheduleMemoryNotifications(entries, t`Remember this?`, hour, minute);

      if (NOTIF_TEST_MODE && !testScheduled.current) {
        testScheduled.current = true;
        const testId = await scheduleMemoryNotificationTest(entries, t`Remember this?`);
        // TEMP stg diagnostic: surface the real on-device notification state so we
        // can see why iOS isn't delivering the test notification. Remove after.
        const perm = await ExpoNotifications.getPermissionsAsync();
        const scheduled = await ExpoNotifications.getAllScheduledNotificationsAsync();
        Alert.alert(
          'Notif diag (stg)',
          `env=${process.env.EXPO_PUBLIC_ENV}\n` +
            `perm.status=${perm.status}\n` +
            `ios.status=${perm.ios?.status ?? '-'}\n` +
            `entries=${entries.length} anon=${isAnonymous}\n` +
            `testId=${testId ? 'set' : 'null'}\n` +
            `scheduledCount=${scheduled.length}`,
        );
      }
    };
    schedule();
  }, [isAnonymous, entries, t]);

  // Record the tapped memory entry. We only stash the id here (not navigate),
  // because the tap can arrive while signed out — navigation must wait until the
  // user is authenticated and their entries have loaded (effect below).
  useEffect(() => {
    const handleResponse = (response: ExpoNotifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier } = response.notification.request;
      if (handledResponseIds.current.has(identifier)) return;

      const data = response.notification.request.content.data;
      if (data?.type === 'memory' && typeof data?.entryId === 'string') {
        handledResponseIds.current.add(identifier);
        setPendingPeekEntryId(data.entryId);
      }
    };

    // Cold start: the app was killed when the notification was tapped, so the
    // listener below never fires — recover the tap that launched the app.
    ExpoNotifications.getLastNotificationResponseAsync().then(handleResponse);

    // Foreground / background (app still in memory) taps.
    const sub = ExpoNotifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [setPendingPeekEntryId]);

  // Navigate to reflections once there's a pending memory AND the journal is
  // actually available (authenticated, entries loaded). This is what makes the
  // signed-out → sign-in → login flow work: the tap is remembered while on the
  // sign-in screen and replayed here after login. ReflectionsScreen opens the
  // peek modal and clears the pending id once it finds the entry.
  useEffect(() => {
    if (!pendingPeekEntryId || isAnonymous || !entries?.length) return;
    router.push('/(tabs)/reflections');
  }, [pendingPeekEntryId, isAnonymous, entries, router]);
};

export { useMemoryNotification };
