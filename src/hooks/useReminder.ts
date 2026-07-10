import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncReminderToBackend } from '@/src/services/user-devices';
import { scheduleDailyReminder, cancelDailyReminder } from '@/src/services/firebase-messaging';
import { useSessionStore } from '@/src/stores';

const ENABLED_KEY = '@reflect/reminder_enabled';
const HOUR_KEY = '@reflect/reminder_hour';
const MINUTE_KEY = '@reflect/reminder_minute';

const DEFAULT_REMINDER_HOUR = 20;
const DEFAULT_REMINDER_MINUTE = 0;

const useReminder = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
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
      setEnabled(enabledVal === 'true');
      setHour(hourVal ? parseInt(hourVal, 10) : DEFAULT_REMINDER_HOUR);
      setMinute(minuteVal ? parseInt(minuteVal, 10) : DEFAULT_REMINDER_MINUTE);
      setLoading(false);
    };
    load();
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
    if (isAnonymous) {
      syncReminderToBackend(false, hour, minute);
      if (enabled) scheduleDailyReminder(hour, minute);
      else cancelDailyReminder();
    } else {
      cancelDailyReminder();
      syncReminderToBackend(enabled, hour, minute);
    }
  }, [loading, enabled, hour, minute, isAnonymous]);

  const disable = async () => {
    setEnabled(false);
    await AsyncStorage.setItem(ENABLED_KEY, 'false');
  };

  const toggle = async (notifPermission: boolean) => {
    if (!notifPermission) return;
    const next = !enabled;
    setEnabled(next);
    await AsyncStorage.setItem(ENABLED_KEY, String(next));
  };

  const updateTime = async (newHour: number, newMinute: number) => {
    setHour(newHour);
    setMinute(newMinute);
    await Promise.all([
      AsyncStorage.setItem(HOUR_KEY, String(newHour)),
      AsyncStorage.setItem(MINUTE_KEY, String(newMinute)),
    ]);
  };

  return { enabled, hour, minute, loading, toggle, disable, updateTime };
};

export { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, useReminder };
