// @openapi-internal — called only by RevenueCat's webhook, not by app clients
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
const PRO_ENTITLEMENT = 'pro';

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

// Authoritative Pro state straight from RevenueCat (not from the webhook body).
// Returns null on a transient RC failure so the caller can 502 and let RC retry.
const fetchProState = async (
  userId: string,
): Promise<{ isPro: boolean; expiresAt: string | null } | null> => {
  const rcKey = Deno.env.get('REVENUECAT_API_KEY');
  const projectId = Deno.env.get('REVENUECAT_PROJECT_ID');
  if (!rcKey || !projectId) return null;

  const res = await fetch(
    `https://api.revenuecat.com/v2/projects/${projectId}/customers/${userId}/active_entitlements`,
    { headers: { Authorization: `Bearer ${rcKey}` } },
  );
  // 404 = RevenueCat has never seen this customer → definitively not Pro.
  if (!res.ok) return res.status === 404 ? { isPro: false, expiresAt: null } : null;

  const body = await res.json();
  const pro = (body.items ?? []).find(
    (e: { entitlement_id?: string; lookup_key?: string }) =>
      e.entitlement_id === PRO_ENTITLEMENT || e.lookup_key === PRO_ENTITLEMENT,
  ) as { expires_at?: number | string | null } | undefined;

  let expiresAt: string | null = null;
  if (pro?.expires_at != null) {
    const d = new Date(pro.expires_at);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) expiresAt = d.toISOString();
  }
  return { isPro: !!pro, expiresAt };
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
    return new Response('Internal error', { status: 500 }); // generic body, details logged
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
