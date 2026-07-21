import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REMINDER_ENABLED_KEY } from './useReminder';

const PROMPT_SEEN_KEY = '@reflect/reminder_prompt_seen';

/**
 * Asks — once — whether the user wants a daily reminder, right after they write an
 * entry. That moment is deliberate: they just got value from the app, so it's the
 * earned point to ask, rather than interrupting a cold start.
 *
 * Reminders are otherwise only reachable from Settings, which means effectively nobody
 * finds them (every prod device had reminders off), and the daily nudge is the main
 * lever for getting people back to write again.
 *
 * `maybePrompt` self-gates on both "already asked" and "already has a reminder", so
 * call sites can fire it after every save without their own conditionals.
 */
const useReminderPrompt = () => {
  const [visible, setVisible] = useState(false);

  const maybePrompt = useCallback(async () => {
    const [seen, alreadyEnabled] = await Promise.all([
      AsyncStorage.getItem(PROMPT_SEEN_KEY),
      AsyncStorage.getItem(REMINDER_ENABLED_KEY),
    ]);
    if (seen === 'true' || alreadyEnabled === 'true') return;
    setVisible(true);
  }, []);

  // Persist on dismiss (either answer) so we only ever ask once.
  const dismiss = useCallback(async () => {
    setVisible(false);
    await AsyncStorage.setItem(PROMPT_SEEN_KEY, 'true');
  }, []);

  return { visible, maybePrompt, dismiss };
};

export { useReminderPrompt };
