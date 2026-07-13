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

// Routes a tapped daily-reminder straight to the journal composer so the user lands
// ready to write. Delivery differs by account type, so taps arrive on two channels:
//  • Guests get a LOCAL notification → expo-notifications' response listener.
//  • Signed-in users get an FCM server push → @react-native-firebase/messaging's
//    onNotificationOpenedApp (warm) / getInitialNotification (cold).
// Both carry data.type 'daily-reminder'. Journaling works for guests too, so there's
// nothing to gate on — switch to the journal tab and flag the composer to focus.
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

    // FCM server pushes (signed-in) via react-native-firebase — these do NOT surface
    // through the expo-notifications listener above.
    const messaging = getMessaging(getApp());
    const handleFcm = (message: { data?: { [key: string]: string | object } } | null) => {
      if (message?.data?.type === 'daily-reminder') routeToComposer();
    };
    const fcmUnsub = onNotificationOpenedApp(messaging, handleFcm); // warm tap
    getInitialNotification(messaging).then(handleFcm); // cold-start tap

    return () => {
      expoSub.remove();
      fcmUnsub();
    };
  }, [router, setPendingCompose]);
};

export { useReminderNotification };
