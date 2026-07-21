import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REMINDER_ENABLED_KEY } from './useReminder';

const PROMPT_SEEN_KEY = '@reflect/reminder_prompt_seen';

// Let the entry they just wrote land on screen before covering it with a modal.
const PROMPT_DELAY_MS = 600;

/**
 * Asks — once — whether the user wants a daily reminder, right after they save an
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const maybePrompt = useCallback(async () => {
    const [seen, alreadyEnabled] = await Promise.all([
      AsyncStorage.getItem(PROMPT_SEEN_KEY),
      AsyncStorage.getItem(REMINDER_ENABLED_KEY),
    ]);
    if (seen === 'true' || alreadyEnabled === 'true') return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
  }, []);

  // Persist on dismiss (either answer) so we only ever ask once.
  const dismiss = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
    await AsyncStorage.setItem(PROMPT_SEEN_KEY, 'true');
  }, []);

  return { visible, maybePrompt, dismiss };
};

export { useReminderPrompt };
