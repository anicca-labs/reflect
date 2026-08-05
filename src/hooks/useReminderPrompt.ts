import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  REMINDER_ENABLED_KEY,
  REMINDER_HOUR_KEY,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
} from './useReminder';
import { useSessionStore } from '@/src/stores';

// Namespaced per user. These were bare device-level keys, so one person's four
// declines permanently silenced the ask for whoever signed in next on that device —
// and reminders are the main mechanism for getting someone back to write. A guest
// has no id, so they share the 'guest' bucket, which is correct: it's the same
// person until they make an account.
const lastAskedKey = (owner: string) => `@reflect/reminder_prompt_last_asked:${owner}`;
const askCountKey = (owner: string) => `@reflect/reminder_prompt_count:${owner}`;
// Superseded by the two keys above; still read once so installs from the first
// release don't get re-asked immediately.
const LEGACY_SEEN_KEY = '@reflect/reminder_prompt_seen';

// Someone who declines after their first entry is a much better candidate a few days
// later, once the habit is actually forming — so ask again rather than never.
const REPROMPT_AFTER_DAYS = 4;
// ...but stop eventually. Four asks (~day 0, 4, 8, 12) is a nudge; forever is nagging.
const MAX_PROMPTS = 4;

// Let the entry they just wrote land on screen before covering it with a modal.
const PROMPT_DELAY_MS = 600;

// Suggested times are rounded to the nearest half hour and kept inside waking hours, so
// a one-off 3am entry can't schedule a 3am nudge.
const ROUND_TO_MINUTES = 30;
const EARLIEST_SUGGESTED_HOUR = 7;
const LATEST_SUGGESTED_HOUR = 22;

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Offers a daily reminder after the user saves an entry — the earned moment, since they
 * just got value from the app, rather than interrupting a cold start.
 *
 * Reminders are otherwise only reachable from Settings, so effectively nobody finds them
 * (every prod device had reminders off), and the daily nudge is the main lever for
 * getting people back to write.
 *
 * Asked at most `MAX_PROMPTS` times, spaced `REPROMPT_AFTER_DAYS` apart, and only ever
 * while the user has no reminder set — enabling one (here or in Settings) stops the
 * asking permanently. `maybePrompt` owns all of that gating so call sites can fire it
 * after every save with no conditionals.
 */
const useReminderPrompt = () => {
  const [visible, setVisible] = useState(false);
  // Non-null only when the user has never picked a time — we never override a choice
  // they already made in Settings.
  const [suggested, setSuggested] = useState<SuggestedTime | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // outboxOwnerId is the store's view of who is signed in; guests fall back to a
  // shared bucket. Keeps one account's declines from silencing the next user's ask.
  const owner = useSessionStore((s) => s.outboxOwnerId) ?? 'guest';

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const maybePrompt = useCallback(async () => {
    const [alreadyEnabled, storedHour, lastAskedRaw, countRaw, legacySeen] = await Promise.all([
      AsyncStorage.getItem(REMINDER_ENABLED_KEY),
      AsyncStorage.getItem(REMINDER_HOUR_KEY),
      AsyncStorage.getItem(lastAskedKey(owner)),
      AsyncStorage.getItem(askCountKey(owner)),
      AsyncStorage.getItem(LEGACY_SEEN_KEY),
    ]);

    // They have a reminder — nothing left to ask for, ever.
    if (alreadyEnabled === 'true') return;

    let count = countRaw ? parseInt(countRaw, 10) : 0;
    let lastAsked = lastAskedRaw ? Date.parse(lastAskedRaw) : null;

    // Migrate installs that were asked under the old ask-once flag: treat it as one ask
    // just now, so they wait out a full cooldown instead of being re-asked immediately.
    if (!countRaw && legacySeen === 'true') {
      count = 1;
      lastAsked = Date.now();
      await Promise.all([
        AsyncStorage.setItem(askCountKey(owner), '1'),
        AsyncStorage.setItem(lastAskedKey(owner), new Date(lastAsked).toISOString()),
      ]);
      return;
    }

    if (count >= MAX_PROMPTS) return;
    if (lastAsked !== null && Date.now() - lastAsked < REPROMPT_AFTER_DAYS * DAY_MS) return;

    // Captured at the moment they wrote, not when the modal renders.
    setSuggested(storedHour ? null : suggestReminderTime());

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
  }, [owner]);

  // Record the ask on either answer. Enabling is separately caught by the
  // `alreadyEnabled` gate above, so a "yes" never gets asked again regardless of count.
  const dismiss = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);

    const countRaw = await AsyncStorage.getItem(askCountKey(owner));
    const next = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
    await Promise.all([
      AsyncStorage.setItem(askCountKey(owner), String(next)),
      AsyncStorage.setItem(lastAskedKey(owner), new Date().toISOString()),
    ]);
  }, [owner]);

  return { visible, suggested, maybePrompt, dismiss };
};

export { useReminderPrompt, suggestReminderTime };
export type { SuggestedTime };
