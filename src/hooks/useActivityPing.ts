import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureDeviceToken } from '@/src/services/user-devices';

const LAST_PING_KEY = '@reflect/last_activity_ping';
const PING_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~once/day

// Records last_active_at and the device timezone by refreshing the device-token row
// on app foreground, debounced to ~once/day so it isn't a write on every resume.
// captureDeviceToken picks the right path (signed-in authed upsert vs guest public
// endpoint) and stamps both.
//
// Deliberately NOT gated on notification permission any more. It used to bail unless
// permission was 'granted', on the reasoning that other devices aren't reachable —
// but this is the only recurring path that writes `timezone`, and the streak and
// Wednesday pushes both skip rows without one. Bailing meant a device that gets
// permission later still had no timezone, and stayed silently unreachable. The write
// is cheap and getFCMToken already returns null when there's genuinely no token.
const useActivityPing = () => {
  const inFlight = useRef(false);

  useEffect(() => {
    const ping = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
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
