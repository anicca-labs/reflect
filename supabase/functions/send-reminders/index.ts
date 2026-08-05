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

// Wednesday anticipation nudge: at local Wed 18:00, remind users who are IN the
// Sunday ritual (AI opted-in) and have written this week that their reflection
// is taking shape. Builds the Mon→Sun cadence: every entry becomes an
// investment in Sunday's payoff. Personal (their real count), never sent to
// users with nothing written (no guilt-tripping).
const TEASER_WEEKDAY = 'Wed';
const TEASER_HOUR = 18;
const TEASER_ONE_BY_LOCALE: Record<string, string> = {
  en: '1 entry so far — your Sunday reflection is taking shape. 🍂',
  es: '1 entrada por ahora — tu reflexión del domingo va tomando forma. 🍂',
  'pt-BR': '1 entrada até agora — sua reflexão de domingo está tomando forma. 🍂',
  fr: "1 entrée pour l'instant — ta réflexion du dimanche prend forme. 🍂",
  id: '1 entri sejauh ini — refleksi Minggumu mulai terbentuk. 🍂',
  ar: 'تدوينة واحدة حتى الآن — تأمل الأحد يتشكّل. 🍂',
};
const TEASER_MANY_BY_LOCALE: Record<string, string> = {
  en: '{n} entries so far — your Sunday reflection is taking shape. 🍂',
  es: '{n} entradas por ahora — tu reflexión del domingo va tomando forma. 🍂',
  'pt-BR': '{n} entradas até agora — sua reflexão de domingo está tomando forma. 🍂',
  fr: "{n} entrées pour l'instant — ta réflexion du dimanche prend forme. 🍂",
  id: '{n} entri sejauh ini — refleksi Minggumu mulai terbentuk. 🍂',
  ar: '{n} تدوينات حتى الآن — تأمل الأحد يتشكّل. 🍂',
};
const teaserBody = (locale: string | null, count: number): string => {
  const table = count === 1 ? TEASER_ONE_BY_LOCALE : TEASER_MANY_BY_LOCALE;
  const tmpl = (locale ? table[locale] : undefined) ?? table.en;
  return tmpl.replace('{n}', String(count));
};

