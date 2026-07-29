// @openapi-internal — cron-triggered, not callable by the app client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFirebaseAccessToken, sendFcmMessage } from '../_shared/firebase.ts';
import { REMINDER_DATA_TYPE } from '../_shared/notifications.ts';

// Fixed reminder string, localized by the device's saved locale (English fallback).
// Keep in sync with REMINDER_BODY_BY_LOCALE in src/services/firebase-messaging (the
// local-notification path for guests).
const REMINDER_TITLE = 'Reflect';
const REMINDER_BODY_BY_LOCALE: Record<string, string> = {
  en: "Time to jot down today's thoughts.",
  es: 'Hora de anotar tus pensamientos de hoy.',
  'pt-BR': 'Hora de anotar seus pensamientos de hoje.',
  fr: 'C’est le moment de noter tes pensées du jour.',
  id: 'Waktunya mencatat pikiranmu hari ini.',
  ar: 'حان وقت تدوين أفكارك اليوم.',
};
const reminderBody = (locale: string | null): string =>
  (locale ? REMINDER_BODY_BY_LOCALE[locale] : undefined) ?? REMINDER_BODY_BY_LOCALE.en;

// Streak-at-risk: at local 20:00, nudge signed-in users who wrote yesterday but
// not yet today. Loss aversion beats a fixed-time reminder — it only fires for
// users with something to lose. Users who set their own daily reminder are
// excluded (they chose their cadence; don't double-push). Guests are excluded
// structurally: their entries never reach the server.
const STREAK_HOUR = 20;
const STREAK_BODY_BY_LOCALE: Record<string, string> = {
  en: 'Your streak ends at midnight — one line keeps it alive. 🍂',
  es: 'Tu racha termina a medianoche — una línea la mantiene viva. 🍂',
  'pt-BR': 'Sua sequência termina à meia-noite — uma linha a mantém viva. 🍂',
  fr: 'Ta série se termine à minuit — une ligne la garde en vie. 🍂',
  id: 'Rentetanmu berakhir tengah malam — satu baris menjaganya tetap hidup. 🍂',
  ar: 'يومياتك المتتابعة تنتهي عند منتصف الليل — سطر واحد يبقيها حية. 🍂',
};
const streakBody = (locale: string | null): string =>
  (locale ? STREAK_BODY_BY_LOCALE[locale] : undefined) ?? STREAK_BODY_BY_LOCALE.en;

// The device's local calendar date (YYYY-MM-DD) for a given instant.
const localDateInTz = (instant: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

function matchesReminderTime(now: Date, timezone: string, hour: number, minute: number): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const localHour = parseInt(parts.find((p) => p.type === 'hour')!.value);
  const localMinute = parseInt(parts.find((p) => p.type === 'minute')!.value);
  return localHour === hour && localMinute === minute;
}

type PushDevice = {
  fcm_token: string;
  firebase_project_id: string | null;
  locale: string | null;
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  const now = new Date();
  const staleTokens: string[] = [];
  // One Firebase access token per project across both phases.
  const tokenCache = new Map<string, string>();
  const getToken = async (projectId: string): Promise<string> => {
    let token = tokenCache.get(projectId);
    if (!token) {
      token = await getFirebaseAccessToken(projectId);
      tokenCache.set(projectId, token);
    }
    return token;
  };
  const push = async (d: PushDevice, body: string, collapseId: string): Promise<boolean> => {
    const projectId = d.firebase_project_id ?? 'reflect-8e62d';
    const res = await sendFcmMessage(
      d.fcm_token,
      projectId,
      await getToken(projectId),
      { title: REMINDER_TITLE, body },
      // Routes the tap to the journal composer (useReminderNotification). FCM
      // data values must be strings.
      { type: REMINDER_DATA_TYPE },
      // Collapse redundant deliveries so an at-least-once redelivery (e.g. a
      // phone that was in Doze at send time) never stacks a second copy.
      { collapseId },
    );
    if (res.unregistered) staleTokens.push(d.fcm_token);
    return res.ok;
  };

  // ── Phase 1: user-scheduled daily reminders ─────────────────────────────────
  let remindersSent = 0;
  const { data: reminderDevices, error } = await supabase
    .from('device_tokens')
    .select('fcm_token, reminder_hour, reminder_minute, timezone, firebase_project_id, locale')
    .not('reminder_hour', 'is', null)
    .not('reminder_minute', 'is', null)
    .not('timezone', 'is', null);
  if (error) return new Response(error.message, { status: 500 });

  const dueReminders = (reminderDevices ?? []).filter((d) =>
    matchesReminderTime(now, d.timezone, d.reminder_hour, d.reminder_minute),
  );
  const reminderResults = await Promise.all(
    dueReminders.map((d) => push(d, reminderBody(d.locale), 'daily-reminder')),
  );
  remindersSent = reminderResults.filter(Boolean).length;

  // ── Phase 2: streak-at-risk (local 20:00) ───────────────────────────────────
  let streaksSent = 0;
  const { data: streakDevices } = await supabase
    .from('device_tokens')
    .select('fcm_token, user_id, timezone, firebase_project_id, locale, reminder_enabled')
    .not('user_id', 'is', null)
    .not('timezone', 'is', null);

  const dueStreak = (streakDevices ?? []).filter(
    (d) => d.reminder_enabled !== true && matchesReminderTime(now, d.timezone, STREAK_HOUR, 0),
  );
  if (dueStreak.length > 0) {
    const userIds = [...new Set(dueStreak.map((d) => d.user_id as string))];
    // Timestamps only — entry content stays encrypted and untouched.
    const { data: recent } = await supabase
      .from('journal_entries')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .gte('created_at', new Date(now.getTime() - 48 * 3_600_000).toISOString());

    const streakResults = await Promise.all(
      dueStreak.map((d) => {
        const dates = new Set(
          (recent ?? [])
            .filter((e) => e.user_id === d.user_id)
            .map((e) => localDateInTz(new Date(e.created_at), d.timezone)),
        );
        const today = localDateInTz(now, d.timezone);
        const yesterday = localDateInTz(new Date(now.getTime() - 24 * 3_600_000), d.timezone);
        if (!dates.has(yesterday) || dates.has(today)) return Promise.resolve(false);
        return push(d, streakBody(d.locale), 'streak-risk');
      }),
    );
    streaksSent = streakResults.filter(Boolean).length;
  }

  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('fcm_token', staleTokens);
  }

  return new Response(`Sent ${remindersSent} reminder(s), ${streaksSent} streak nudge(s)`);
});
