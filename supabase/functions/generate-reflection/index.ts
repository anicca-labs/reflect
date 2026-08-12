// @openapi-internal — generates a user's weekly AI reflection.
//
// Auth: either a signed-in user's JWT (generate for self, on-demand) OR the admin
// secret (generate for a given userId, or run the weekly batch for all opted-in
// users — the Sunday cron path). Deployed --no-verify-jwt so the cron can call it
// with the admin secret; self-calls are still validated via auth.getUser().
//
// Privacy: entries are decrypted server-side ONLY to build the prompt, sent to
// Anthropic (which never trains on / sells API data), and the reflection is stored
// re-encrypted in the same enc:v1: AES-256-CTR scheme as journal_entries — the DB
// never holds plaintext.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFirebaseAccessToken, sendFcmMessage } from '../_shared/firebase.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_PUSH_SECRET');
const FREE_REFLECTION_LIMIT = 4;

// ── "Your week is ready" push (cron path only — self-generates happen in-app) ──
// Localized by the device's saved locale, mirroring the send-reminders pattern.
const REFLECTION_PUSH_TITLE = 'Reflect';
const REFLECTION_PUSH_BODY_BY_LOCALE: Record<string, string> = {
  en: '🍂 Your week is ready — a look back at your last 7 days.',
  es: '🍂 Tu semana está lista — una mirada a tus últimos 7 días.',
  'pt-BR': '🍂 Sua semana está pronta — um olhar sobre seus últimos 7 dias.',
  fr: '🍂 Ta semaine est prête — un regard sur tes 7 derniers jours.',
  id: '🍂 Minggumu sudah siap — kilas balik 7 hari terakhirmu.',
  ar: '🍂 أسبوعك جاهز — نظرة على آخر 7 أيام.',
};
const reflectionPushBody = (locale: string | null): string =>
  (locale ? REFLECTION_PUSH_BODY_BY_LOCALE[locale] : undefined) ??
  REFLECTION_PUSH_BODY_BY_LOCALE.en;

