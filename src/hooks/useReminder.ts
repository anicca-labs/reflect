import { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncReminderToBackend, registerGuestDeviceToken } from '@/src/services/user-devices';
import { scheduleDailyReminder, cancelDailyReminder } from '@/src/services/firebase-messaging';
import { useSessionStore } from '@/src/stores';

const ENABLED_KEY = '@reflect/reminder_enabled';
const HOUR_KEY = '@reflect/reminder_hour';
const MINUTE_KEY = '@reflect/reminder_minute';

// Re-exported so useReminderPrompt can check "already has a reminder" without mounting
// this hook (whose sync effect would fire a device-token write on every mount).
const REMINDER_ENABLED_KEY = ENABLED_KEY;

const DEFAULT_REMINDER_HOUR = 20;
const DEFAULT_REMINDER_MINUTE = 0;

type ReminderStoreState = {
  enabled: boolean;
  hour: number;
  minute: number;
  loading: boolean;
  set: (patch: Partial<Omit<ReminderStoreState, 'set'>>) => void;
};

/**
 * Shared across every consumer on purpose. Journal and Settings are sibling top-tabs, so
 * both stay mounted at once — with per-hook `useState`, enabling a reminder from the
 * journal's prompt left the already-mounted Settings toggle showing the stale old value
 * (it only read AsyncStorage on mount). AsyncStorage stays the persistence layer; this
 * store is the in-memory source of truth so all screens agree immediately.
 */
const useReminderStore = create<ReminderStoreState>((set) => ({
  enabled: false,
  hour: DEFAULT_REMINDER_HOUR,
  minute: DEFAULT_REMINDER_MINUTE,
  loading: true,
  set: (patch) => set(patch),
}));

let hydrating: Promise<void> | null = null;

// Read persisted values once per app run, no matter how many consumers mount.
const hydrate = (): Promise<void> => {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const [enabledVal, hourVal, minuteVal] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(HOUR_KEY),
      AsyncStorage.getItem(MINUTE_KEY),
    ]);
    useReminderStore.getState().set({
      enabled: enabledVal === 'true',
      hour: hourVal ? parseInt(hourVal, 10) : DEFAULT_REMINDER_HOUR,
      minute: minuteVal ? parseInt(minuteVal, 10) : DEFAULT_REMINDER_MINUTE,
      loading: false,
    });
  })();
  return hydrating;
};

// The delivery effect below now runs in every mounted consumer (state is shared), so
// dedupe on the resolved state — otherwise two mounted screens would each fire the
// device-token write for the same change.
let lastDeliveryKey: string | null = null;

const useReminder = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const enabled = useReminderStore((s) => s.enabled);
  const hour = useReminderStore((s) => s.hour);
  const minute = useReminderStore((s) => s.minute);
  const loading = useReminderStore((s) => s.loading);

  useEffect(() => {
    hydrate();
  }, []);

  // Deliver the reminder by account type — never both, so it can't duplicate:
  //  • Guests get an on-device schedule (works offline, no server needed), and their
  //    server reminder is cleared so the send-reminders cron won't also push to them.
  //  • Signed-in users get the server push (reliable even when Android OEMs kill local
  //    alarms), so the local schedule is cancelled.
  // This is also the single source of truth: it re-runs on any state/auth change, so
  // toggling, time edits, and sign-in/sign-out transitions all self-heal (e.g. a
  // signed-in user's stale local reminder is cancelled and moved to the server).
  useEffect(() => {
    if (loading) return;

    const key = `${isAnonymous}|${enabled}|${hour}|${minute}`;
    if (key === lastDeliveryKey) return;
    lastDeliveryKey = key;

    if (isAnonymous) {
      // Guest: deliver locally, and record the on/off state server-side (reminder_*
      // stay null so the cron skips them) for re-engagement targeting.
      registerGuestDeviceToken(enabled);
      if (enabled) scheduleDailyReminder(hour, minute);
      else cancelDailyReminder();
    } else {
      // Signed-in: server delivery via the cron; syncReminderToBackend also records
      // reminder_enabled. No local schedule → no duplicate.
      cancelDailyReminder();
      syncReminderToBackend(enabled, hour, minute);
    }
  }, [loading, enabled, hour, minute, isAnonymous]);

  const disable = async () => {
    useReminderStore.getState().set({ enabled: false });
    await AsyncStorage.setItem(ENABLED_KEY, 'false');
  };

  // Read through the store rather than the render-time snapshot so concurrent callers
  // (e.g. the journal prompt while Settings is mounted) can't flip off a stale value.
  const toggle = async (notifPermission: boolean) => {
    if (!notifPermission) return;
    const next = !useReminderStore.getState().enabled;
    useReminderStore.getState().set({ enabled: next });
    await AsyncStorage.setItem(ENABLED_KEY, String(next));
  };

  const updateTime = async (newHour: number, newMinute: number) => {
    useReminderStore.getState().set({ hour: newHour, minute: newMinute });
    await Promise.all([
      AsyncStorage.setItem(HOUR_KEY, String(newHour)),
      AsyncStorage.setItem(MINUTE_KEY, String(newMinute)),
    ]);
  };

  return { enabled, hour, minute, loading, toggle, disable, updateTime };
};

export { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, REMINDER_ENABLED_KEY, useReminder };
