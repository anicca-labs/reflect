import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { getMessaging, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import { getApp } from '@react-native-firebase/app';
import { AI_INVITE_DATA_TYPE, getInitialFcmMessage } from '@firebase-messaging';
import { useAiInviteStore } from '@/src/stores';

// Routes a tapped ai-invite push (send-reminders phase 6) to the echo consent
// card. Mirrors useReminderNotification's stash-then-navigate pattern; FCM-only,
// because this push targets signed-in users exclusively — guests can't consent
// (their entries never reach the server), so there is no local-notification arm.
const useAiInviteNotification = () => {
  const router = useRouter();
  const pendingAiInvite = useAiInviteStore((s) => s.pendingAiInvite);
  const setPendingAiInvite = useAiInviteStore((s) => s.setPendingAiInvite);

  useEffect(() => {
    const messaging = getMessaging(getApp());
    const handleFcm = (message: { data?: { [key: string]: string | object } } | null) => {
      if (message?.data?.type === AI_INVITE_DATA_TYPE) setPendingAiInvite(true);
    };
    const fcmUnsub = onNotificationOpenedApp(messaging, handleFcm);
    // Shared cold-start read — a direct getInitialNotification call would consume
    // the native message and blind the other routing hooks.
    getInitialFcmMessage().then(handleFcm);
    return () => fcmUnsub();
  }, [setPendingAiInvite]);

  // Synchronous navigate, same constraint as useReminderNotification: the consumer
  // clears the flag, which re-runs this effect — a deferred navigation would be
  // cancelled on cleanup before it fired. JournalScreen opens the card once focused.
  useEffect(() => {
    if (!pendingAiInvite) return;
    router.navigate('/');
  }, [pendingAiInvite, router]);
};

export { useAiInviteNotification };
