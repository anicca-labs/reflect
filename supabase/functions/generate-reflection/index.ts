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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_PUSH_SECRET');
const FREE_REFLECTION_LIMIT = 3;

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

const b64ToBytes = (b64: string): Uint8Array => {
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

// ── The reflection prompt ────────────────────────────────────────────────────
const REFLECTION_SYSTEM = `You are the quiet, perceptive voice inside someone's private journal. Once a week you read what they wrote and reflect it back — not to advise or fix, but to help them see their own week more clearly than they can from inside it.

You'll receive this week's entries in order, with dates. Write a short reflection (about 150–200 words), shaped like this:

1. Open with ONE specific pattern you noticed across the week — something they might not have seen themselves. Ground it in their own words: quote a short phrase or two of theirs verbatim so they know you truly read it.
2. Name the one moment that stood out — the lightest, hardest, or most honest thing they wrote.
3. End with a single open question for them to sit with. A real question, not advice in disguise. Never tell them what to do.

Voice: warm, plain, unhurried — a wise friend who listens more than they talk. Second person ("you").

Never: give advice, diagnose, use therapy jargon ("holding space", "your journey"), use clichés or toxic positivity, flatter, or mention you're an AI. If the week was hard, don't rush to a silver lining — sit with it honestly. If there are only one or two entries, stay brief and gentle; don't invent patterns that aren't there.

Return only the reflection — no title, no preamble, no sign-off, no meta-commentary.`;

const callClaude = async (userMessage: string): Promise<string> => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: { effort: 'medium' },
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
  admin: ReturnType<typeof createClient>,
  userId: string,
  opts: { mode: Mode; force: boolean },
): Promise<Record<string, unknown>> => {
  // Gating: free users get FREE_REFLECTION_LIMIT reflections, then Pro.
  const { data: ent } = await admin
    .from('entitlements')
    .select('is_pro')
    .eq('user_id', userId)
    .maybeSingle();
  const isPro = (ent as { is_pro?: boolean } | null)?.is_pro === true;
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

  const reflectionText = await callClaude(
    `Here are this week's journal entries, oldest first:\n\n${formatted}`,
  );
  const encrypted = await encryptContent(reflectionText);

  const { data: inserted, error: insErr } = await admin
    .from('reflections')
    .insert({
      user_id: userId,
      period_start: decrypted[0].date,
      period_end: decrypted[decrypted.length - 1].date,
      entry_count: rows.length,
      content: encrypted,
      model: 'claude-opus-4-8',
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
    for (const row of (optedIn ?? []) as { user_id: string }[]) {
      try {
        const r = await generateForUser(admin, row.user_id, { mode: 'week', force: false });
        r.status === 'ok' ? generated++ : skipped++;
      } catch (e) {
        failed++;
        console.error('reflection failed for', row.user_id, e);
      }
    }
    return json({ generated, skipped, failed });
  }

  // Resolve the target user: admin passes userId; otherwise derive from the JWT.
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
    // First self-generate is explicit consent — record it so the Sunday cron
    // picks them up going forward (toggle-able off in Settings).
    if (userId) {
      const now = new Date().toISOString();
      await admin
        .from('user_settings')
        .upsert(
          { user_id: userId, ai_reflections_enabled: true, ai_consent_at: now, updated_at: now },
          { onConflict: 'user_id' },
        );
    }
  }
  if (!userId) return new Response('Unauthorized', { status: 401, headers: CORS });

  const mode: Mode = body.mode === 'week' ? 'week' : 'recent';
  try {
    const result = await generateForUser(admin, userId, { mode, force });
    return json(result);
  } catch (e) {
    console.error('generate-reflection error', e);
    return json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
