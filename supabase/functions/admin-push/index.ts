// @openapi-internal — admin-only, not callable from app clients
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFirebaseAccessToken, sendFcmMessage } from '../_shared/firebase.ts';

const ADMIN_SECRET = Deno.env.get('ADMIN_PUSH_SECRET')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Supported locales → language name for the translation prompt. Anything else falls
// back to the source (English) text.
const LOCALE_NAME: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  'pt-BR': 'Brazilian Portuguese',
  fr: 'French',
  id: 'Indonesian',
  ar: 'Arabic',
};

// Pre-translated message templates the admin can pick (reuse existing translations —
// no Claude call, consistent copy). Each recipient gets their locale's version
// (English fallback). Keep the daily_reminder text in sync with the app
// (src/services/firebase-messaging) and send-reminders.
type Localized = { title: string; body: string };
const TEMPLATES: Record<string, { label: string; byLocale: Record<string, Localized> }> = {
  daily_reminder: {
    label: 'Daily reminder',
    byLocale: {
      en: { title: 'Reflect', body: "Time to jot down today's thoughts." },
      es: { title: 'Reflect', body: 'Hora de anotar tus pensamientos de hoy.' },
      'pt-BR': { title: 'Reflect', body: 'Hora de anotar seus pensamentos de hoje.' },
      fr: { title: 'Reflect', body: 'C’est le moment de noter tes pensées du jour.' },
      id: { title: 'Reflect', body: 'Waktunya mencatat pikiranmu hari ini.' },
      ar: { title: 'Reflect', body: 'حان وقت تدوين أفكارك اليوم.' },
    },
  },
  we_miss_you: {
    label: 'We miss you (win-back)',
    byLocale: {
      en: { title: 'Reflect', body: 'We miss you — your journal is waiting.' },
      es: { title: 'Reflect', body: 'Te echamos de menos — tu diario te espera.' },
      'pt-BR': { title: 'Reflect', body: 'Sentimos sua falta — seu diário está esperando.' },
      fr: { title: 'Reflect', body: 'Tu nous manques — ton journal t’attend.' },
      id: { title: 'Reflect', body: 'Kami merindukanmu — jurnalmu menunggu.' },
      ar: { title: 'Reflect', body: 'اشتقنا إليك — مذكرتك بانتظارك.' },
    },
  },
  keep_streak: {
    label: 'Keep your streak',
    byLocale: {
      en: { title: 'Reflect', body: 'Keep your streak going — write today.' },
      es: { title: 'Reflect', body: 'Mantén tu racha — escribe hoy.' },
      'pt-BR': { title: 'Reflect', body: 'Mantenha sua sequência — escreva hoje.' },
      fr: { title: 'Reflect', body: 'Garde ta série — écris aujourd’hui.' },
      id: { title: 'Reflect', body: 'Jaga rentetanmu — menulislah hari ini.' },
      ar: { title: 'Reflect', body: 'حافظ على تتابعك — اكتب اليوم.' },
    },
  },
};

type Device = {
  fcm_token: string;
  user_id: string | null;
  firebase_project_id: string | null;
  locale: string | null;
};

type Body = {
  action?: string;
  title?: string;
  body?: string;
  user_id?: string;
  // audience filters (ignored when user_id is set)
  locale?: string;
  reminder_enabled?: boolean;
  inactive_days?: number;
  account?: 'all' | 'guest' | 'signed_in';
  // translate the message into each recipient's locale (once per locale) via Claude
  translate?: boolean;
  // send a pre-translated template instead of custom title/body (no Claude)
  template?: string;
};

