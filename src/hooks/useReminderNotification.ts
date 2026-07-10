import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import { useComposeStore } from '@/src/stores';

// Routes a tapped daily-reminder notification straight to the journal composer, so
// the user lands ready to write instead of wherever the app happened to be. Mirrors
// useMemoryNotification: handles both cold-start (the tap launched the app, so the
// live listener never fires) and warm taps (app still in memory), de-duped by id.
// Journaling works for guests too, so — unlike the memory peek — there's nothing to
// gate on: switch to the journal tab and flag the composer to focus.
const useReminderNotification = () => {
  const router = useRouter();
  const setPendingCompose = useComposeStore((s) => s.setPendingCompose);
  const handledResponseIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleResponse = (response: ExpoNotifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier } = response.notification.request;
      if (handledResponseIds.current.has(identifier)) return;

      const data = response.notification.request.content.data;
      if (data?.type === 'daily-reminder') {
        handledResponseIds.current.add(identifier);
        setPendingCompose(true);
        router.navigate('/(tabs)');
      }
    };

    ExpoNotifications.getLastNotificationResponseAsync().then(handleResponse);
    const sub = ExpoNotifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [router, setPendingCompose]);
};

export { useReminderNotification };
