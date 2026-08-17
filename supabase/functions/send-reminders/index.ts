// @openapi-internal — cron-triggered, not callable by the app client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFirebaseAccessToken, sendFcmMessage } from '../_shared/firebase.ts';
import { REMINDER_DATA_TYPE } from '../_shared/notifications.ts';

const REMINDER_TITLE = 'Reflect';

// The daily reminder used to be ONE fixed string per locale — the same sentence,
// every day, forever, to the people who explicitly opted in. That's the most
// engaged audience in the app receiving its weakest copy.
//
// These rotate instead: a different line each day, cycling every ~2 weeks. They're
// written to be worth reading on their own and to invite writing without
// instructing it — a nudge you'd tolerate daily rather than mute.
//
// ORIGINAL lines, deliberately. The obvious move is to quote Rumi / Eliot / Laozi,
// but Eliot is under copyright until ~2035, the famous "Rumi" translations are
// Barks' copyrighted interpretations (and a great many circulating quotes are
// fabricated outright), and a misattributed quote would undercut exactly the
// careful register this app trades on. Same spirit, nothing to get wrong.
//
// en + es only: those are the only locales any device reports (62 en, 11 es, 97
// null which already fall back to English). No fr/id/pt-BR/ar device exists, so
// adding them would be translating for nobody.
const REFLECTIVE_LINES: Record<string, string[]> = {
  en: [
    'Not every day has a shape. Some only find one once you write it down.',
    'The thing you keep almost saying — say it here first.',
    'Water takes the shape of whatever holds it. Notice what held you today.',
    'A cup is useful because of the space inside it.',
    "What you couldn't name this morning may have a name by tonight.",
    "The mind repeats what it hasn't finished. What's repeating?",
    'Small days are still days. Write the small one.',
    "You don't have to conclude anything. Just put it down.",
    'Some weeks only make sense backwards.',
    'What asked for your attention today, whether or not you gave it?',
    'A worry written down takes up less room than one carried.',
    'Nothing needs solving tonight. Only noticing.',
    'Whatever is heavy gets lighter in sentences.',
    'You were somewhere today. Where?',
  ],
  es: [
    'No todos los días tienen forma. Algunos la encuentran solo al escribirlos.',
    'Eso que casi dices siempre — dilo acá primero.',
    'El agua toma la forma de lo que la contiene. Fijate qué te contuvo hoy.',
    'Una taza sirve por el espacio que tiene adentro.',
    'Lo que esta mañana no supiste nombrar quizá tenga nombre esta noche.',
    'La mente repite lo que no terminó. ¿Qué se te repite?',
    'Los días pequeños también son días. Escribí el pequeño.',
    'No hace falta que llegues a ninguna conclusión. Solo dejalo escrito.',
    'Hay semanas que solo se entienden al revés.',
    '¿Qué te pidió atención hoy, se la hayas dado o no?',
    'Una preocupación escrita ocupa menos lugar que una cargada.',
    'Esta noche no hay nada que resolver. Solo notar.',
    'Lo que pesa se aliviana en oraciones.',
    'Hoy estuviste en algún lugar. ¿Dónde?',
  ],
};

// Same line for everyone on a given day, rotating by day-of-year. Deterministic, so
// a retry or an at-least-once redelivery can't hand someone a different sentence for
// the same day.
const reminderBody = (locale: string | null): string => {
  const lines = (locale && REFLECTIVE_LINES[locale]) || REFLECTIVE_LINES.en;
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
  return lines[dayOfYear % lines.length];
};

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

// ── Worry follow-up ─────────────────────────────────────────────────────────
// Four days after a reflection that noticed something still in motion — Sunday's
// reflection lands a follow-up on Thursday, far enough to be a real interval, close
// enough that the thing is still true. Capped at 21 days so a stale worry is never
// reopened. Content-free by design; see the migration for why nothing is stored.
const FOLLOWUP_AFTER_DAYS = 4;
const FOLLOWUP_MAX_AGE_DAYS = 21;
const FOLLOWUP_HOUR = 10;
const FOLLOWUP_BODY_BY_LOCALE: Record<string, string> = {
  en: 'Something from last week seemed to be sitting with you. How’s it going?',
  es: 'Algo de la semana pasada parecía estar pesándote. ¿Cómo va?',
};
const followupBody = (locale: string | null): string =>
  (locale ? FOLLOWUP_BODY_BY_LOCALE[locale] : undefined) ?? FOLLOWUP_BODY_BY_LOCALE.en;

