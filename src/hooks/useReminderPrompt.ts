import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  REMINDER_ENABLED_KEY,
  REMINDER_HOUR_KEY,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
} from './useReminder';

const PROMPT_SEEN_KEY = '@reflect/reminder_prompt_seen';

// Let the entry they just wrote land on screen before covering it with a modal.
const PROMPT_DELAY_MS = 600;

// Suggested times are rounded to the nearest half hour and kept inside waking hours, so
// a one-off 3am entry can't schedule a 3am nudge.
const ROUND_TO_MINUTES = 30;
const EARLIEST_SUGGESTED_HOUR = 7;
const LATEST_SUGGESTED_HOUR = 22;

type SuggestedTime = { hour: number; minute: number };

/**
 * Seed the reminder from when they actually wrote. The prompt fires right after an
 * entry, so "now" is real evidence of this person's journaling rhythm — a far better
 * default than a blanket 8pm for someone who writes over morning coffee.
 */
const suggestReminderTime = (now: Date = new Date()): SuggestedTime => {
  const rounded = new Date(now);
  // setMinutes(60) rolls the hour forward, which is the behaviour we want.
  rounded.setMinutes(Math.round(now.getMinutes() / ROUND_TO_MINUTES) * ROUND_TO_MINUTES, 0, 0);

  const hour = rounded.getHours();
  if (hour < EARLIEST_SUGGESTED_HOUR || hour > LATEST_SUGGESTED_HOUR) {
    return { hour: DEFAULT_REMINDER_HOUR, minute: DEFAULT_REMINDER_MINUTE };
  }
  return { hour, minute: rounded.getMinutes() };
};

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
  // Non-null only when the user has never picked a time — we never override a choice
  // they already made in Settings.
  const [suggested, setSuggested] = useState<SuggestedTime | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const maybePrompt = useCallback(async () => {
    const [seen, alreadyEnabled, storedHour] = await Promise.all([
      AsyncStorage.getItem(PROMPT_SEEN_KEY),
      AsyncStorage.getItem(REMINDER_ENABLED_KEY),
      AsyncStorage.getItem(REMINDER_HOUR_KEY),
    ]);
    if (seen === 'true' || alreadyEnabled === 'true') return;

    // Captured at the moment they wrote, not when the modal renders.
    setSuggested(storedHour ? null : suggestReminderTime());

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
  }, []);

  // Persist on dismiss (either answer) so we only ever ask once.
  const dismiss = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
    await AsyncStorage.setItem(PROMPT_SEEN_KEY, 'true');
  }, []);

  return { visible, suggested, maybePrompt, dismiss };
};

export { useReminderPrompt, suggestReminderTime };
export type { SuggestedTime };