// Translate a short notification into a target locale via Claude (Haiku — cheap/fast).
// Called ONCE per distinct locale, never per device.
async function translateNotification(
  title: string,
  body: string,
  locale: string,
): Promise<{ title: string; body: string }> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
  const lang = LOCALE_NAME[locale] ?? locale;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content:
            `Translate this mobile app push notification into ${lang}. Keep it natural, warm, and concise (it's a short UI notification, not a document). Preserve meaning and tone. Keep the app/brand name "Reflect" unchanged. ` +
            `Return ONLY minified JSON: {"title":"...","body":"..."} — no markdown, no commentary.\n\n` +
            `Title: ${title}\nBody: ${body}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = String(data?.content?.[0]?.text ?? '').trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const parsed = JSON.parse(jsonStart >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text);
  return { title: parsed.title || title, body: parsed.body || body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = req.headers.get('X-Admin-Secret');
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return new Response('Unauthorized', { status: 403, headers: CORS_HEADERS });
  }

  const payload = (await req.json()) as Body;

  // --- templates: the pre-translated message templates (id + label + English preview) ---
  if (payload.action === 'templates') {
    return Response.json(
      Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, en: t.byLocale.en })),
      { headers: CORS_HEADERS },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  // --- list: every device with its owner email + engagement fields ---
  if (payload.action === 'list') {
    const { data: devices, error } = await supabase
      .from('device_tokens')
      .select('user_id, fcm_token, locale, reminder_enabled, last_active_at, updated_at')
      .order('last_active_at', { ascending: false, nullsFirst: false });

    if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS });
    if (!devices?.length) return Response.json([], { headers: CORS_HEADERS });

    const {
      data: { users },
      error: authError,
    } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authError) return new Response(authError.message, { status: 500, headers: CORS_HEADERS });
    const emailById = Object.fromEntries(users.map((u) => [u.id, u.email ?? u.id]));

    const result = devices.map((d) => ({
      user_id: d.user_id,
      email: d.user_id ? (emailById[d.user_id] ?? d.user_id) : 'Guest',
      fcm_token: d.fcm_token,
      locale: d.locale,
      reminder_enabled: d.reminder_enabled,
      last_active_at: d.last_active_at,
      updated_at: d.updated_at,
    }));
    return Response.json(result, { headers: CORS_HEADERS });
  }

  // --- resolve the audience: a single explicit target, else the filters ---
  let query = supabase
    .from('device_tokens')
    .select('fcm_token, user_id, firebase_project_id, locale');

  if (payload.user_id) {
    const target = payload.user_id;
    if (target.includes('@')) {
      const {
        data: { users: authUsers },
        error: authError,
      } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (authError) return new Response(authError.message, { status: 500, headers: CORS_HEADERS });
      const match = authUsers.find((u) => u.email === target);
      if (!match)
        return new Response(`No user found with email ${target}`, {
          status: 404,
          headers: CORS_HEADERS,
        });
      query = query.eq('user_id', match.id);
    } else if (UUID_RE.test(target)) {
      query = query.eq('user_id', target);
    } else {
      query = query.eq('fcm_token', target);
    }
  } else {
    if (payload.locale) query = query.eq('locale', payload.locale);
    if (typeof payload.reminder_enabled === 'boolean')
      query = query.eq('reminder_enabled', payload.reminder_enabled);
    if (payload.account === 'guest') query = query.is('user_id', null);
    else if (payload.account === 'signed_in') query = query.not('user_id', 'is', null);
    // "inactive for at least N days" → last opened before the cutoff (dormant win-back)
    if (payload.inactive_days && payload.inactive_days > 0) {
      const cutoff = new Date(Date.now() - payload.inactive_days * 86_400_000).toISOString();
      query = query.lt('last_active_at', cutoff);
    }
  }

  const { data: rawDevices, error } = await query;
  if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS });
  const devices = (rawDevices ?? []) as Device[];

  // --- preview: how many match + breakdown by locale (no send) ---
  if (payload.action === 'preview') {
    const byLocale: Record<string, number> = {};
    for (const d of devices) {
      const key = d.locale ?? 'unknown';
      byLocale[key] = (byLocale[key] ?? 0) + 1;
    }
    return Response.json({ total: devices.length, byLocale }, { headers: CORS_HEADERS });
  }

  // --- send ---
  const { title, body: msgBody, translate, template } = payload;

  if (template && !TEMPLATES[template]) {
    return new Response(`Unknown template: ${template}`, { status: 400, headers: CORS_HEADERS });
  }
  if (!template && (!title || !msgBody)) {
    return new Response('title and body are required', { status: 400, headers: CORS_HEADERS });
  }
  if (!devices.length) {
    return new Response('No matching devices found', { status: 200, headers: CORS_HEADERS });
  }
  if (translate && !template && !ANTHROPIC_API_KEY) {
    return new Response('Translation requested but ANTHROPIC_API_KEY is not configured', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Content per device:
  //  • template            → its pre-translated per-locale copy (no Claude).
  //  • custom + translate   → translate once per distinct locale via Claude.
  //  • custom, no translate → the raw title/body for everyone.
  const perLocale: Record<string, Localized> = {};
  const translateErrors: string[] = [];
  if (!template && translate) {
    const locales = [...new Set(devices.map((d) => d.locale).filter(Boolean) as string[])];
    for (const loc of locales) {
      if (loc === 'en' || !LOCALE_NAME[loc]) continue;
      try {
        perLocale[loc] = await translateNotification(title!, msgBody!, loc);
      } catch (e) {
        translateErrors.push(`${loc}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  const contentFor = (locale: string | null): Localized => {
    if (template) {
      const t = TEMPLATES[template].byLocale;
      return (locale && t[locale]) || t.en;
    }
    return (locale && perLocale[locale]) || { title: title!, body: msgBody! };
  };

  // Group by Firebase project to mint one access token per project.
  const byProject = Map.groupBy(devices, (d) => d.firebase_project_id ?? 'reflect-8e62d');
  const allResults: {
    idx: number;
    result: { ok: boolean; unregistered?: boolean; error?: string };
  }[] = [];

  for (const [projectId, group] of byProject) {
    const accessToken = await getFirebaseAccessToken(projectId);
    const results = await Promise.allSettled(
      group.map((d) => {
        const c = contentFor(d.locale);
        return sendFcmMessage(d.fcm_token, projectId, accessToken, {
          title: c.title,
          body: c.body,
        });
      }),
    );
    results.forEach((r, i) => {
      allResults.push({
        idx: devices.indexOf(group[i]),
        result: r.status === 'fulfilled' ? r.value : { ok: false, error: String(r.reason) },
      });
    });
  }

  allResults.sort((a, b) => a.idx - b.idx);
  const results = allResults.map((r) => r.result);

  const staleTokens = devices.filter((_, i) => results[i].unregistered).map((d) => d.fcm_token);
  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('fcm_token', staleTokens);
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.unregistered).length;
  const translatedNote = template
    ? ` · template: ${template}`
    : translate
      ? ` · translated: ${Object.keys(perLocale).join(', ') || 'none'}`
      : '';
  const errNote = translateErrors.length ? `\ntranslate errors: ${translateErrors.join('; ')}` : '';
  return new Response(
    `Sent to ${sent}/${devices.length} device${devices.length !== 1 ? 's' : ''}` +
      (failed ? ` (${failed} failed)` : '') +
      translatedNote +
      errNote,
    { status: 200, headers: CORS_HEADERS },
  );
});
