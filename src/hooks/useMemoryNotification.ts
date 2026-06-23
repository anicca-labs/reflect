import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLingui } from '@lingui/react/macro';
import { scheduleMemoryNotifications } from '@firebase-messaging';
import { useJournalEntries } from './useJournalEntries';
import { useSessionStore, usePeekStore } from '@/src/stores';

const HOUR_KEY = '@reflect/reminder_hour';
const MINUTE_KEY = '@reflect/reminder_minute';

const useMemoryNotification = () => {
  const router = useRouter();
  const { t } = useLingui();
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const { data: entries } = useJournalEntries();
  const setPendingPeekEntryId = usePeekStore((s) => s.setPendingPeekEntryId);

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
    };
    schedule();
  }, [isAnonymous, entries, t]);

  useEffect(() => {
    const sub = ExpoNotifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'memory' && typeof data?.entryId === 'string') {
        setPendingPeekEntryId(data.entryId);
        router.push('/(tabs)/reflections');
      }
    });
    return () => sub.remove();
  }, [router, setPendingPeekEntryId]);
};

export { useMemoryNotification };
