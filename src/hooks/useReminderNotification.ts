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

// Sends a tapped daily-reminder to the journal composer. Mirrors useMemoryNotification
// (the proven notification→tab pattern in this app): STASH the tap in the handler, and
// NAVIGATE from a separate effect. Navigating inline from the notification callback (as
// the app resumes) is unreliable — the tab switch gets swallowed — which is why taps did
// "nothing". Taps arrive on two channels: guests get a LOCAL notification
// (expo-notifications' response listener), signed-in users get an FCM server push
// (@react-native-firebase/messaging). Both carry data.type 'daily-reminder'.
const useReminderNotification = () => {
  const router = useRouter();
  const pendingCompose = useComposeStore((s) => s.pendingCompose);
  const setPendingCompose = useComposeStore((s) => s.setPendingCompose);
  // Tracks notification responses already recorded so the cold-start lookup and the
  // live listener never stash the same tap twice.
  const handledIds = useRef<Set<string>>(new Set());

  // Record the tap only (don't navigate here — see the effect below).
  useEffect(() => {
    // Local notifications (guests) via expo-notifications.
    const handleExpoResponse = (response: ExpoNotifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier } = response.notification.request;
      if (handledIds.current.has(identifier)) return;
      if (response.notification.request.content.data?.type === 'daily-reminder') {
        handledIds.current.add(identifier);
        setPendingCompose(true);
      }
    };
    // Cold start: the app was killed when tapped, so the listener never fires — recover
    // the tap that launched the app.
    ExpoNotifications.getLastNotificationResponseAsync().then(handleExpoResponse);
    // Foreground / background (app still in memory) taps.
    const expoSub = ExpoNotifications.addNotificationResponseReceivedListener(handleExpoResponse);

    // FCM server pushes (signed-in) via react-native-firebase.
    const messaging = getMessaging(getApp());
    const handleFcm = (message: { data?: { [key: string]: string | object } } | null) => {
      if (message?.data?.type === 'daily-reminder') setPendingCompose(true);
    };
    const fcmUnsub = onNotificationOpenedApp(messaging, handleFcm);
    getInitialNotification(messaging).then(handleFcm);

    return () => {
      expoSub.remove();
      fcmUnsub();
    };
  }, [setPendingCompose]);

  // Switch to the Journal tab once a reminder tap is pending. '/' resolves to
  // (tabs)/index — the same target SettingsScreen uses to return to the journal.
  //
  // The navigate MUST stay synchronous: JournalScreen clears pendingCompose the moment
  // it focuses the composer, which re-runs this effect — so any deferred (setTimeout)
  // navigation would be cancelled on cleanup before it fired, and the tab switch would
  // never land. (Same constraint documented in useMemoryNotification.)
  useEffect(() => {
    if (!pendingCompose) return;
    router.navigate('/');
  }, [pendingCompose, router]);
};

export { useReminderNotification };
