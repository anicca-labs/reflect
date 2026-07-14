import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import {
  getMessaging,
  onNotificationOpenedApp,
  getInitialNotification,
} from '@react-native-firebase/messaging';
import { getApp } from '@react-native-firebase/app';
import { useComposeStore, useAppLockStore } from '@/src/stores';

// Routes a tapped daily-reminder to the journal composer. Taps arrive on two channels:
//  • Guests get a LOCAL notification → expo-notifications' response listener.
//  • Signed-in users get an FCM server push → @react-native-firebase/messaging's
//    onNotificationOpenedApp (warm) / getInitialNotification (cold).
// Both carry data.type 'daily-reminder'.
//
// The tap only STASHES the intent (pendingCompose); navigating from inside the handler
// runs mid-resume and — for a signed-in user — behind the biometric-lock overlay, so it
// was getting swallowed. A separate effect performs the navigation once the app is
// actually usable (unlocked), which is what fixes the warm/background tap.
const useReminderNotification = () => {
  const router = useRouter();
  const setPendingCompose = useComposeStore((s) => s.setPendingCompose);
  const pendingCompose = useComposeStore((s) => s.pendingCompose);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const handledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const flagCompose = () => setPendingCompose(true);

    // Local notifications (guests) via expo-notifications.
    const handleExpoResponse = (response: ExpoNotifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier } = response.notification.request;
      if (handledIds.current.has(identifier)) return;
      if (response.notification.request.content.data?.type === 'daily-reminder') {
        handledIds.current.add(identifier);
        flagCompose();
      }
    };
    ExpoNotifications.getLastNotificationResponseAsync().then(handleExpoResponse);
    const expoSub = ExpoNotifications.addNotificationResponseReceivedListener(handleExpoResponse);

    // FCM server pushes (signed-in) via react-native-firebase.
    const messaging = getMessaging(getApp());
    const handleFcm = (message: { data?: { [key: string]: string | object } } | null) => {
      if (message?.data?.type === 'daily-reminder') flagCompose();
    };
    const fcmUnsub = onNotificationOpenedApp(messaging, handleFcm);
    getInitialNotification(messaging).then(handleFcm);

    return () => {
      expoSub.remove();
      fcmUnsub();
    };
  }, [setPendingCompose]);

  // Navigate to the Journal tab once there's a pending compose AND the app is unlocked.
  // Two things were eating the navigation on a warm/background tap:
  //  • the biometric-lock overlay for signed-in users (gated by isLocked here), and
  //  • navigating synchronously mid-resume, which the navigator swallows even without
  //    a lock (guests hit this) — so we defer a beat past the foreground transition.
  // JournalScreen then focuses the composer and clears pendingCompose. '/' targets the
  // Journal MaterialTopTab specifically.
  useEffect(() => {
    if (!pendingCompose || isLocked) return;
    const t = setTimeout(() => router.navigate('/'), 350);
    return () => clearTimeout(t);
  }, [pendingCompose, isLocked, router]);
};

export { useReminderNotification };
