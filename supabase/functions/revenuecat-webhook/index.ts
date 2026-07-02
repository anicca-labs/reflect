// @openapi-internal — called only by RevenueCat's webhook, not by app clients
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchProState } from '../_shared/revenuecat.ts';

// Mirrors RevenueCat entitlement state into api.entitlements so the database can
// enforce the free-entry limit (see the enforce_free_entry_limit trigger).
//
// Auth: RevenueCat sends a fixed `Authorization` header on every webhook; we
// compare it to REVENUECAT_WEBHOOK_TOKEN. That's the only gate, so this MUST be
// deployed with --no-verify-jwt (no Supabase JWT is present on a RevenueCat call).
//
// IMPORTANT: the webhook body is NOT cryptographically signed — RevenueCat only
// echoes the shared secret. So we do NOT trust the payload's entitlement claim.
// The event is used only to identify WHICH customer changed; we then re-query
// RevenueCat's authoritative API for that customer and write what IT reports.
// This means even a leaked token can't be used to forge a Pro grant.

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
};

// Length-independent constant-time comparison (compares SHA-256 digests, which
// are fixed size, so the length of the expected token isn't leaked via timing).
const secretMatches = async (provided: string, expected: string): Promise<boolean> => {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
};

// A RevenueCat app_user_id is this app's Supabase user id (Purchases.logIn).
// Anonymous ids ($RCAnonymousID:…) have no user to map to, so they're ignored.
const resolveUserId = (event: RevenueCatEvent): string | null => {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return candidates.find((id): id is string => !!id && uuid.test(id)) ?? null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN');
  const provided = req.headers.get('Authorization') ?? '';
  if (!expected || !(await secretMatches(provided, expected))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: RevenueCatEvent;
  try {
    const parsed = await req.json();
    event = parsed?.event ?? {};
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const userId = resolveUserId(event);
  // 200 so RevenueCat doesn't retry an event we can't act on (anonymous / test).
  if (!userId) return new Response('ignored: no resolvable user', { status: 200 });

  // Re-query RevenueCat — never trust the (unsigned) payload for the grant.
  const state = await fetchProState(userId);
  if (!state) return new Response('RevenueCat unavailable', { status: 502 }); // RC will retry

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );
  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: userId,
      is_pro: state.isPro,
      expires_at: state.expiresAt,
      event_type: event.type ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[revenuecat-webhook] upsert failed:', error.message);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