// Notify one user that their weekly reflection is ready. Access tokens are cached
// per Firebase project across the whole cron run (tokenCache). Stale FCM tokens are
// collected by the caller for a single batched delete. Never throws — a push
// failure must not fail the generation that already succeeded.
const notifyReflectionReady = async (
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  tokenCache: Map<string, string>,
  staleTokens: string[],
): Promise<void> => {
  try {
    const { data: devices } = await admin
      .from('device_tokens')
      .select('fcm_token, firebase_project_id, locale')
      .eq('user_id', userId);
    if (!devices?.length) return;
    for (const d of devices as {
      fcm_token: string;
      firebase_project_id: string | null;
      locale: string | null;
    }[]) {
      const projectId = d.firebase_project_id ?? 'reflect-8e62d';
      let accessToken = tokenCache.get(projectId);
      if (!accessToken) {
        accessToken = await getFirebaseAccessToken(projectId);
        tokenCache.set(projectId, accessToken);
      }
      const res = await sendFcmMessage(
        d.fcm_token,
        projectId,
        accessToken,
        { title: REFLECTION_PUSH_TITLE, body: reflectionPushBody(d.locale) },
        // Tap opens the app; the Journal home shows the "Your week is ready"
        // banner for the unseen reflection. Typed for future deep-link routing.
        { type: 'weekly-reflection' },
        // One logical notification per week — collapse at-least-once redeliveries.
        { collapseId: 'weekly-reflection' },
      );
      if (res.unregistered) staleTokens.push(d.fcm_token);
    }
  } catch (e) {
    console.error('reflection push failed for', userId, e);
  }
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

// ── Crypto — mirrors src/services/crypto (AES-256-CTR, enc:v1: + base64(IV‖ct)) ──
const ENC_PREFIX = 'enc:v1:';
const IV_BYTES = 16;

// Return type pinned to Uint8Array<ArrayBuffer>, not the default
// Uint8Array<ArrayBufferLike>: WebCrypto's BufferSource excludes SharedArrayBuffer
// backing, so the looser type doesn't satisfy importKey/encrypt/decrypt.
const b64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesToB64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const importKey = (usages: KeyUsage[]) =>
  crypto.subtle.importKey(
    'raw',
    b64ToBytes(Deno.env.get('EXPO_PUBLIC_ENTRIES_ENCRYPTION_KEY')!),
    { name: 'AES-CTR' },
    false,
    usages,
  );

const decryptContent = async (value: string): Promise<string> => {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const combined = b64ToBytes(value.slice(ENC_PREFIX.length));
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const key = await importKey(['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: iv, length: 128 },
    key,
    cipher,
  );
  return new TextDecoder().decode(plain);
};

const encryptContent = async (plaintext: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await importKey(['encrypt']);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: iv, length: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  const cipher = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(IV_BYTES + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, IV_BYTES);
  return ENC_PREFIX + bytesToB64(combined);
};

// Single source of truth — this was written twice (here and in the reflections row
// insert), which would drift the moment one was changed.
//
// Opus 5 (was opus-4-8). Weekly volume is single digits, so the cost delta is
// rounding error, while this is the one output someone might pay for — quality is
// worth more here than anywhere else in the app. The echo deliberately stays on
// Sonnet 5: it fires on EVERY save with no cap, so it's the real spend.
//
// The prompt below was tuned against 4.8 — particularly the crisis clauses, the
// anti-sameness rules, and the "never remark on the writing itself" guardrail added
// after a model produced dismissive commentary about someone's entries. A model
// change can move those. If reflections start reading as judgmental, this line is
// the first thing to look at.
const REFLECTION_MODEL = 'claude-opus-5';

// ── The reflection prompt ────────────────────────────────────────────────────
// The previous version mandated three beats (pattern → standout moment → open
// question), which made every reflection the same silhouette forever — by week three
// a user could predict the shape before reading. It also FORCED a pattern to exist,
// which on the most common week (3–5 entries) means fabricating one. Two hard
// requirements plus an elastic shape fixes both at once.
const REFLECTION_SYSTEM = `You are the quiet, perceptive voice inside someone's private journal. Once a week you read what they wrote and reflect it back — not to advise or fix, but to help them see their week more clearly than they can from inside it.

Write about 150–200 words. Second person ("you"). Write in the SAME language the entries are written in.

Two things are required:
- Say at least one thing unmistakably about THIS person's week and no one else's. Quote a short phrase of theirs verbatim.
- Stay with what's actually there. Never invent a pattern, an arc, or a lesson the entries don't support.

Beyond that, let the week decide the shape. Some weeks have one clear thread; some have two that never connect; some are a handful of ordinary days with one moment that mattered. Do not summarise entry by entry.

Write about what they wrote — never about the writing itself. Never remark on how much or how little there is, how short or fragmentary it is, what day it landed on, or how much you can or can't make of it. No "only a few entries", no "all on one day", no "not much to go on". They are not being graded, and a thin week is not a failed week. If there's little material, go smaller and closer instead: take the one thing they did write and stay with it, in fewer words. Two honest sentences about a single word they chose beats a paragraph about the shape of the data.

Ways to end — pick what fits, and do NOT use the same kind of ending every week: an open question worth sitting with; a plain observation left unresolved; their own words returned to them; or simply stopping. If you use a question, make it one only this week could produce. Never a stock prompt like "What would it look like to…?" or "What might you be protecting?"

Voice: warm, plain, unhurried — a wise friend who listens more than they talk. Short sentences are fine. So are fragments.

Never: give advice, diagnose or name a condition, use therapy jargon ("holding space", "your journey", "sitting with", "showing up for yourself"), use clichés or toxic positivity, flatter, praise them for journalling, or mention you're an AI. If the week was hard, don't rush to a silver lining — sit with it honestly.

If the entries mention self-harm, harming someone else, abuse, or an acute crisis: do not advise, diagnose, or urge them to seek help, and do not end on a question that probes it. Reflect it plainly and gently in their own words, and keep the rest of the reflection shorter than usual.

Return only the reflection — no title, no preamble, no sign-off, no meta-commentary.`;

// ── Entry echo: one warm line back after saving an entry ────────────────────
// The first-session taste of the AI — instant, tiny, cheap (Haiku). Ephemeral:
// returned to the client, never stored.
// "Mirrors what they wrote" licensed exactly one move — paraphrase — and this fires
// on EVERY save, so the trick wore out within a handful of entries. Offering several
// distinct moves is the only lever available for variety (temperature is already 1.0
// on Haiku and rejected outright on Opus).
const ECHO_SYSTEM = `You are the quiet voice inside someone's private journal. They just saved the entry below. Write back exactly ONE line — usually 6–14 words, never more than 18.

Vary what you do. Pick whichever fits THIS entry, and don't reach for the same move every time:
- name the feeling underneath, if they didn't name it themselves
- pick out the one concrete detail carrying the weight
- notice a small contrast — between what they did and what they wanted, or between how the entry starts and ends
- return one of their own phrases, changed only slightly
- just say plainly what happened, so they can see it sitting outside their head

Rules: reply in the SAME language as the entry. Warm, plain, unhurried — a friend who was listening, not a therapist taking notes. Never advice, never questions, never therapy jargon, never flattery, never emoji unless they used one. Never begin with "It sounds like", "It seems like", or "That sounds". If the entry is heavy, stay with it — no silver lining, no reassurance. If it's tiny or mundane, honour it lightly; don't inflate it.

If the entry mentions self-harm, harming someone else, abuse, or an acute crisis: do not advise, diagnose, minimise, or urge them to seek help. Show them in one plain sentence that they were heard.

Return only the line — no quotes around it, no preamble.`;

// Shown when the model declines or returns nothing — most likely on exactly the
// entries where silence would hurt most. Deliberately says only "this was received":
// no advice, no concern, nothing that reads as a machine reacting to distress.
const ECHO_FALLBACK = 'That’s here now, written down.';

// Sonnet, not Haiku. The echo is the single strongest predictor we have of a second
// entry ever being written (91% of accepters reach 2+ vs 10%), it fires on EVERY
// save, and it's the only AI most users ever meet — plenty never reach a Sunday.
// Haiku 4.5 costs ~$0.0005 a call and Sonnet ~$0.001: doubling five hundredths of a
// cent on the output the whole retention story rests on. Revert here if the lines
// don't measurably improve.
const ECHO_MODEL = 'claude-sonnet-5';

// ── Open-thread classifier (drives the mid-week follow-up) ───────────────────
// Returns ONE token. Nothing it sees is stored — only the resulting enum lands in
// api.reflections.open_thread, so no topic, phrase or summary is ever persisted.
//
// 'sensitive' exists to make the follow-up REFUSE to fire, not to escalate anything.
// A scheduled, cheerful "how's it going?" aimed at someone in acute distress is worse
// than silence: it's automated concern with nothing behind it, arriving on a lock
// screen at a moment we know nothing about. The reflection prompt already carries the
// crisis guidance; this classifier's only job here is to stay out of the way.
//
// Defaults to 'none' on any error or unexpected output — silence is the safe failure.
const OPEN_THREAD_SYSTEM = `You read a short weekly reflection that was written for someone about their own journal entries.

Answer with exactly ONE word, nothing else:

none — nothing unresolved; the week reads as settled, ordinary, or already concluded.
thread — an ordinary worry, decision, or situation that is still in motion and that a gentle check-in a few days later would suit. Work stress, a hard conversation, a decision pending, an illness getting better, a strained relationship.
sensitive — signs of acute distress, crisis, grief, self-harm, abuse, or anything where an automated cheerful check-in could land badly.

When uncertain between thread and sensitive, answer sensitive.
When uncertain between none and thread, answer none.`;

const classifyOpenThread = async (
  reflectionText: string,
): Promise<'none' | 'thread' | 'sensitive'> => {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Opus, not the echo's Sonnet. This call decides whether someone in acute
        // distress gets an automated "how's it going?" — the failure that matters is
        // grief or crisis misread as an ordinary worry, and that's a judgment call in
        // the ambiguous middle. One 8-token call per reflection, single-digit weekly
        // volume: the cheapest place in the app to buy better judgment.
        model: REFLECTION_MODEL,
        max_tokens: 8,
        system: OPEN_THREAD_SYSTEM,
        messages: [{ role: 'user', content: reflectionText }],
      }),
    });
    if (!res.ok) return 'none';
    const data = await res.json();
    const word = ((data?.content ?? [])[0]?.text ?? '').trim().toLowerCase();
    if (word.startsWith('thread')) return 'thread';
    if (word.startsWith('sensitive')) return 'sensitive';
    return 'none';
  } catch {
    // Never let classification break reflection generation — it's an add-on.
    return 'none';
  }
};