// ── Reflective line ("presence") ────────────────────────────────────────────
// NOT a reminder. This exists so the app is pleasantly present — a line worth
// reading on its own, where writing is a possible side effect rather than the ask.
// Different intent from the daily reminder, so a deliberately different pool: these
// lean toward being worth reading, the reminder's lean toward "write".
//
// Tue/Thu/Sat at 10:00 local. Three days avoids Wed (teaser) and Sun (reflection)
// entirely, and 10:00 avoids the 09:00 default that memory notifications use.
//
// Audience is everyone who did NOT set a reminder — people who set one already chose
// their cadence and shouldn't get a second daily voice. Anyone who already wrote that
// day is skipped (they don't need prompting), as is anyone who already received any
// server push that day (see api.push_log).
const LINE_WEEKDAYS = ['Tue', 'Thu', 'Sat'];
const LINE_HOUR = 10;
const REFLECTIVE_PRESENCE_LINES: Record<string, string[]> = {
  en: [
    'Rain doesn’t decide where to fall. It just falls, and the ground changes.',
    'A room feels different depending on who just left it.',
    'Most things you worried about last month have no name now.',
    'The river never asks whether it is making progress.',
    'You can hold a whole day in one sentence, if it’s the right one.',
    'Attention is the rarest thing anyone gives anyone.',
    'What you notice tends to be what you become.',
    'There is a kind of tiredness that sleep doesn’t reach.',
    'Stillness isn’t empty. It’s just quiet enough to hear.',
    'Some feelings only arrive once you stop chasing them.',
    'The same street looks different walking home.',
    'Nothing in nature hurries, and everything gets where it’s going.',
  ],
  es: [
    'La lluvia no decide dónde caer. Cae, y la tierra cambia.',
    'Una habitación se siente distinta según quién acaba de irse.',
    'Casi todo lo que te preocupaba el mes pasado hoy ya no tiene nombre.',
    'El río nunca se pregunta si está avanzando.',
    'Un día entero entra en una sola frase, si es la frase justa.',
    'La atención es lo más raro que alguien le da a alguien.',
    'Uno termina pareciéndose a lo que mira.',
    'Hay un cansancio al que el sueño no llega.',
    'La quietud no está vacía. Solo está lo bastante callada para oír.',
    'Algunas cosas solo llegan cuando dejás de buscarlas.',
    'La misma calle se ve distinta cuando volvés a casa.',
    'En la naturaleza nada se apura, y todo llega.',
  ],
};
const presenceLine = (locale: string | null, dayKey: number): string => {
  const lines = (locale && REFLECTIVE_PRESENCE_LINES[locale]) || REFLECTIVE_PRESENCE_LINES.en;
  return lines[dayKey % lines.length];
};

