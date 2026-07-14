import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import {
  getMessaging,
  onNotificationOpenedApp,
  getInitialNotification,
} from '@react-native-firebase/messaging';
import { getApp } from '@react-native-firebase/app';
import { useComposeStore } from '@/src/stores';

// Routes a tapped daily-reminder straight to the journal composer. Taps arrive on two
// channels: guests get a LOCAL notification (expo-notifications' response listener),
// signed-in users get an FCM server push (@react-native-firebase/messaging's
// onNotificationOpenedApp warm / getInitialNotification cold). Both carry data.type
// 'daily-reminder'. Navigate inline in the handler (the approach that worked for the
// local reminder) + flag the composer to focus once the Journal tab is active.
const useReminderNotification = () => {
  const router = useRouter();
  const setPendingCompose = useComposeStore((s) => s.setPendingCompose);
  const handledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const routeToComposer = () => {
      setPendingCompose(true);
      router.navigate('/(tabs)');
    };

    // Local notifications (guests) via expo-notifications.
    const handleExpoResponse = (response: ExpoNotifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier } = response.notification.request;
      if (handledIds.current.has(identifier)) return;
      if (response.notification.request.content.data?.type === 'daily-reminder') {
        handledIds.current.add(identifier);
        routeToComposer();
      }
    };
    ExpoNotifications.getLastNotificationResponseAsync().then(handleExpoResponse);
    const expoSub = ExpoNotifications.addNotificationResponseReceivedListener(handleExpoResponse);

    // FCM server pushes (signed-in) via react-native-firebase.
    const messaging = getMessaging(getApp());
    const handleFcm = (message: { data?: { [key: string]: string | object } } | null) => {
      if (message?.data?.type === 'daily-reminder') routeToComposer();
    };
    const fcmUnsub = onNotificationOpenedApp(messaging, handleFcm);
    getInitialNotification(messaging).then(handleFcm);

    return () => {
      expoSub.remove();
      fcmUnsub();
    };
  }, [router, setPendingCompose]);
};

export { useReminderNotification };
