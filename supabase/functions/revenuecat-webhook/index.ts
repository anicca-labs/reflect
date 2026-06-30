import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mirrors RevenueCat entitlement state into api.entitlements so the database can
// enforce the free-entry limit (see the enforce_free_entry_limit trigger).
//
// Auth: RevenueCat is configured to send a fixed `Authorization` header on every
// webhook; we compare it to REVENUECAT_WEBHOOK_TOKEN in constant time. This is
// the function's only gate, so it MUST be deployed with --no-verify-jwt (no
// Supabase JWT is present on a RevenueCat call).
//
// The entitlement this app gates on. Matches PRO_ENTITLEMENT in useRevenueCat.
const PRO_ENTITLEMENT = 'pro';

// Event types after which the entitlement is no longer granted. Everything else
// (purchase, renewal, uncancellation, product change, billing issue/grace,
// non-renewing purchase, transfer, extension) leaves the user holding the
// entitlement until `expiration_at_ms` — and the trigger re-checks that against
// now() on every insert, so a lapsed-but-not-yet-EXPIRED grant still blocks.
const REVOKING_EVENTS = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  // RevenueCat may deliver several ids for one customer; the original is stable.
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};

// A RevenueCat app_user_id is this app's Supabase user id (set via
// Purchases.logIn(userId)). Anonymous ids ($RCAnonymousID:…) have no user to map
// to, so they're ignored.
const resolveUserId = (event: RevenueCatEvent): string | null => {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return candidates.find((id): id is string => !!id && uuid.test(id)) ?? null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN');
  const provided = req.headers.get('Authorization') ?? '';
  if (!expected || !timingSafeEqual(provided, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = body?.event ?? {};
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const userId = resolveUserId(event);
  // 200 so RevenueCat doesn't retry an event we can't (and shouldn't) act on,
  // e.g. anonymous purchases or test pings.
  if (!userId) return new Response('ignored: no resolvable user', { status: 200 });

  const grantsPro =
    !REVOKING_EVENTS.has(event.type ?? '') &&
    (event.entitlement_ids ?? []).includes(PRO_ENTITLEMENT);

  const expiresAt =
    grantsPro && event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'api' } },
  );

  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: userId,
      is_pro: grantsPro,
      expires_at: expiresAt,
      event_type: event.type ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ ok: true, user_id: userId, is_pro: grantsPro }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