const callClaudeEcho = async (entryText: string): Promise<string> => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ECHO_MODEL,
      max_tokens: 100,
      system: ECHO_SYSTEM,
      messages: [{ role: 'user', content: entryText }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const line = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();
  // A refusal (or any empty completion) used to leave `line` blank, so the card
  // rendered nothing at all: someone writes the hardest thing they've ever typed,
  // watches "Reading…", and then gets silence. Never leave that moment empty.
  if (!line) return ECHO_FALLBACK;
  return line;
};

const callClaude = async (userMessage: string): Promise<string> => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: REFLECTION_MODEL,
      // Adaptive thinking: "find one true, non-obvious pattern across a week of
      // entries without fabricating" is exactly the analytical task it's for, and
      // omitting the field on Opus 4.8 meant we were paying Opus rates for a
      // non-thinking pass. max_tokens raised with it — thinking and response text
      // share the budget, so 1024 would truncate the reflection mid-sentence.
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: REFLECTION_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('Claude returned no text');
  return text;
};

type Mode = 'week' | 'recent';

const generateForUser = async (
  // `ReturnType<typeof createClient>` describes the DEFAULT, schema-less client —
  // its generics resolve to `never`, so every query built against the `api` schema
  // was rejected at type level (the caller passes a client created with
  // `db: { schema: 'api' }`). Same shape as notifyReflectionReady above.
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  opts: { mode: Mode; force: boolean },
): Promise<Record<string, unknown>> => {
  // Gating: free users get FREE_REFLECTION_LIMIT reflections, then Pro.
  const { data: ent } = await admin
    .from('entitlements')
    .select('is_pro, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  // expires_at must be honoured, matching the enforce_free_entry_limit trigger
  // (`is_pro AND (expires_at IS NULL OR expires_at > now())`). Checking is_pro alone
  // meant a lapsed subscriber whose row still said true was blocked at 7 entries but
  // kept UNLIMITED weekly reflections — the expensive path — indefinitely.
  const row = ent as { is_pro?: boolean; expires_at?: string | null } | null;
  const notExpired = !row?.expires_at || new Date(row.expires_at) > new Date();
  const isPro = row?.is_pro === true && notExpired;
  const { count: reflCount } = await admin
    .from('reflections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (!opts.force && !isPro && (reflCount ?? 0) >= FREE_REFLECTION_LIMIT) {
    return { status: 'limit' };
  }

  // Entries: 'week' = last 7 days (cron); 'recent' = most recent 7 (on-demand test).
  let rows: { content: string; created_at: string }[] = [];
  if (opts.mode === 'week') {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await admin
      .from('journal_entries')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as typeof rows;
  } else {
    const { data, error } = await admin
      .from('journal_entries')
      .select('content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(7);
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as typeof rows).slice().reverse(); // oldest first
  }
  if (rows.length < 2) return { status: 'not_enough', entryCount: rows.length };

  const decrypted = await Promise.all(
    rows.map(async (e) => ({ date: e.created_at, text: await decryptContent(e.content) })),
  );
  const formatted = decrypted
    .map((e) => {
      const label = new Date(e.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      return `[${label}] ${e.text}`;
    })
    .join('\n\n');

  // Density note, branched in code rather than asked of the prompt. The old prompt
  // demanded ONE pattern regardless of how much there was to work with, which on a
  // 3-entry week means inventing one — and 3–5 entries is the most common week.
  const n = rows.length;
  const densityNote =
    n === 2
      ? "Only two entries. Do not look for a pattern across them — there isn't one. Stay with what each says, and keep it under 120 words."
      : n <= 5
        ? "A quiet week. One honest observation is enough; don't stretch for a second."
        : n >= 10
          ? "A full week with several threads. Naming two is fine, and saying they don't connect is fine."
          : '';

  // 'recent' takes the last 7 entries whatever their dates, so calling them "this
  // week" made the model assert "across your week" over what can be months — and
  // it's the DEFAULT path, so it's the first reflection nearly every free user sees.
  const spanIntro =
    opts.mode === 'week'
      ? `This person wrote ${n} ${n === 1 ? 'entry' : 'entries'} this week.`
      : `Here are this person's ${n} most recent entries. They may span far more than one week — do not describe them as "this week".`;

  const reflectionText = await callClaude(
    `${spanIntro}${densityNote ? `\n${densityNote}` : ''}\n\nEntries, oldest first:\n\n${formatted}`,
  );
  const encrypted = await encryptContent(reflectionText);

  // Classify whether anything is still in motion, for the mid-week follow-up. Runs on
  // the REFLECTION text, not the raw entries — the reflection is already a derived
  // summary, so this adds no new exposure, and it keeps the carefully tuned reflection
  // prompt untouched rather than bolting structured output onto it.
  const openThread = await classifyOpenThread(reflectionText);

  const { data: inserted, error: insErr } = await admin
    .from('reflections')
    .insert({
      user_id: userId,
      period_start: decrypted[0].date,
      period_end: decrypted[decrypted.length - 1].date,
      entry_count: rows.length,
      content: encrypted,
      model: REFLECTION_MODEL,
      open_thread: openThread,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(insErr.message);

  return {
    status: 'ok',
    id: (inserted as { id: string }).id,
    reflection: reflectionText,
    entryCount: rows.length,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'api' } });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    userId?: string;
    mode?: string;
    force?: boolean;
    entryId?: string;
  };
  const adminSecret = req.headers.get('X-Admin-Secret');
  const isAdmin = !!ADMIN_SECRET && adminSecret === ADMIN_SECRET;

  // Sunday cron: weekly batch for every opted-in user.
  if (isAdmin && body.action === 'run-weekly') {
    const { data: optedIn } = await admin
      .from('user_settings')
      .select('user_id')
      .eq('ai_reflections_enabled', true);
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    // Push bookkeeping shared across the loop: one Firebase access token per
    // project, stale FCM tokens deleted in one batch at the end.
    const tokenCache = new Map<string, string>();
    const staleTokens: string[] = [];
    for (const row of (optedIn ?? []) as { user_id: string }[]) {
      try {
        const r = await generateForUser(admin, row.user_id, { mode: 'week', force: false });
        if (r.status === 'ok') {
          generated++;
          // The retention loop: tell them their week is ready, or the reflection
          // sits unread until they happen to open the app.
          await notifyReflectionReady(admin, row.user_id, tokenCache, staleTokens);
        } else {
          skipped++;
        }
      } catch (e) {
        failed++;
        console.error('reflection failed for', row.user_id, e);
      }
    }
    if (staleTokens.length > 0) {
      await admin.from('device_tokens').delete().in('fcm_token', staleTokens);
    }
    return json({ generated, skipped, failed });
  }

  // Resolve the target user: admin passes userId; otherwise derive from the JWT.
  // `selfServe` marks the JWT path — the user pressed the button themselves, which
  // is what records AI consent (only once the request actually succeeds).
  let selfServe = false;
  let userId: string | null = null;
  let force = false;
  if (isAdmin && body.userId) {
    userId = body.userId;
    force = body.force === true;
  } else {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    userId = user?.id ?? null;
    selfServe = true;
  }
  if (!userId) return new Response('Unauthorized', { status: 401, headers: CORS });

  // Entry echo: one warm line back for a just-saved entry. Consent is recorded by
  // the client when the user accepts the echo card (it writes user_settings before
  // ever calling here). Ephemeral — nothing stored.
  if (body.action === 'echo' && body.entryId) {
    try {
      const { data: entry } = await admin
        .from('journal_entries')
        .select('content')
        .eq('id', body.entryId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!entry) return json({ status: 'error', message: 'entry not found' }, 404);
      const text = await decryptContent((entry as { content: string }).content);
      const line = await callClaudeEcho(text);
      // Metric only — the echo text itself is never stored. Fire-and-forget.
      admin
        .from('echo_log')
        .insert({ user_id: userId })
        .then(() => {});
      return json({ status: 'ok', line });
    } catch (e) {
      console.error('entry echo error', e);
      return json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  const mode: Mode = body.mode === 'week' ? 'week' : 'recent';
  try {
    const result = await generateForUser(admin, userId, { mode, force });
    // Pressing "Write my first reflection" IS the consent — but only record it once
    // the request actually produced one. Recording it up front (as this used to)
    // opted users into the weekly cron off the back of a call they watched fail
    // with "not enough to reflect on" or the free limit.
    if (selfServe && result.status === 'ok') {
      const now = new Date().toISOString();
      await admin
        .from('user_settings')
        .upsert(
          { user_id: userId, ai_reflections_enabled: true, ai_consent_at: now, updated_at: now },
          { onConflict: 'user_id' },
        );
    }
    return json(result);
  } catch (e) {
    console.error('generate-reflection error', e);
    return json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
