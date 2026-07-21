// @openapi-internal — public (no JWT): pure-local guests have no Supabase session,
// so they register their push token here. Writes with the service role (bypassing
// RLS) and leaves user_id + reminder_* NULL, so the send-reminders cron skips the
// row (guests' daily reminder stays local); the token exists only so admin-push can
// reach guests with manual / re-engagement notifications. When the guest later signs
// in, the authed upsert (keyed on fcm_token) attaches their user_id to this row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_FIREBASE_PROJECT_ID = 'reflect-8e62d';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: {
    fcmToken?: unknown;
    firebaseProjectId?: unknown;
    reminderEnabled?: unknown;
    locale?: unknown;
    timezone?: unknown;
    markFirstEntry?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const fcmToken = body.fcmToken;
  if (typeof fcmToken !== 'string' || fcmToken.length < 20 || fcmToken.length > 4096) {
    return new Response('Missing or invalid fcmToken', { status: 400 });
  }
  const firebaseProjectId =
    typeof body.firebaseProjectId === 'string'
      ? body.firebaseProjectId
      : DEFAULT_FIREBASE_PROJECT_ID;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    fcm_token: fcmToken,
    firebase_project_id: firebaseProjectId,
    // This is the guest-registration endpoint (only guests call it), so the device
    // is — or has just become — a guest. Detach any prior user and clear the
    // server-reminder fields: a guest's reminder is delivered locally, so the cron
    // must skip them. This is what corrects a device that signed out and returned as
    // a guest (its stale user_id + reminder would otherwise linger).
    user_id: null,
    reminder_hour: null,
    reminder_minute: null,
    updated_at: now,
    // The app is in the foreground whenever it calls this, so every call doubles as
    // an activity ping for re-engagement targeting.
    last_active_at: now,
  };
  // reminder_enabled records the guest's on/off state for targeting (their reminder
  // is delivered locally; reminder_* stay null so the cron skips them). Only written
  // when provided, so an activity-only ping doesn't clobber a known state.
  if (typeof body.reminderEnabled === 'boolean') row.reminder_enabled = body.reminderEnabled;
  // Device language (normalized app locale) so server push can be localized.
  if (typeof body.locale === 'string') row.locale = body.locale;
  // Device timezone — kept for re-engagement winback timing. Safe for guests: the
  // daily-reminder cron still skips them via the null reminder_hour above.
  if (typeof body.timezone === 'string') row.timezone = body.timezone;

  // On conflict the omitted columns (user_id, reminder_hour/minute) are left
  // untouched — so re-registering a token that already belongs to a signed-in user
  // never clears their ownership or their server reminder.
  const { error } = await supabase.from('device_tokens').upsert(row, { onConflict: 'fcm_token' });

  if (error) return new Response(error.message, { status: 500 });

  // Activation stamp: record the FIRST entry this device ever wrote. Deliberately NOT
  // part of the upsert above — a conditional update (only where first_entry_at is null)
  // means re-registering can never move an existing value, so the activation moment
  // stays the first one. Guests journal locally, so this is the only server-side signal
  // that a guest actually started writing.
  if (body.markFirstEntry === true) {
    await supabase
      .from('device_tokens')
      .update({ first_entry_at: now })
      .eq('fcm_token', fcmToken)
      .is('first_entry_at', null);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
