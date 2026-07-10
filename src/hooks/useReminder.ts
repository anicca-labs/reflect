import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncReminderToBackend } from '@/src/services/user-devices';
import { scheduleDailyReminder, cancelDailyReminder } from '@/src/services/firebase-messaging';

const ENABLED_KEY = '@reflect/reminder_enabled';
const HOUR_KEY = '@reflect/reminder_hour';
const MINUTE_KEY = '@reflect/reminder_minute';

const DEFAULT_REMINDER_HOUR = 20;
const DEFAULT_REMINDER_MINUTE = 0;

const useReminder = () => {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(DEFAULT_REMINDER_HOUR);
  const [minute, setMinute] = useState(DEFAULT_REMINDER_MINUTE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [enabledVal, hourVal, minuteVal] = await Promise.all([
        AsyncStorage.getItem(ENABLED_KEY),
        AsyncStorage.getItem(HOUR_KEY),
        AsyncStorage.getItem(MINUTE_KEY),
      ]);
      const isEnabled = enabledVal === 'true';
      const h = hourVal ? parseInt(hourVal, 10) : DEFAULT_REMINDER_HOUR;
      const m = minuteVal ? parseInt(minuteVal, 10) : DEFAULT_REMINDER_MINUTE;
      setEnabled(isEnabled);
      setHour(h);
      setMinute(m);
      setLoading(false);
      // Heal existing users: the reminder previously only synced to a backend
      // cron that never fired, so anyone who "enabled" it had no notification
      // actually scheduled. Re-arm the on-device daily reminder (idempotent —
      // scheduleDailyReminder cancels any prior one first).
      if (isEnabled) {
        scheduleDailyReminder(h, m);
      }
    };
    load();
  }, []);

  // React Compiler memoizes this closure, so it stays stable across renders
  // without manual refs/useCallback while always reading the latest state.
  const disable = async () => {
    if (!enabled) return;
    setEnabled(false);
    await AsyncStorage.setItem(ENABLED_KEY, 'false');
    await cancelDailyReminder();
    syncReminderToBackend(false, hour, minute);
  };

  const toggle = async (notifPermission: boolean) => {
    if (!notifPermission) return;
    const next = !enabled;
    setEnabled(next);
    await AsyncStorage.setItem(ENABLED_KEY, String(next));
    // The on-device daily reminder is what actually fires — schedule/cancel it
    // here. The backend sync stays for future server-push use, but does not
    // gate the notification working.
    if (next) {
      await scheduleDailyReminder(hour, minute);
    } else {
      await cancelDailyReminder();
    }
    syncReminderToBackend(next, hour, minute);
  };

  const updateTime = async (newHour: number, newMinute: number) => {
    setHour(newHour);
    setMinute(newMinute);
    await Promise.all([
      AsyncStorage.setItem(HOUR_KEY, String(newHour)),
      AsyncStorage.setItem(MINUTE_KEY, String(newMinute)),
    ]);
    if (enabled) {
      await scheduleDailyReminder(newHour, newMinute);
      syncReminderToBackend(true, newHour, newMinute);
    }
  };

  return { enabled, hour, minute, loading, toggle, disable, updateTime };
};

export { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, useReminder };
