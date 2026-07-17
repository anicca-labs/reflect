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

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  const { data: devices, error } = await supabase
    .from('device_tokens')
    .select('fcm_token, reminder_hour, reminder_minute, timezone, firebase_project_id, locale')
    .not('reminder_hour', 'is', null)
    .not('reminder_minute', 'is', null)
    .not('timezone', 'is', null);

  if (error) return new Response(error.message, { status: 500 });
  if (!devices?.length) return new Response('ok — no devices with reminders');

  const now = new Date();
  const due = devices.filter((d) =>
    matchesReminderTime(now, d.timezone, d.reminder_hour, d.reminder_minute),
  );

  if (!due.length) return new Response('ok — no reminders due now');

  // Group by Firebase project so we mint one access token per project
  const byProject = Map.groupBy(due, (d) => d.firebase_project_id ?? 'reflect-8e62d');
  const staleTokens: string[] = [];
  let sent = 0;

  for (const [projectId, group] of byProject) {
    const accessToken = await getFirebaseAccessToken(projectId);
    const results = await Promise.all(
      group.map((d) =>
        sendFcmMessage(
          d.fcm_token,
          projectId,
          accessToken,
          {
            title: REMINDER_TITLE,
            body: reminderBody(d.locale),
          },
          // Routes the tap to the journal composer (useReminderNotification). FCM
          // data values must be strings.
          { type: REMINDER_DATA_TYPE },
          // Collapse redundant deliveries so an at-least-once redelivery (e.g. a
          // phone that was in Doze at reminder time) never stacks a second copy.
          { collapseId: 'daily-reminder' },
        ),
      ),
    );
    sent += results.filter((r) => r.ok).length;
    staleTokens.push(...group.filter((_, i) => results[i].unregistered).map((d) => d.fcm_token));
  }

  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('fcm_token', staleTokens);
  }

  return new Response(`Sent ${sent} reminder(s)`);
});
