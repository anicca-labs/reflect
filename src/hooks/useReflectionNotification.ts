import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { getMessaging, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import { getApp } from '@react-native-firebase/app';
import { WEEKLY_REFLECTION_DATA_TYPE, getInitialFcmMessage } from '@firebase-messaging';
import { useReflectionOpenStore } from '@/src/stores';

// Sends a tapped "your week is ready" push straight into the latest reflection.
// Mirrors useReminderNotification's stash-then-navigate pattern: record the tap
// here, navigate from a separate effect, and let the Journal home's banner
// component (which owns the read modal) consume the flag once data is loaded.
// FCM-only — reflection pushes are server-sent to signed-in users; there is no
// local-notification variant.
const useReflectionNotification = () => {
  const router = useRouter();
  const pendingReflectionOpen = useReflectionOpenStore((s) => s.pendingReflectionOpen);
  const setPendingReflectionOpen = useReflectionOpenStore((s) => s.setPendingReflectionOpen);

  useEffect(() => {
    const messaging = getMessaging(getApp());
    const handleFcm = (message: { data?: { [key: string]: string | object } } | null) => {
      if (message?.data?.type === WEEKLY_REFLECTION_DATA_TYPE) setPendingReflectionOpen(true);
    };
    const fcmUnsub = onNotificationOpenedApp(messaging, handleFcm);
    // Shared cold-start read — the native initial message is consumed on first
    // access, so every routing hook must go through this memoized copy.
    getInitialFcmMessage().then(handleFcm);
    return () => fcmUnsub();
  }, [setPendingReflectionOpen]);

  // Same synchronous-navigate constraint as useReminderNotification: the consumer
  // clears the flag, which re-runs this effect — deferred navigation would be
  // cancelled before it fires.
  useEffect(() => {
    if (!pendingReflectionOpen) return;
    router.navigate('/');
  }, [pendingReflectionOpen, router]);
};

export { useReflectionNotification };