// Short local weekday name ('Mon'..'Sun') for an instant in a timezone.
const localWeekdayInTz = (instant: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(instant);

// The local calendar date (YYYY-MM-DD) of this week's Monday in a timezone.
const localMondayInTz = (now: Date, timezone: string): string => {
  for (let d = 0; d < 7; d++) {
    const candidate = new Date(now.getTime() - d * 86_400_000);
    if (localWeekdayInTz(candidate, timezone) === 'Mon') return localDateInTz(candidate, timezone);
  }
  return localDateInTz(now, timezone); // unreachable
};

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

// ── Timezone fallback ───────────────────────────────────────────────────────
// Most device rows have NO timezone, and both time-based nudges used to skip them
// outright. The client has written it correctly since 2026-07-14, but a fresh
// install runs the STORE binary's embedded JS on its first session — which is when
// signup writes the row — and the OTA only applies from the second launch. The
// streak nudge targets people who wrote yesterday and haven't come back, i.e.
// exactly the people who never relaunched and so never got the fix. A new store
// build fixes it going forward; this makes the existing base reachable now.
//
// Rather than guess a region, derive the offset from the user's OWN writing times:
// journaling is an evening habit, so the hour they most often write stands in for
// their evening, and we nudge them at that hour. Worst case it lands a few hours
// off inside their waking day, which beats never sending at all.
const OFFSET_TO_ETC_ZONE = (offsetHours: number): string =>
  // Etc/GMT has an inverted sign: Etc/GMT+3 is UTC-3.
  offsetHours >= 0 ? `Etc/GMT-${offsetHours}` : `Etc/GMT+${-offsetHours}`;

const deriveZoneFromWritingHours = (utcHours: number[]): string | null => {
  if (utcHours.length === 0) return null;
  const counts = new Array(24).fill(0);
  for (const h of utcHours) counts[h]++;
  let modal = 0;
  for (let h = 1; h < 24; h++) if (counts[h] > counts[modal]) modal = h;
  // Treat their most common writing hour as STREAK_HOUR in their local time.
  let offset = STREAK_HOUR - modal;
  if (offset > 12) offset -= 24;
  if (offset < -11) offset += 24;
  return OFFSET_TO_ETC_ZONE(offset);
};

type PushDevice = {
  fcm_token: string;
  firebase_project_id: string | null;
  locale: string | null;
};

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  // Admin-only test hook: bypass the local-20:00 clock gate for the streak
  // phase (data conditions still apply). Lets us verify the push end-to-end
  // without waiting for a timezone to line up.
  const adminSecret = Deno.env.get('ADMIN_PUSH_SECRET');
  const body = (await req.json().catch(() => ({}))) as { test?: string };
  const isAdminTest = !!adminSecret && req.headers.get('X-Admin-Secret') === adminSecret;
  const forceStreak = isAdminTest && body.test === 'streak-now';
  const forceTeaser = isAdminTest && body.test === 'wednesday-now';

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
  const { data: rawStreakDevices } = await supabase
    .from('device_tokens')
    .select('fcm_token, user_id, timezone, firebase_project_id, locale, reminder_enabled')
    .not('user_id', 'is', null);

  // Fill in a derived zone for rows with no timezone (see the comment on
  // deriveZoneFromWritingHours) so they stop being silently unreachable.
  const needZone = (rawStreakDevices ?? []).filter((d) => !d.timezone);
  const derivedZoneByUser = new Map<string, string>();
  if (needZone.length > 0) {
    // Timestamps only — entry content is never read.
    const { data: history } = await supabase
      .from('journal_entries')
      .select('user_id, created_at')
      .in('user_id', [...new Set(needZone.map((d) => d.user_id as string))])
      .gte('created_at', new Date(now.getTime() - 30 * 86_400_000).toISOString());
    const hoursByUser = new Map<string, number[]>();
    for (const e of history ?? []) {
      const list = hoursByUser.get(e.user_id) ?? [];
      list.push(new Date(e.created_at).getUTCHours());
      hoursByUser.set(e.user_id, list);
    }
    for (const [uid, hours] of hoursByUser) {
      const zone = deriveZoneFromWritingHours(hours);
      if (zone) derivedZoneByUser.set(uid, zone);
    }
  }

  // A user with no timezone AND no derivable one (never wrote) is skipped — there's
  // nothing to base a send time on, and the streak nudge requires entries anyway.
  const streakDevices = (rawStreakDevices ?? [])
    .map((d) => ({ ...d, timezone: d.timezone ?? derivedZoneByUser.get(d.user_id as string) }))
    .filter((d): d is typeof d & { timezone: string } => !!d.timezone);

  const dueStreak = streakDevices.filter(
    (d) =>
      d.reminder_enabled !== true &&
      (forceStreak || matchesReminderTime(now, d.timezone, STREAK_HOUR, 0)),
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

  // ── Phase 3: Wednesday anticipation teaser (local Wed 18:00) ───────────────
  let teasersSent = 0;
  // Shares the same effective-timezone list, so the teaser reaches derived-zone
  // devices too rather than skipping everyone without a stored timezone.
  const dueTeaser = streakDevices.filter(
    (d) =>
      forceTeaser ||
      (localWeekdayInTz(now, d.timezone) === TEASER_WEEKDAY &&
        matchesReminderTime(now, d.timezone, TEASER_HOUR, 0)),
  );
  if (dueTeaser.length > 0) {
    const teaserUserIds = [...new Set(dueTeaser.map((d) => d.user_id as string))];
    // Only users in the Sunday ritual — the teaser promises a payoff that must exist.
    const { data: optedRows } = await supabase
      .from('user_settings')
      .select('user_id')
      .in('user_id', teaserUserIds)
      .eq('ai_reflections_enabled', true);
    const opted = new Set((optedRows ?? []).map((r) => r.user_id as string));
    // Timestamps only — content stays encrypted and untouched.
    const { data: weekEntries } = await supabase
      .from('journal_entries')
      .select('user_id, created_at')
      .in('user_id', [...opted])
      .gte('created_at', new Date(now.getTime() - 7 * 86_400_000).toISOString());

    const teaserResults = await Promise.all(
      dueTeaser.map((d) => {
        if (!opted.has(d.user_id as string)) return Promise.resolve(false);
        const monday = localMondayInTz(now, d.timezone);
        const count = (weekEntries ?? []).filter(
          (e) =>
            e.user_id === d.user_id && localDateInTz(new Date(e.created_at), d.timezone) >= monday,
        ).length;
        if (count === 0) return Promise.resolve(false);
        return push(d, teaserBody(d.locale, count), 'sunday-teaser');
      }),
    );
    teasersSent = teaserResults.filter(Boolean).length;
  }

  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('fcm_token', staleTokens);
  }

  return new Response(
    `Sent ${remindersSent} reminder(s), ${streaksSent} streak nudge(s), ${teasersSent} teaser(s)`,
  );
});