// The Sunday reflection is an appointment, but nothing told consented users it was
// coming — 18 of 20 opted-in users got nothing on 2026-08-16 because they hadn't
// written the 2 entries the cron needs. For those users the presence slot carries
// the appointment instead of a generic line: same send, same volume, better aim.
// Index 0 = no entries yet this week, 1 = one entry so far.
const APPOINTMENT_LINES: Record<string, [string, string]> = {
  en: [
    'Your Sunday reflection is waiting on this week’s pages. Two are enough.',
    'One page this week so far. One more, and Sunday has something to gather.',
  ],
  es: [
    'Tu reflexión del domingo espera las páginas de esta semana. Con dos alcanza.',
    'Una página esta semana. Una más, y el domingo tendrá algo que recoger.',
  ],
};
const appointmentLine = (locale: string | null, weekCount: number): string => {
  const lines = (locale && APPOINTMENT_LINES[locale]) || APPOINTMENT_LINES.en;
  return lines[Math.min(weekCount, 1)];
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
    .map((d) => ({
      ...d,
      // derivedZone marks a zone we inferred rather than one the device reported —
      // it's calibrated so STREAK_HOUR is their usual writing time, so no other hour
      // in it means anything (see Phase 3).
      derivedZone: !d.timezone,
      timezone: d.timezone ?? derivedZoneByUser.get(d.user_id as string),
    }))
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
  //
  // Derived zones use STREAK_HOUR, not TEASER_HOUR. A derived zone is calibrated by
  // declaring the user's usual writing hour to BE STREAK_HOUR local — it is not a
  // real geographic offset, so any OTHER hour in it is meaningless. Firing at
  // TEASER_HOUR would land two hours before their actual writing time, which for a
  // morning writer is the small hours. At STREAK_HOUR it lands when we know they're
  // awake and journalling.
  const dueTeaser = streakDevices.filter((d) => {
    if (forceTeaser) return true;
    if (localWeekdayInTz(now, d.timezone) !== TEASER_WEEKDAY) return false;
    const hour = d.derivedZone ? STREAK_HOUR : TEASER_HOUR;
    return matchesReminderTime(now, d.timezone, hour, 0);
  });
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

  // ── Phase 4: follow-up on an unresolved worry ───────────────────────────────
  // A few days after a reflection noticed something still in motion, ask how it's
  // going. This is the most personal push the app sends and the only one triggered by
  // what someone wrote — so two rules hold it in check:
  //
  //   1. CONTENT-FREE. The message never names the worry and is identical for
  //      everyone. Notifications are readable on a lock screen by whoever is holding
  //      the phone, and this feature selects for the most sensitive entries a person
  //      has. Nothing about the topic is stored either (see the migration).
  //   2. open_thread = 'thread' ONLY. Reflections classified 'sensitive' — acute
  //      distress, grief, crisis — are deliberately skipped. An automated check-in
  //      there is worse than silence.
  //
  // Sent BEFORE the presence phase on purpose: if a user qualifies for both today,
  // this is the one worth their attention, and push_log makes the other stand down.
  let followupsSent = 0;
  const forceFollowup = isAdminTest && body.test === 'followup-now';
  {
    const cutoff = new Date(now.getTime() - FOLLOWUP_AFTER_DAYS * 86_400_000).toISOString();
    const { data: pending } = await supabase
      .from('reflections')
      .select('id, user_id, created_at')
      .eq('open_thread', 'thread')
      .is('followup_sent_at', null)
      .lt('created_at', forceFollowup ? new Date(now.getTime() + 86_400_000).toISOString() : cutoff)
      // Only ever chase a recent one — a worry from six weeks ago is not something to
      // reopen unprompted.
      .gt('created_at', new Date(now.getTime() - FOLLOWUP_MAX_AGE_DAYS * 86_400_000).toISOString());

    if (pending && pending.length > 0) {
      const userIds = [...new Set(pending.map((r) => r.user_id as string))];
      const { data: devices } = await supabase
        .from('device_tokens')
        .select('fcm_token, user_id, timezone, firebase_project_id, locale')
        .in('user_id', userIds)
        .not('timezone', 'is', null);

      const { data: pushedRows } = await supabase
        .from('push_log')
        .select('user_id, sent_on')
        .in('user_id', userIds);

      for (const r of pending) {
        const d = (devices ?? []).find((x) => x.user_id === r.user_id);
        if (!d) continue;
        // Same local hour as the presence line, and the same day-collision guard.
        if (!forceFollowup && !matchesReminderTime(now, d.timezone, FOLLOWUP_HOUR, 0)) continue;
        const localDate = localDateInTz(now, d.timezone);
        if ((pushedRows ?? []).some((p) => p.user_id === r.user_id && p.sent_on === localDate))
          continue;

        const ok = await push(d, followupBody(d.locale), 'worry-followup');
        // Stamp regardless of delivery: a failed push should not leave the row to be
        // retried forever, and re-asking about a worry days later is worse than
        // missing it once.
        await supabase
          .from('reflections')
          .update({ followup_sent_at: new Date().toISOString() })
          .eq('id', r.id);
        if (ok) {
          followupsSent++;
          await supabase
            .from('push_log')
            .insert({ user_id: r.user_id, kind: 'worry_followup', sent_on: localDate })
            .then(() => {});
        }
      }
    }
  }

  // ── Phase 5: reflective line (presence) ─────────────────────────────────────
  let linesSent = 0;
  const forceLine = isAdminTest && body.test === 'line-now';
  {
    const { data: lineDevices } = await supabase
      .from('device_tokens')
      .select('fcm_token, user_id, timezone, firebase_project_id, locale, reminder_enabled')
      .not('user_id', 'is', null)
      .not('timezone', 'is', null);

    const due = (lineDevices ?? []).filter(
      (d) =>
        // People who set a reminder chose their cadence — don't add a second voice.
        !d.reminder_enabled &&
        (forceLine ||
          (LINE_WEEKDAYS.includes(localWeekdayInTz(now, d.timezone)) &&
            matchesReminderTime(now, d.timezone, LINE_HOUR, 0))),
    );

    if (due.length > 0) {
      const userIds = [...new Set(due.map((d) => d.user_id as string))];

      // Skip anyone who already wrote today — the line is for presence, and someone
      // mid-habit doesn't need prompting.
      const { data: todaysEntries } = await supabase
        .from('journal_entries')
        .select('user_id, created_at')
        .in('user_id', userIds)
        .gte('created_at', new Date(now.getTime() - 24 * 3_600_000).toISOString());
      const wroteRecently = new Set((todaysEntries ?? []).map((e) => e.user_id as string));

      // Skip anyone who already heard from us today, whatever the reason. This is the
      // only place anything coordinates total push volume across types.
      const { data: alreadyPushed } = await supabase
        .from('push_log')
        .select('user_id, sent_on')
        .in('user_id', userIds);
      const pushedToday = new Set(
        (alreadyPushed ?? [])
          .filter((r) => {
            const d = due.find((x) => x.user_id === r.user_id);
            return d && r.sent_on === localDateInTz(now, d.timezone);
          })
          .map((r) => r.user_id as string),
      );

      const eligible = due.filter(
        (d) => !wroteRecently.has(d.user_id as string) && !pushedToday.has(d.user_id as string),
      );

      // Consented users who haven't yet fed next Sunday's reflection get the
      // appointment line instead of a generic one (see APPOINTMENT_LINES). Excluded:
      // free users already at the reflection limit — the Sunday cron skips them, so
      // promising a delivery would be a lie told right above the Pro gate.
      const eligibleIds = [...new Set(eligible.map((d) => d.user_id as string))];
      const appointmentFor = new Set<string>();
      const weekCounts = new Map<string, number>();
      if (eligibleIds.length > 0) {
        const { data: consentRows } = await supabase
          .from('user_settings')
          .select('user_id')
          .eq('ai_reflections_enabled', true)
          .in('user_id', eligibleIds);
        const consented = (consentRows ?? []).map((r) => r.user_id as string);
        if (consented.length > 0) {
          const [{ data: reflRows }, { data: proRows }] = await Promise.all([
            supabase.from('reflections').select('user_id').in('user_id', consented),
            supabase
              .from('entitlements')
              .select('user_id')
              .eq('is_pro', true)
              .in('user_id', consented),
          ]);
          const reflCounts = new Map<string, number>();
          for (const r of reflRows ?? []) {
            const uid = r.user_id as string;
            reflCounts.set(uid, (reflCounts.get(uid) ?? 0) + 1);
          }
          const pro = new Set((proRows ?? []).map((r) => r.user_id as string));
          // Keep in sync with FREE_REFLECTION_LIMIT in generate-reflection.
          const FREE_REFLECTION_LIMIT = 4;
          const candidates = consented.filter(
            (uid) => pro.has(uid) || (reflCounts.get(uid) ?? 0) < FREE_REFLECTION_LIMIT,
          );
          if (candidates.length > 0) {
            // Entries since the last Sunday-16:00 UTC cron — exactly the window the
            // next reflection will read.
            const cutoff = new Date(now.getTime());
            cutoff.setUTCHours(16, 0, 0, 0);
            if (cutoff.getTime() > now.getTime()) cutoff.setUTCDate(cutoff.getUTCDate() - 1);
            while (cutoff.getUTCDay() !== 0) cutoff.setUTCDate(cutoff.getUTCDate() - 1);
            const { data: weekRows } = await supabase
              .from('journal_entries')
              .select('user_id')
              .in('user_id', candidates)
              .gte('created_at', cutoff.toISOString());
            for (const r of weekRows ?? []) {
              const uid = r.user_id as string;
              weekCounts.set(uid, (weekCounts.get(uid) ?? 0) + 1);
            }
            for (const uid of candidates) {
              if ((weekCounts.get(uid) ?? 0) < 2) appointmentFor.add(uid);
            }
          }
        }
      }

      const results = await Promise.all(
        eligible.map(async (d) => {
          const uid = d.user_id as string;
          const localDate = localDateInTz(now, d.timezone);
          // Index off the local date so everyone on a given day gets the same line and
          // a retry can't change it mid-day.
          const dayKey = Math.floor(Date.parse(localDate) / 86_400_000);
          const line = appointmentFor.has(uid)
            ? appointmentLine(d.locale, weekCounts.get(uid) ?? 0)
            : presenceLine(d.locale, dayKey);
          const ok = await push(d, line, 'reflective-line');
          if (ok) {
            // Ignore conflicts: the unique index makes a retry a no-op rather than a
            // duplicate, which is exactly what we want from an hourly cron.
            await supabase
              .from('push_log')
              .insert({ user_id: d.user_id, kind: 'reflective_line', sent_on: localDate })
              .then(() => {});
          }
          return ok;
        }),
      );
      linesSent = results.filter(Boolean).length;
    }
  }

  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('fcm_token', staleTokens);
  }

  return new Response(
    `Sent ${remindersSent} reminder(s), ${streaksSent} streak nudge(s), ${teasersSent} teaser(s), ${followupsSent} follow-up(s), ${linesSent} line(s)`,
  );
});
