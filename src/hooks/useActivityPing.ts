import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureDeviceToken } from '@/src/services/user-devices';
import { getNotificationPermissionStatus } from '@/src/services/firebase-messaging';

const LAST_PING_KEY = '@reflect/last_activity_ping';
const PING_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~once/day

// Records last_active_at — the recency signal for re-engagement targeting ("haven't
// opened in N days") — by refreshing the device-token row on app foreground,
// debounced to ~once/day so it isn't a write on every resume. Only for users who
// granted notifications (others have no reachable token). captureDeviceToken picks
// the right path (signed-in authed upsert vs guest public endpoint) and stamps
// last_active_at.
const useActivityPing = () => {
  const inFlight = useRef(false);

  useEffect(() => {
    const ping = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const status = await getNotificationPermissionStatus();
        if (status !== 'granted') return;
        const last = await AsyncStorage.getItem(LAST_PING_KEY);
        if (last && Date.now() - parseInt(last, 10) < PING_INTERVAL_MS) return;
        await captureDeviceToken();
        await AsyncStorage.setItem(LAST_PING_KEY, String(Date.now()));
      } finally {
        inFlight.current = false;
      }
    };

    ping(); // cold start
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ping();
    });
    return () => sub.remove();
  }, []);
};

export { useActivityPing };
